import { CreateTableCommand, DynamoDBClient, UpdateTimeToLiveCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export function documentClient(opts: { endpoint?: string; region?: string } = {}): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: opts.region ?? process.env.AWS_REGION ?? "us-east-2",
    ...(opts.endpoint
      ? { endpoint: opts.endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } }
      : {}),
  });
  return DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
}

/** The table as CDK creates it (Task 11): pk/sk, GSI1 for listing by status, TTL on expiresAt. */
export async function createLeadsTable(doc: DynamoDBDocumentClient, tableName: string): Promise<void> {
  await doc.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
        { AttributeName: "gsi1pk", AttributeType: "S" },
        { AttributeName: "gsi1sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "gsi1pk", KeyType: "HASH" },
            { AttributeName: "gsi1sk", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
  );
  await doc
    .send(
      new UpdateTimeToLiveCommand({
        TableName: tableName,
        TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
      }),
    )
    .catch(() => {}); // DynamoDB Local accepts but ignores TTL on some versions
}
