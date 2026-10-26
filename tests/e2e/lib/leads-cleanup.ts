// B-07 test cleanup (GAP-3: no lead-delete exists in the product, and a second create on the same
// property is refused by design, so reruns need the four test leads removed first). Deletes ONLY
// items whose pk is one of the (at most four) allow-listed test-lead keys from DynamoDB `crm-leads`
// in the region named by AWS_REGION (CI sets it from `vars.AWS_REGION`; the region is never
// hard-coded), using the default AWS credential chain. Credentials are never read or printed
// here; any other pk is refused before a request is made.
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  QueryCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";

/** The table's fixed name (infra/lib/crm-data-stack.ts `tableName`), the same in every region.
 *  Kept a constant on purpose: the `crm-ci` IAM policy is scoped to this one table, and this
 *  helper must never be pointed at any other. */
export const LEADS_TABLE = "crm-leads";

const LEAD_KEY_PATTERN = /^48453:tcad:[A-Za-z0-9_-]+$/;
const MAX_ALLOWED_KEYS = 4;
const BATCH_LIMIT = 25; // BatchWriteItem accepts at most 25 requests per call.
const REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d+$/;

/** The region the leads table lives in, from AWS_REGION. Throws a clear error when it is unset,
 *  empty or not a region name: cleanup is then impossible, and guessing a region could delete
 *  from (or silently miss) the wrong table. */
export function leadsRegion(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const region = env.AWS_REGION?.trim() ?? "";
  if (region === "") {
    throw new Error(
      "leads cleanup: AWS_REGION is not set; set it to the region of the crm-leads table (CI: vars.AWS_REGION)",
    );
  }
  if (!REGION_PATTERN.test(region)) {
    throw new Error(`leads cleanup: AWS_REGION "${region}" is not an AWS region name`);
  }
  return region;
}

/** True when the AWS default credential chain can produce credentials. Used only to decide whether
 *  CI can run the lead specs (it has no AWS credentials); nothing is read from or printed of them.
 *  Needs no region: the SDK reads AWS_REGION itself, and resolving credentials sends no request. */
export async function awsCredentialsAvailable(): Promise<boolean> {
  try {
    await new DynamoDBClient({}).config.credentials();
    return true;
  } catch {
    return false;
  }
}

export interface LeadsCleanup {
  /** The frozen allow-list: the only pks this helper will ever touch. */
  readonly allowed: readonly string[];
  /** Deletes every item under each pk; returns the number of items removed. */
  deleteLeads(leadKeys: readonly string[]): Promise<number>;
}

/** `allowedLeadKeys` are the `48453:tcad:{request_identifier}` keys of the test leads: three real
 *  properties (the spec reads each request identifier from the live index, never guesses it) plus
 *  the B07STALE fixture. `env` supplies AWS_REGION (default `process.env`); it is read only after
 *  the allow-list has been validated. */
export function createLeadsCleanup(
  allowedLeadKeys: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): LeadsCleanup {
  if (allowedLeadKeys.length === 0 || allowedLeadKeys.length > MAX_ALLOWED_KEYS) {
    throw new Error(`leads cleanup: the allow-list must hold 1 to ${MAX_ALLOWED_KEYS} lead keys`);
  }
  for (const key of allowedLeadKeys) {
    if (!LEAD_KEY_PATTERN.test(key)) throw new Error(`leads cleanup: "${key}" is not a lead key`);
  }
  const allowed = Object.freeze([...allowedLeadKeys]);
  const client = new DynamoDBClient({ region: leadsRegion(env) });

  async function deleteLeads(leadKeys: readonly string[]): Promise<number> {
    for (const key of leadKeys) {
      if (!allowed.includes(key)) {
        throw new Error(`leads cleanup refused: "${key}" is not in the allow-list`);
      }
    }
    let removed = 0;
    for (const key of leadKeys) {
      const keys: Record<string, AttributeValue>[] = [];
      let startKey: Record<string, AttributeValue> | undefined;
      do {
        const page = await client.send(
          new QueryCommand({
            TableName: LEADS_TABLE,
            KeyConditionExpression: "pk = :pk",
            ExpressionAttributeValues: { ":pk": { S: key } },
            ProjectionExpression: "pk, sk",
            // Explicit (it is also the default with a projection): the CI user's IAM policy
            // requires dynamodb:Select = SPECIFIC_ATTRIBUTES (infra/lib/crm-ci-user.ts).
            Select: "SPECIFIC_ATTRIBUTES",
            ConsistentRead: true,
            ...(startKey === undefined ? {} : { ExclusiveStartKey: startKey }),
          }),
        );
        for (const item of page.Items ?? []) {
          if (item.pk?.S !== key || item.sk === undefined) continue; // never delete a stray pk
          keys.push({ pk: item.pk, sk: item.sk });
        }
        startKey = page.LastEvaluatedKey;
      } while (startKey !== undefined);

      for (let i = 0; i < keys.length; i += BATCH_LIMIT) {
        let pending: Record<string, { DeleteRequest: { Key: Record<string, AttributeValue> } }[]> =
          {
            [LEADS_TABLE]: keys
              .slice(i, i + BATCH_LIMIT)
              .map((Key) => ({ DeleteRequest: { Key } })),
          };
        // Unprocessed items (throttling) are retried until the batch is empty.
        while (Object.values(pending).some((requests) => requests.length > 0)) {
          const out = await client.send(new BatchWriteItemCommand({ RequestItems: pending }));
          pending = (out.UnprocessedItems ?? {}) as typeof pending;
        }
      }
      removed += keys.length;
    }
    return removed;
  }

  return { allowed, deleteLeads };
}
