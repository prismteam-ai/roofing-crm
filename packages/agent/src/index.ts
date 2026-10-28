import {
  propertyMatchesQuery,
  compareQueryRows,
} from "../../contracts/src/query-predicates";
import { resolveQueryPlace } from "../../places/src/index";
import { requireIntent } from "./intent";
import type { IntentOptions, IntentPlan } from "./intent/types";
import type { GroundedFailureDetail } from "./failure-detail";
import { propertyEvidence } from "../../map-domain/src/signals";
import { tool } from "ai";
import {
  DomainError,
  QuerySchema,
  type QueryInput,
  type SearchResponse,
} from "../../contracts/src/index";
import type { OracleReader } from "../../oracle-client/src/index";
export interface AgentAnswer {
  intent?: IntentPlan;
  modelAudit?: {
    modelId: string;
    region: "us-east-1";
    promptRevision: "base" | "repair-1";
    promptDigest: string;
    architecture?: "one-call-grounded-selection-v1";
    evidenceDigest?: string;
    minimizedRowCount?: number;
    inputTokens: number;
    outputTokens: number;
    converseCalls: number;
    reservedMicroUsd: number;
    measuredMicroUsd: number;
    failureCode?: string;
    failureDetail?: GroundedFailureDetail;
    unmeasuredCalls?: number;
  };
  mode:
    | "deterministic-offline"
    | "deterministic-fallback"
    | "bedrock-grounded"
    | "evidence-empty";
  answer: string;
  query: QueryInput;
  results: SearchResponse["rows"];
  citations: string[];
  caveats: string[];
  toolTrace: {
    tool: "searchRoofingEvidence";
    queryHash: string;
    snapshotId: string;
    resultCount: number;
    totalMatched?: number;
    arguments?: QueryInput;
    contextRows?: number;
    contextTruncated?: boolean;
    modelSawMinimizedFacts?: boolean;
    evidenceDigest?: string;
    minimizedRowCount?: number;
    retrievedRowCount?: number;
    selectedOrdinals?: number[];
    rationaleCategories?: string[];
    presentationTool?: "selectGroundedEvidence";
    presentationArgumentsDigest?: string;
    providerArgumentsDigest?: string;
    argumentsDigest?: string;
    resultDigest?: string;
    clampedFields?: string[];
  }[];
}
export { interpretIntent, requireIntent, IntentRejection } from "./intent";
export type {
  IntentPlan,
  ConstraintLedgerEntry,
  PlaceResolver,
} from "./intent/types";
export function interpretPrompt(
  prompt: string,
  base: QueryInput,
  options: IntentOptions = {},
): QueryInput {
  return requireIntent(prompt, base, options).query;
}
/** Explicit constraints are honored or refused; no implicit radius/page min-clamping. */
export function boundedEvidenceQuery(
  prompt: string,
  base: QueryInput,
  maxRows = 50,
  options: IntentOptions = {},
) {
  return requireIntent(prompt, base, { ...options, maxRows }).query;
}
/** AI SDK tool schema is shared with the deterministic offline provider. No inference occurs. */
export function createEvidenceTool(reader: OracleReader) {
  return tool({
    description:
      "Read snapshot-bound roofing opportunities and their evidence only.",
    inputSchema: QuerySchema,
    execute: async (input) => reader.search(input),
  });
}
export async function answerQuestion(
  reader: OracleReader,
  prompt: string,
  base: QueryInput,
  options: IntentOptions = {},
): Promise<AgentAnswer> {
  const intent = requireIntent(prompt, base, options);
  const data = await reader.search(intent.query);
  return withIntent(answerFromEvidence(data, intent.query), intent);
}
/** One typed plan is attached to every success, empty result and deterministic fallback. */
export function withIntent(
  answer: AgentAnswer,
  intent: IntentPlan,
): AgentAnswer {
  return {
    ...answer,
    intent,
    caveats: [
      ...answer.caveats,
      ...(intent.ledger.some(
        (x) => x.normalizedMeaning === "long_duration_priority",
      )
        ? [
            "Long-open priority orders observed durations; no numeric minimum or stalled-work claim was requested or invented.",
          ]
        : []),
    ],
  };
}
/** Business-predicate check independent of interpreting the same query; invalid backend rows cannot become model context or fallback matches. */
export function assertEvidencePredicates(
  data: SearchResponse,
  query: QueryInput,
) {
  if (data.snapshotId !== query.snapshotId)
    throw new DomainError("SNAPSHOT_UNAVAILABLE", "Evidence snapshot mismatch");
  const place = resolveQueryPlace(query);
  if (
    (place && JSON.stringify(data.placeResolution) !== JSON.stringify(place)) ||
    (!place && data.placeResolution)
  )
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Evidence did not retain the validated official place binding",
    );
  if (data.rows.some((row) => !propertyMatchesQuery(row, query)))
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Retrieved evidence violated a validated source predicate (radius, roof, owner, sale or qualifying permit evidence)",
    );
  if (
    data.rows.some(
      (row, i) => i > 0 && compareQueryRows(data.rows[i - 1], row, query) > 0,
    )
  )
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Retrieved evidence violated the authoritative result order",
    );
}
/** Render only already retrieved server evidence; fallback needs no extra read when the model has exhausted its tool budget. */
export function answerFromEvidence(
  data: SearchResponse,
  query: QueryInput,
  mode: AgentAnswer["mode"] = "deterministic-offline",
  selectedOrdinals?: number[],
): AgentAnswer {
  assertEvidencePredicates(data, query);
  if (
    selectedOrdinals &&
    (mode !== "bedrock-grounded" ||
      new Set(selectedOrdinals).size !== selectedOrdinals.length ||
      selectedOrdinals.some(
        (n) => !Number.isInteger(n) || n < 0 || n >= data.rows.length,
      ) ||
      (data.rows.length > 0 && selectedOrdinals.length === 0) ||
      (query.sort &&
        selectedOrdinals.some((n, i) => i > 0 && n <= selectedOrdinals[i - 1])))
  )
    throw new DomainError(
      "INVALID_INPUT",
      "Invalid selected source ordinals or result order",
    );
  const rows = selectedOrdinals
    ? selectedOrdinals.map((n) => data.rows[n])
    : data.rows;
  if (data.snapshotId !== query.snapshotId)
    throw new DomainError("SNAPSHOT_UNAVAILABLE", "Evidence snapshot mismatch");
  if (
    mode === "evidence-empty" &&
    (data.total !== 0 ||
      data.rows.length !== 0 ||
      data.truncated ||
      data.nextCursor)
  )
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Empty evidence mode requires a complete zero-match response",
    );
  const citations = [
    ...new Set(
      rows.flatMap((p) =>
        propertyEvidence(p).map((s) => `${s.sourceId}:${s.recordId}`),
      ),
    ),
  ];
  const unknown = rows.filter((p) => p.roof.ageYears === null).length;
  return {
    mode,
    query,
    results: rows,
    citations,
    caveats: [
      ...data.limitations,
      mode === "bedrock-grounded"
        ? "One bounded model call selected presentation order from a minimized projection of retrieved facts. The server renders authoritative facts and citations from selected source records; actual match and retrieved-page counts remain distinct."
        : mode === "evidence-empty"
          ? "No matching source records were returned by this bounded query. The model was not called; this is source evidence, not a model success or proof of permit absence."
          : mode === "deterministic-fallback"
            ? "The model did not produce an accepted grounded selection. This response uses deterministic evidence fallback; it is not a model success."
            : "This response uses deterministic retrieval, with no model inference. Snapshot coverage and unavailable evidence remain explicit.",
      ...(unknown
        ? [`${unknown} returned properties have unknown roof age.`]
        : []),
      "Building year is a low-confidence roof proxy, not a roof installation or replacement date. Issued alone is not open; duration requires explicit open status and a date.",
      "No contractor identity, license or rating is inferred from a reported name. Missing acquired permits do not prove no permit exists.",
    ],
    answer: `I found ${data.total} matching ${data.total === 1 ? "property" : "properties"} within ${query.radiusMeters / 1609.344} miles. ${query.roofMinAgeYears !== undefined ? `Roof-age threshold: ${query.roofMinAgeYears} years. ` : ""}${query.permitStatus === "open" ? `Open permits${query.minOpenDays ? ` for at least ${query.minOpenDays} days` : ""}. ` : query.permitStatus === "closed" ? "Closed permits. " : query.permitStatus === "unknown" ? "Acquired permit status unknown. " : ""}${query.minReportedSaleAgeYears !== undefined ? `Last reported sale observed more than ${query.minReportedSaleAgeYears} years ago; this is partial observed history, not uninterrupted ownership tenure. ` : ""}${mode === "bedrock-grounded" ? "The selected presentation" : "This bounded page"} contains ${rows.length} records. Snapshot ${data.snapshotId}; query ${data.queryHash}. Review each source and confidence before qualifying a lead.`,
    toolTrace: [
      {
        tool: "searchRoofingEvidence",
        queryHash: data.queryHash,
        snapshotId: data.snapshotId,
        resultCount: rows.length,
        totalMatched: data.total,
        arguments: query,
      },
    ],
  };
}
