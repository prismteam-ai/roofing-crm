import { CAMPAIGN_PHASE, CAMPAIGN_LIMITS } from "../../agent/src/campaign";
import type { QuotaInput, QuotaStore } from "./quota";
/** A phase selects a separate durable allowance; redeploying never resets a key. */
export async function consumeHostedRequestQuota(
  store: QuotaStore,
  subject: string,
  category: QuotaInput["category"],
  nowMs: number,
) {
  const limits = {
    read: 600,
    write: 100,
    auth: 10,
    model: CAMPAIGN_LIMITS.requestsPerSessionHour,
  };
  await store.consume({
    subject: category === "model" ? `${subject}#${CAMPAIGN_PHASE}` : subject,
    category,
    limit: limits[category],
    windowSeconds: category === "auth" ? 60 : 3600,
    nowMs,
  });
  if (category === "model")
    await store.consume({
      subject: `global-model-budget#${CAMPAIGN_PHASE}`,
      category,
      limit: CAMPAIGN_LIMITS.requestsPerDay,
      windowSeconds: 86400,
      nowMs,
    });
}
