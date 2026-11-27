import { createLeadsRepo, documentClient } from "@crm/leads-db";
import { createOracleData } from "@crm/oracle-data";
import type { Deps } from "./context.ts";
import type { Env } from "./env.ts";
import { seedLeads } from "./seed-leads.ts";

export function createDeps(env: Env): Deps {
  const oracle = createOracleData({
    apiUrl: env.ORACLE_API_URL,
    expectedManifestCid: env.ORACLE_MANIFEST_CID,
  });
  const leads = createLeadsRepo({
    doc: documentClient({ endpoint: env.DYNAMODB_ENDPOINT }),
    tableName: env.LEADS_TABLE,
    leadCreatesPerDay: env.LEAD_CREATES_PER_DAY,
  });
  return { oracle, leads, seed: () => seedLeads(oracle) };
}
