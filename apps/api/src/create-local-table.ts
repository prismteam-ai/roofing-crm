import { createLeadsTable, documentClient } from "@crm/leads-db";
import { loadEnv } from "./env.ts";

/** `pnpm --filter @crm/api db:create`: the leads table on DynamoDB Local (development only). */
const env = loadEnv();
if (!env.DYNAMODB_ENDPOINT) throw new Error("DYNAMODB_ENDPOINT is not set; hosted tables are created by CDK");
await createLeadsTable(documentClient({ endpoint: env.DYNAMODB_ENDPOINT }), env.LEADS_TABLE).catch(
  (e: Error) => {
    if (e.name !== "ResourceInUseException") throw e;
  },
);
console.log(`table ${env.LEADS_TABLE} ready on ${env.DYNAMODB_ENDPOINT}`);
