/**
 * Reload-path coverage for LeadRecord persistence.
 *
 * A new caller sharing the same LeadRecordRepository models a fresh page load
 * hitting the API again — not browser localStorage.
 */
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { parseCountyCatalogKey } from "@roofing-crm-challenge/shared";
import { describe, expect, it } from "vitest";
import {
  createInMemoryLeadRecordRepository,
  type LeadRecordCreateSnapshot,
  type LeadRecordRepository,
} from "../leads-record-repository.js";
import type { ApiContext } from "../trpc.js";
import { createLeadsRouter } from "./leads.js";

function createTestApiContext(): ApiContext {
  const serviceName = "roofing-crm-api-leads-reload-test";
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ serviceName, namespace: "RoofingCrmApiLeadsReloadTest" }),
  };
}

function createLeadRecordCreateSnapshot(
  propertyId: string,
  countyKey: ReturnType<typeof parseCountyCatalogKey>,
): LeadRecordCreateSnapshot {
  return {
    propertyId,
    parcelIdentifier: `parcel-${propertyId}`,
    countyKey,
    municipalityName: null,
    gisMuni: null,
    addressSnapshot: "100 Palm Ave, Fort Myers, FL",
    builtYear: 1985,
    roofAgeBasis: "structure_year_built",
    structureAgeYears: 41,
    openPermitIds: [],
    maxOpenPermitYears: null,
    contractorName: null,
    bbbRating: null,
    provenanceTier: "sourced",
    leadScore: 0,
  };
}

function createCaller(leadRecordRepository: LeadRecordRepository) {
  const leadsRouter = createLeadsRouter({
    leadRecordRepository,
    loadLeadRecordCreateSnapshot: async ({ propertyId, countyKey }) =>
      createLeadRecordCreateSnapshot(propertyId, countyKey),
    generateLeadRecordId: () => "01TESTLEADRELOAD00000000001",
    nowIso: () => "2026-08-21T18:00:00.000Z",
  });
  return leadsRouter.createCaller(createTestApiContext());
}

describe("leads.create then list after simulated reload", () => {
  // Given a lead was created through the API
  // When a new caller (simulated reload) lists leads from the same repository
  // Then the same leadId is returned from the API path (not a browser store)
  it("reload path lists the created lead from the shared repository", async () => {
    const leadRecordRepository = createInMemoryLeadRecordRepository();
    const createCallerSession = createCaller(leadRecordRepository);

    const createdLeadRecord = await createCallerSession.create({
      propertyId: "lee-prop-reload-1",
      county: "lee",
    });

    // Simulated reload: brand-new caller, same server-side store.
    const reloadCallerSession = createCaller(leadRecordRepository);
    const listedAfterReload = await reloadCallerSession.list({ county: "lee" });

    expect(listedAfterReload).toHaveLength(1);
    expect(listedAfterReload[0]?.leadId).toBe(createdLeadRecord.leadId);
    expect(listedAfterReload[0]?.propertyId).toBe("lee-prop-reload-1");
    expect(listedAfterReload[0]?.countyKey).toBe("lee");
  });
});
