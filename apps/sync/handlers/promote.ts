// Promote (T022, INDEX group, espeon): flips META#index.current atomically via a DynamoDB
// conditional write guarded on the previous pointer value — never for a Held or partially-written
// run (constitution P0-3: "no partial promotion" is absolute). Reuses the existing crm-leads
// DynamoDB table for the META#index pointer item (architecture-constitution.md §9 — no new
// table). Emits SyncDurationMs (elapsed time from this run's Plan start to this Promote
// completion) on a successful promotion — the one metric-emission point for the whole pipeline's
// duration (NFR-001/SC-005).
import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import { withObservability, METRIC_NAMES, type Observability } from "@crm/observability";
import type { IndexMeta } from "@crm/index-schema";

export interface PromoteInput {
  indexMeta: IndexMeta;
  tableName: string;
  /** Plan's recorded run-start timestamp (ISO), threaded through the state machine's own
   *  payload from Plan through to this step — not re-read from a side store (T024/T022's cross-
   *  task data dependency, per tasks.md's Dependencies section). */
  planStartedAt: string;
}

export interface PromoteOutput {
  manifestCid: string;
  /** false only on the documented no-op path: this manifestCid is already the promoted one. */
  promoted: boolean;
  syncDurationMs: number | null;
}

const PK = "META#index";
/** crm-leads has a pk+sk key (B-07); the pointer item lives at sk "META". */
const SK = "META";

async function promoteCore(
  input: PromoteInput,
  ddb: DynamoDBDocumentClient,
  obs: Observability,
): Promise<PromoteOutput> {
  // P0-3: the pointer is never flipped for a Held or partially-written run, under any condition.
  if (input.indexMeta.status !== "Validated") {
    throw new Error(
      `Promote: refusing to flip META#index for a non-Validated run (status "${input.indexMeta.status}")`,
    );
  }

  const promotedAt = new Date().toISOString();

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: input.tableName,
        Key: { pk: PK, sk: SK },
        // Guarded on the previous value: either the item does not exist yet (first-ever
        // promotion) or its current pointer is not already this manifestCid — a second Promote
        // call for an already-promoted manifestCid fails this condition and is a no-op, never a
        // duplicate write. "current"/"previous" are both DynamoDB reserved keywords (found live:
        // ValidationException), hence the #-aliases.
        //
        // CR-B-02 finding #1: propertyCount/permitCount/promotedAt are written here too, not just
        // #current/#previous. Validate (apps/sync/handlers/validate.ts) reads propertyCount back
        // off this same item for its >5%-row-drop-hold check (constitution §10/SC-006) — without
        // this write, that check was always comparing against `undefined`/`null` and could never
        // fire. The API's LeadIndex adapter (apps/api/src/adapters/duckDbParquet.ts's
        // indexInfo()) reads the same three fields for its own IndexInfo response.
        UpdateExpression:
          "SET #previous = if_not_exists(#current, :noPrevious), #current = :next, propertyCount = :propertyCount, permitCount = :permitCount, promotedAt = :promotedAt",
        ConditionExpression: "attribute_not_exists(#current) OR #current <> :next",
        ExpressionAttributeNames: { "#current": "current", "#previous": "previous" },
        ExpressionAttributeValues: {
          ":next": input.indexMeta.manifestCid,
          // First-ever promotion: no #current to copy yet (found live on the first real table).
          ":noPrevious": null,
          ":propertyCount": input.indexMeta.propertyCount,
          ":permitCount": input.indexMeta.permitCount,
          ":promotedAt": promotedAt,
        },
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      obs.logger.info("Promote: no-op, this manifestCid is already promoted", {
        manifestCid: input.indexMeta.manifestCid,
      });
      return { manifestCid: input.indexMeta.manifestCid, promoted: false, syncDurationMs: null };
    }
    throw error;
  }

  const syncDurationMs = Date.now() - Date.parse(input.planStartedAt);
  obs.metrics.addMetric(METRIC_NAMES.SyncDurationMs, MetricUnit.Milliseconds, syncDurationMs);
  obs.logger.info("Promote: META#index.current flipped", {
    manifestCid: input.indexMeta.manifestCid,
    syncDurationMs,
  });

  return { manifestCid: input.indexMeta.manifestCid, promoted: true, syncDurationMs };
}

const defaultDdb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const promoteHandler = withObservability(
  "Promote",
  (event: PromoteInput, obs: Observability) => promoteCore(event, defaultDdb, obs),
);

/** Exported for tests: the same core logic with an injected DynamoDBDocumentClient (aws-sdk-
 *  client-mock), so a test never needs a real AWS account to prove the conditional-write and
 *  no-op behavior. */
export const promoteWithClient = promoteCore;
