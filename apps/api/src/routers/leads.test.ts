import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { parseCountyCatalogKey } from "@roofing-crm-challenge/shared";
import { describe, expect, it } from "vitest";
import {
  createInMemoryLeadRecordRepository,
  type LeadRecordCreateSnapshot,
} from "../leads-record-repository.js";
import type { ApiContext } from "../trpc.js";
import { createLeadsRouter, type LeadsRouterDependencies } from "./leads.js";

function createTestApiContext(): ApiContext {
  const serviceName = "roofing-crm-api-test";
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ serviceName, namespace: "RoofingCrmApiTest" }),
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

function createCaller(overrides: Partial<LeadsRouterDependencies> = {}) {
  const leadRecordRepository =
    overrides.leadRecordRepository ?? createInMemoryLeadRecordRepository();
  const dependencies: LeadsRouterDependencies = {
    leadRecordRepository,
    loadLeadRecordCreateSnapshot:
      overrides.loadLeadRecordCreateSnapshot ??
      (async ({ propertyId, countyKey }) =>
        createLeadRecordCreateSnapshot(propertyId, countyKey)),
    generateLeadRecordId:
      overrides.generateLeadRecordId ?? (() => "01TESTLEAD0000000000000001"),
    nowIso: overrides.nowIso ?? (() => "2026-08-21T12:00:00.000Z"),
  };
  const leadsRouter = createLeadsRouter(dependencies);
  return {
    caller: leadsRouter.createCaller(createTestApiContext()),
    leadRecordRepository,
  };
}

describe("leads.create / list / archive", () => {
  // Given no active lead for a published Lee property
  // When leads.create then leads.list run
  // Then list returns the new lead snapshot
  it("create then list returns the lead", async () => {
    const { caller } = createCaller();

    const createdLeadRecord = await caller.create({
      propertyId: "lee-prop-100",
      county: "lee",
    });

    const listedLeadRecords = await caller.list({});

    expect(createdLeadRecord.status).toBe("new");
    expect(createdLeadRecord.propertyId).toBe("lee-prop-100");
    expect(createdLeadRecord.countyKey).toBe("lee");
    expect(listedLeadRecords).toHaveLength(1);
    expect(listedLeadRecords[0]?.leadId).toBe(createdLeadRecord.leadId);
  });

  // Given an active lead already exists for the same propertyId and countyKey
  // When leads.create runs again
  // Then the existing lead is returned (idempotent) and list still has one row
  it("second create for same active propertyId returns the existing lead", async () => {
    let leadRecordIdSequence = 0;
    const { caller } = createCaller({
      generateLeadRecordId: () => {
        leadRecordIdSequence += 1;
        return `01TESTLEAD000000000000000${leadRecordIdSequence}`;
      },
    });

    const firstLeadRecord = await caller.create({
      propertyId: "lee-prop-100",
      county: "lee",
    });
    const secondLeadRecord = await caller.create({
      propertyId: "lee-prop-100",
      county: "lee",
    });

    expect(secondLeadRecord.leadId).toBe(firstLeadRecord.leadId);
    expect(secondLeadRecord.status).toBe("new");

    const listedLeadRecords = await caller.list({});
    expect(listedLeadRecords).toHaveLength(1);
  });

  // Given an active lead for a property
  // When leads.archive runs
  // Then the lead is omitted from the default (active) list
  it("archive removes the lead from the active list", async () => {
    const { caller } = createCaller();

    const createdLeadRecord = await caller.create({
      propertyId: "lee-prop-100",
      county: "lee",
    });

    await caller.archive({ leadId: createdLeadRecord.leadId });

    const activeLeadRecords = await caller.list({});
    expect(activeLeadRecords).toHaveLength(0);

    const archivedLeadRecords = await caller.list({ status: "archived" });
    expect(archivedLeadRecords).toHaveLength(1);
    expect(archivedLeadRecords[0]?.leadId).toBe(createdLeadRecord.leadId);
    expect(archivedLeadRecords[0]?.status).toBe("archived");
  });
});
