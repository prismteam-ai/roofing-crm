import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { PublishedCountyCatalogEntry } from "@roofing-crm-challenge/elephant-client";
import { describe, expect, it, vi } from "vitest";
import type { ApiContext } from "../trpc.js";
import {
  createSearchRouter,
  haversineDistanceMiles,
  isAgingRoofLayerCandidate,
  resolveAgingRoofBuiltYearCutoff,
  type SearchInRadiusPropertyRow,
} from "./search.js";

/** Fort Myers default pin while Lee is the CRM fallback county. */
const FORT_MYERS_CENTER = { lat: 26.6406, lng: -81.8723 } as const;

const LEE_CATALOG: PublishedCountyCatalogEntry[] = [
  {
    countyKey: "lee",
    countyName: "Lee",
    stateCode: "FL",
    propertyDatasetAvailable: true,
    mapSearchReady: true,
  },
];

function createTestApiContext(): ApiContext {
  const serviceName = "roofing-crm-api-test";
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ serviceName, namespace: "RoofingCrmApiTest" }),
  };
}

/**
 * Shifts a latitude north by the given statute miles (local flat-Earth approx).
 *
 * Good enough for fixture placement; Haversine still decides inclusion.
 */
function latitudeMilesNorthOf(latitude: number, milesNorth: number): number {
  return latitude + milesNorth / 69.0;
}

function createLeePropertyRow(arguments_: {
  propertyId: string;
  latitude: number;
  longitude: number;
  gisMuni?: number | null;
  builtYear?: number | null;
}): SearchInRadiusPropertyRow {
  return {
    propertyId: arguments_.propertyId,
    parcelIdentifier: `parcel-${arguments_.propertyId}`,
    latitude: arguments_.latitude,
    longitude: arguments_.longitude,
    builtYear: arguments_.builtYear === undefined ? 1980 : arguments_.builtYear,
    addressStreet: "123 Palm Ave",
    addressCity: "Fort Myers",
    addressZip: null,
    hasPermits: null,
    permitCount: null,
    hasBbbContractor: null,
    gisMuni: arguments_.gisMuni ?? null,
  };
}

function createCaller(arguments_: {
  propertyRows: SearchInRadiusPropertyRow[];
  catalogEntries?: PublishedCountyCatalogEntry[];
}) {
  const searchRouter = createSearchRouter({
    listPropertiesInBoundingBox: async () => arguments_.propertyRows,
    listPublishedCounties: async () => arguments_.catalogEntries ?? LEE_CATALOG,
  });
  return searchRouter.createCaller(createTestApiContext());
}

describe("search.inRadius", () => {
  // Given a bbox MCP result with a parcel ~1 mile from Fort Myers
  // When inRadius runs with radiusMiles 5
  // Then that parcel is included (inside the circle, not merely the bbox)
  it("includes a point 1 mile from center at radius 5", async () => {
    const nearLatitude = latitudeMilesNorthOf(FORT_MYERS_CENTER.lat, 1);
    const caller = createCaller({
      propertyRows: [
        createLeePropertyRow({
          propertyId: "lee-near-1mi",
          latitude: nearLatitude,
          longitude: FORT_MYERS_CENTER.lng,
        }),
      ],
    });

    const candidates = await caller.inRadius({
      county: "lee",
      center: { ...FORT_MYERS_CENTER },
      radiusMiles: 5,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.propertyId).toBe("lee-near-1mi");
    expect(candidates[0]?.distanceMiles).toBeLessThanOrEqual(5);
    expect(
      haversineDistanceMiles(
        FORT_MYERS_CENTER.lat,
        FORT_MYERS_CENTER.lng,
        nearLatitude,
        FORT_MYERS_CENTER.lng,
      ),
    ).toBeLessThan(1.1);
  });

  // Given a bbox MCP result with a parcel ~10 miles from Fort Myers
  // When inRadius runs with radiusMiles 5
  // Then that parcel is excluded even though a square bbox would still contain it
  it("excludes a point 10 miles from center at radius 5", async () => {
    const farLatitude = latitudeMilesNorthOf(FORT_MYERS_CENTER.lat, 10);
    const caller = createCaller({
      propertyRows: [
        createLeePropertyRow({
          propertyId: "lee-far-10mi",
          latitude: farLatitude,
          longitude: FORT_MYERS_CENTER.lng,
        }),
      ],
    });

    const candidates = await caller.inRadius({
      county: "lee",
      center: { ...FORT_MYERS_CENTER },
      radiusMiles: 5,
    });

    expect(candidates).toHaveLength(0);
    expect(
      haversineDistanceMiles(
        FORT_MYERS_CENTER.lat,
        FORT_MYERS_CENTER.lng,
        farLatitude,
        FORT_MYERS_CENTER.lng,
      ),
    ).toBeGreaterThan(9);
  });

  // Given Lee county search with Chester pilot gisMuni [1, 16] on the request
  // When inRadius runs against Lee rows (no / foreign gisMuni on rows)
  // Then Lee parcels inside the radius are kept — Chester MUNI codes never clip Lee
  it("does not clip Lee rows by Chester MUNI 1 and 16", async () => {
    const nearLatitude = latitudeMilesNorthOf(FORT_MYERS_CENTER.lat, 1);
    const caller = createCaller({
      propertyRows: [
        createLeePropertyRow({
          propertyId: "lee-no-muni",
          latitude: nearLatitude,
          longitude: FORT_MYERS_CENTER.lng,
          gisMuni: null,
        }),
        createLeePropertyRow({
          propertyId: "lee-foreign-muni-99",
          latitude: nearLatitude,
          longitude: FORT_MYERS_CENTER.lng,
          gisMuni: 99,
        }),
      ],
      catalogEntries: LEE_CATALOG,
    });

    const candidates = await caller.inRadius({
      county: "lee",
      center: { ...FORT_MYERS_CENTER },
      radiusMiles: 5,
      gisMuni: [1, 16],
    });

    expect(candidates.map((candidate) => candidate.propertyId).sort()).toEqual([
      "lee-foreign-muni-99",
      "lee-no-muni",
    ]);
  });

  // Given built_year 1980 and minStructureAgeYears 15 in UTC year 2026
  // When the aging-roof layer filter runs
  // Then the parcel is kept (structure year at or before the cutoff)
  it("keeps built_year at or before currentUtcYear minus 15", () => {
    const currentUtcYear = 2026;
    const minStructureAgeYears = 15;
    const builtYearCutoff = resolveAgingRoofBuiltYearCutoff({
      currentUtcYear,
      minStructureAgeYears,
    });

    expect(builtYearCutoff).toBe(2011);
    expect(
      isAgingRoofLayerCandidate({
        builtYear: 1980,
        currentUtcYear,
        minStructureAgeYears,
      }),
    ).toBe(true);
    expect(
      isAgingRoofLayerCandidate({
        builtYear: 2011,
        currentUtcYear,
        minStructureAgeYears,
      }),
    ).toBe(true);
    expect(
      isAgingRoofLayerCandidate({
        builtYear: 2012,
        currentUtcYear,
        minStructureAgeYears,
      }),
    ).toBe(false);
  });

  // Given a parcel inside the radius with null built_year
  // When inRadius runs with the default aging-roof threshold
  // Then that parcel is dropped from the aging layer (no invented structure age)
  it("drops null built_year from the aging-roof layer", async () => {
    const nearLatitude = latitudeMilesNorthOf(FORT_MYERS_CENTER.lat, 1);
    const caller = createCaller({
      propertyRows: [
        createLeePropertyRow({
          propertyId: "lee-null-built-year",
          latitude: nearLatitude,
          longitude: FORT_MYERS_CENTER.lng,
          builtYear: null,
        }),
        createLeePropertyRow({
          propertyId: "lee-aging-1980",
          latitude: nearLatitude,
          longitude: FORT_MYERS_CENTER.lng,
          builtYear: 1980,
        }),
      ],
    });

    const candidates = await caller.inRadius({
      county: "lee",
      center: { ...FORT_MYERS_CENTER },
      radiusMiles: 5,
      minStructureAgeYears: 15,
    });

    expect(candidates.map((candidate) => candidate.propertyId)).toEqual([
      "lee-aging-1980",
    ]);
    expect(
      isAgingRoofLayerCandidate({
        builtYear: null,
        currentUtcYear: new Date().getUTCFullYear(),
        minStructureAgeYears: 15,
      }),
    ).toBe(false);
  });

  // Given catalog-published chester whose query table publishes no gis_muni
  // When inRadius runs against rows that all carry null gisMuni
  // Then MUNI clipping is skipped — the published table cannot be clipped
  it("skips the Chester MUNI clip when served rows publish no gis_muni", async () => {
    const westChester = { lat: 39.9607, lng: -75.6055 };
    const caller = createCaller({
      propertyRows: [
        {
          propertyId: "31-5-30",
          parcelIdentifier: "31-5-30",
          latitude: westChester.lat,
          longitude: westChester.lng,
          builtYear: null,
          addressStreet: null,
          addressCity: null,
          addressZip: null,
          hasPermits: null,
          permitCount: null,
          hasBbbContractor: null,
          gisMuni: null,
        },
      ],
      catalogEntries: [
        {
          countyKey: "chester",
          countyName: "Chester",
          stateCode: "PA",
          propertyDatasetAvailable: true,
          mapSearchReady: true,
        },
      ],
    });

    const candidates = await caller.inRadius({
      county: "chester",
      center: westChester,
      radiusMiles: 5,
    });

    expect(candidates.map((candidate) => candidate.propertyId)).toEqual(["31-5-30"]);
  });

  // Given Chester search while the official catalog still omits chester
  // When inRadius runs against parcels with null gisMuni
  // Then those parcels stay — query-table overlay must not enable MUNI clip
  it("does not clip Chester rows when the official catalog omits chester", async () => {
    const westChester = { lat: 39.9607, lng: -75.6055 };
    const caller = createCaller({
      propertyRows: [
        {
          propertyId: "chester-null-muni",
          parcelIdentifier: "1101",
          latitude: westChester.lat,
          longitude: westChester.lng,
          builtYear: null,
          addressStreet: "219 LACEY ST",
          addressCity: "WEST CHESTER, PA",
          addressZip: null,
          hasPermits: null,
          permitCount: null,
          hasBbbContractor: null,
          gisMuni: null,
        },
      ],
      catalogEntries: LEE_CATALOG,
    });

    const candidates = await caller.inRadius({
      county: "chester",
      center: westChester,
      radiusMiles: 5,
    });

    expect(candidates.map((candidate) => candidate.propertyId)).toEqual([
      "chester-null-muni",
    ]);
  });

  // Given the bbox MCP loader throws
  // When inRadius runs
  // Then the failure is logged at error with county, duration, and message
  it("logs search.inRadius.failed when the bbox loader throws", async () => {
    const apiContext = createTestApiContext();
    const errorSpy = vi.spyOn(apiContext.logger, "error");
    const searchRouter = createSearchRouter({
      listPropertiesInBoundingBox: async () => {
        throw new Error("Elephant MCP tool queryProperties failed (retryable): boom");
      },
      listPublishedCounties: async () => LEE_CATALOG,
    });
    const caller = searchRouter.createCaller(apiContext);

    await expect(
      caller.inRadius({
        county: "lee",
        center: { ...FORT_MYERS_CENTER },
        radiusMiles: 5,
      }),
    ).rejects.toThrow(/queryProperties/);

    expect(errorSpy).toHaveBeenCalledWith(
      "search.inRadius.failed",
      expect.objectContaining({
        county: "lee",
        radiusMiles: 5,
        errorMessage: expect.stringContaining("queryProperties"),
      }),
    );
  });
});
