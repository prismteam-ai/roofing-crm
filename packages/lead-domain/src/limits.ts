import { DomainError, type Lead } from "../../contracts/src/index";
/** Stay below DynamoDB's item limit; reject before persistence without truncating audit history. */
export function boundedLead(lead: Lead): Lead {
  if (Buffer.byteLength(JSON.stringify(lead)) > 300000)
    throw new DomainError(
      "COST_LIMIT_REACHED",
      "Lead history reached the review storage bound; existing history was preserved",
    );
  return lead;
}
