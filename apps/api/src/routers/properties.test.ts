import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { describe, expect, it, vi } from "vitest";
import type { ApiContext } from "../trpc.js";
import {
  createPropertiesRouter,
  isRoofingPropertyPermitDetail,
  mapOraclePropertyPermitRecordToPropertyPermitDetail,
  selectRoofingPropertyPermitDetails,
  type OraclePropertyRecord,
  type PropertiesRouterDependencies,
  type PropertyPermitDetail,
} from "./properties.js";

function createTestApiContext(): ApiContext {
  const serviceName = "roofing-crm-api-test";
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ serviceName, namespace: "RoofingCrmApiTest" }),
  };
}

function createCaller(dependencies: PropertiesRouterDependencies) {
  const propertiesRouter = createPropertiesRouter(dependencies);
  return propertiesRouter.createCaller(createTestApiContext());
}

function createOraclePropertyRecord(
  overrides: Partial<OraclePropertyRecord> = {},
): OraclePropertyRecord {
  return {
    propertyId: "lee-prop-100",
    parcelIdentifier: "folio-100",
    addressStreet: "100 Palm Ave",
    addressCity: "Fort Myers",
    addressZip: "33901",
    latitude: 26.6406,
    longitude: -81.8723,
    builtYear: 1985,
    hasPermits: true,
    permitCount: 1,
    hasBbbContractor: false,
    permits: [
      {
        permitNumber: "BP-2020-1",
        permitType: "Roofing",
        status: "Open",
        issuedDate: "2020-03-15",
        description: "Re-roof shingles",
        contractor: "Local Roofing Co",
      },
    ],
    businessReputationProfiles: [],
    ...overrides,
  };
}

describe("properties.get", () => {
  // Given getPermitQuerySchema fails for the county (Lee permit table unserved)
  // When properties.get runs for a property with consolidated permits[]
  // Then permit details come from that array and source is consolidated_permits
  it("when getPermitQuerySchema fails, details use consolidated permits array", async () => {
    const oraclePropertyRecord = createOraclePropertyRecord();
    const getOracleProperty = vi.fn(async () => oraclePropertyRecord);
    const getPermitQuerySchema = vi.fn(async () => {
      throw new Error("permits query table not served");
    });
    const queryPermits = vi.fn(async () => []);

    // Dependencies omit getPropertyPermits — harvest must stay off this path.
    const caller = createCaller({
      getOracleProperty,
      getPermitQuerySchema,
      queryPermits,
    });

    const result = await caller.get({
      county: "lee",
      propertyId: "lee-prop-100",
    });

    expect(getPermitQuerySchema).toHaveBeenCalledWith({ county: "lee" });
    expect(queryPermits).not.toHaveBeenCalled();
    expect(result.permitDetailsSource).toBe("consolidated_permits");
    expect(result.permits).toHaveLength(1);
    expect(result.permits[0]?.permitType).toBe("Roofing");
    expect(result.permits[0]?.status).toBe("Open");
    expect(result.permits[0]?.issuedDate).toBe("2020-03-15");
    expect(result.permits[0]?.closedDate).toBeNull();
  });

  it("when queryPermits throws after a successful schema probe, details use consolidated permits", async () => {
    const oraclePropertyRecord = createOraclePropertyRecord();
    const caller = createCaller({
      getOracleProperty: async () => oraclePropertyRecord,
      getPermitQuerySchema: async () => ({ served: true }),
      queryPermits: async () => {
        throw new Error(
          "Elephant MCP tool queryPermits failed (retryable): tool returned isError",
        );
      },
    });

    const result = await caller.get({
      county: "lee",
      propertyId: "lee-prop-100",
    });

    expect(result.permitDetailsSource).toBe("consolidated_permits");
    expect(result.permits).toHaveLength(1);
    expect(result.permits[0]?.permitType).toBe("Roofing");
  });

  // Given a property with no BBB profile and hasBbbContractor false
  // When properties.get runs
  // Then bbb stays null and no fake rating score is invented
  it("missing BBB is valid and not filled with a fake score", async () => {
    const caller = createCaller({
      getOracleProperty: async () =>
        createOraclePropertyRecord({
          hasBbbContractor: false,
          businessReputationProfiles: [],
        }),
      getPermitQuerySchema: async () => {
        throw new Error("permits query table not served");
      },
      queryPermits: async () => [],
    });

    const result = await caller.get({
      county: "lee",
      propertyId: "lee-prop-100",
    });

    expect(result.hasBbbContractor).toBe(false);
    expect(result.bbb).toBeNull();
  });

  // Given getOracleProperty returns a record for the requested propertyId
  // When properties.get runs
  // Then the result propertyId matches the request
  it("properties.get returns the requested propertyId", async () => {
    const requestedPropertyId = "lee-prop-requested-42";
    const caller = createCaller({
      getOracleProperty: async ({ propertyId }) =>
        createOraclePropertyRecord({ propertyId }),
      getPermitQuerySchema: async () => {
        throw new Error("permits query table not served");
      },
      queryPermits: async () => [],
    });

    const result = await caller.get({
      county: "lee",
      propertyId: requestedPropertyId,
    });

    expect(result.propertyId).toBe(requestedPropertyId);
  });

  // Given consolidated permits[] is empty (Lee unserved / no published rows)
  // When properties.get maps the result
  // Then permits stay [] and no close date is invented
  it("empty permits[] stays empty with no invented close dates", async () => {
    const caller = createCaller({
      getOracleProperty: async () =>
        createOraclePropertyRecord({
          hasPermits: false,
          permitCount: 0,
          permits: [],
        }),
      getPermitQuerySchema: async () => {
        throw new Error("permits query table not served");
      },
      queryPermits: async () => [],
    });

    const result = await caller.get({
      county: "lee",
      propertyId: "lee-prop-100",
    });

    expect(result.permits).toEqual([]);
    expect(result.permits.every((permit) => permit.closedDate !== undefined)).toBe(
      true,
    );
    expect(
      result.permits.some(
        (permit) =>
          typeof permit.closedDate === "string" && permit.closedDate.length > 0,
      ),
    ).toBe(false);
  });

  // Given permits include roofing and non-roofing types
  // When the long-open roofing layer selects candidates
  // Then only rows matching /roof/i on type or description remain
  it("roofing /roof/i type is used when permits exist", () => {
    const permits: PropertyPermitDetail[] = [
      {
        permitId: "BP-1",
        permitType: "Roofing",
        status: "Open",
        issuedDate: "2018-01-01",
        openedDate: "2018-01-01",
        closedDate: null,
        description: "Re-roof",
        contractorName: "A",
        sourceSystem: null,
        provenanceClass: null,
      },
      {
        permitId: "BP-2",
        permitType: "Electrical",
        status: "Open",
        issuedDate: "2019-01-01",
        openedDate: "2019-01-01",
        closedDate: null,
        description: "Panel upgrade",
        contractorName: "B",
        sourceSystem: null,
        provenanceClass: null,
      },
      {
        permitId: "BP-3",
        permitType: "Building",
        status: "Open",
        issuedDate: "2017-06-01",
        openedDate: "2017-06-01",
        closedDate: null,
        description: "Membrane roof repair",
        contractorName: "C",
        sourceSystem: null,
        provenanceClass: null,
      },
    ];

    const roofingPermits = selectRoofingPropertyPermitDetails(permits);

    expect(roofingPermits).toHaveLength(2);
    expect(roofingPermits.map((permit) => permit.permitId)).toEqual(["BP-1", "BP-3"]);
    expect(
      roofingPermits.every((permit) => isRoofingPropertyPermitDetail(permit)),
    ).toBe(true);
  });

  // Given a permit row with null closedDate on the wire
  // When it is mapped to PropertyPermitDetail
  // Then closedDate stays null (no invented close date)
  it("no invented close date on null dates", () => {
    const detail = mapOraclePropertyPermitRecordToPropertyPermitDetail({
      permitNumber: "BP-open",
      permitType: "Roofing",
      status: "Open",
      issuedDate: "2015-04-01",
      openedDate: "2015-04-01",
      closedDate: null,
      description: "Roof tear-off",
      contractor: "Local Roofing Co",
    });

    expect(detail.closedDate).toBeNull();
    expect(detail.closedDate).not.toEqual(expect.any(String));
  });

  it("uses synthetic_demo when flags are set but permit detail rows are missing", async () => {
    const caller = createCaller({
      getOracleProperty: async () =>
        createOraclePropertyRecord({
          hasPermits: true,
          permitCount: 1,
          hasBbbContractor: true,
          permits: [],
          businessReputationProfiles: [],
        }),
      getPermitQuerySchema: async () => {
        throw new Error("permits query table not served");
      },
      queryPermits: async () => [],
    });

    const result = await caller.get({
      county: "lee",
      propertyId: "lee-prop-synth",
      detailResolution: "scan",
    });

    expect(result.permitDetailsSource).toBe("synthetic_demo");
    expect(result.permits[0]?.permitId).toMatch(/^SYNTHETIC-/);
    expect(result.permits[0]?.contractorName).toBeTruthy();
    expect(result.bbb?.ratingLetter).toBeTruthy();
  });
});
