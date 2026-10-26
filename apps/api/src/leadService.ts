// Lazy singleton for the B-07 lead service, the same pattern as leadIndex.ts's `tryLeadIndex`:
// built once per Lambda sandbox from env vars (CRM_LEADS_TABLE_NAME, region from the Lambda's own
// AWS_REGION via the SDK default chain, never hard-coded). This is the one place the concrete
// DynamoDB `LeadRepo` is instantiated and injected into `createLeadService`.
import { createDynamoLeadRepoFromEnv, type LeadRepo } from "./adapters/leadRepo.js";
import { createLeadService, type LeadService } from "./services/leads.js";
import { tryLeadIndex } from "./leadIndex.js";

let cached: LeadService | undefined;
let cachedRepo: LeadRepo | undefined;
let overridden = false;

/** The one DynamoDB `LeadRepo` of this sandbox, shared by the lead service and the agent (its
 *  "already a lead" check and lead proposals). Never throws; undefined without a table name. */
export function tryLeadRepo(): LeadRepo | undefined {
  if (cachedRepo === undefined) {
    const table = process.env.CRM_LEADS_TABLE_NAME;
    if (table === undefined || table === "") return undefined;
    cachedRepo = createDynamoLeadRepoFromEnv();
  }
  return cachedRepo;
}

/** Never throws: a missing table name must not break health/auth routes; `requireLeadService`
 *  turns the absence into a typed error at the procedures that need it. */
export function tryLeadService(): LeadService | undefined {
  if (overridden) return cached;
  if (cached === undefined) {
    const repo = tryLeadRepo();
    if (repo === undefined) return undefined;
    const leadIndex = tryLeadIndex();
    cached = createLeadService(repo, leadIndex ? { leadIndex } : {});
  }
  return cached;
}

export function setLeadServiceForTest(service: LeadService | undefined): void {
  cached = service;
  overridden = true;
}
