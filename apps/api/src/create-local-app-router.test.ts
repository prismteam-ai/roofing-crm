/**
 * Local tRPC: search.inRadius then leads.create persists in process memory.
 */
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { describe, expect, it } from "vitest";
import { createLocalAppRouter } from "./create-local-app-router.js";
import type { ApiContext } from "./trpc.js";

function createTestApiContext(): ApiContext {
  const serviceName = "roofing-crm-api-local-test";
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ serviceName, namespace: "RoofingCrmApiLocalTest" }),
  };
}

describe("createLocalAppRouter", () => {
  // Given local tRPC with Lee stand-in parcels
  // When search.inRadius then leads.create then leads.list run
  // Then the lead snapshot uses the searched street and survives a new caller on the same router
  it("search then convert then list keeps the lead in process memory", async () => {
    const appRouter = createLocalAppRouter({
      nowIso: () => "2026-08-21T23:00:00.000Z",
    });
    const caller = appRouter.createCaller(createTestApiContext());

    const candidates = await caller.search.inRadius({
      county: "lee",
      center: { lat: 26.6406, lng: -81.8723 },
      radiusMiles: 5,
    });

    expect(
      candidates.some(
        (candidate) => candidate.propertyId === "lee-prop-browser-verify",
      ),
    ).toBe(true);
    expect(
      candidates.some(
        (candidate) => candidate.propertyId === "lee-prop-outside-default-radius",
      ),
    ).toBe(false);

    const createdLeadRecord = await caller.leads.create({
      propertyId: "lee-prop-browser-verify",
      county: "lee",
    });

    expect(createdLeadRecord.addressSnapshot).toContain("Palm Ave");

    const reloadedCaller = appRouter.createCaller(createTestApiContext());
    const listedLeadRecords = await reloadedCaller.leads.list({
      county: "lee",
    });

    expect(listedLeadRecords).toHaveLength(1);
    expect(listedLeadRecords[0]?.leadId).toBe(createdLeadRecord.leadId);
    expect(listedLeadRecords[0]?.addressSnapshot).toContain("Palm Ave");
  });
});
