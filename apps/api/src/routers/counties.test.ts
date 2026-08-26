import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { PublishedCountyCatalogEntry } from "@roofing-crm-challenge/elephant-client";
import { describe, expect, it } from "vitest";
import type { ApiContext } from "../trpc.js";
import {
  createCountiesRouter,
  publishedCountyListItemSchema,
  resolveDefaultCountyFromCatalog,
} from "./counties.js";

function createTestApiContext(): ApiContext {
  const serviceName = "roofing-crm-api-test";
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ serviceName, namespace: "RoofingCrmApiTest" }),
  };
}

function createCaller(catalog: PublishedCountyCatalogEntry[]) {
  const countiesRouter = createCountiesRouter({
    listPublishedCounties: async () => catalog,
  });
  return countiesRouter.createCaller(createTestApiContext());
}

describe("counties.defaultCounty", () => {
  // Given a mocked catalog that lists lee with a property table and omits chester
  // When defaultCounty runs
  // Then the result is lee with lee_dev_fallback coverage
  it("returns lee when catalog omits chester keys", async () => {
    const caller = createCaller([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "miami-dade",
        countyName: "Miami-Dade",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
    ]);

    const result = await caller.defaultCounty();

    expect(result).toEqual({
      countyKey: "lee",
      coverageMode: "lee_dev_fallback",
    });
  });

  // Given a mocked catalog that includes chester-demo map-ready
  // When defaultCounty runs
  // Then the result is chester-demo with chester_demo_synthetic coverage
  it("returns chester-demo when map-search-ready", async () => {
    const caller = createCaller([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "chester",
        countyName: "Chester (real)",
        stateCode: "PA",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "chester-demo",
        countyName: "Chester (demo data)",
        stateCode: "PA",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
    ]);

    const result = await caller.defaultCounty();

    expect(result).toEqual({
      countyKey: "chester-demo",
      coverageMode: "chester_demo_synthetic",
    });
  });

  // Given map-ready chester without chester-demo
  // When defaultCounty runs
  // Then the result is chester with chester_real_limited coverage
  it("returns chester when map-ready and chester-demo is absent", async () => {
    const caller = createCaller([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "chester",
        countyName: "Chester (real)",
        stateCode: "PA",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
    ]);

    const result = await caller.defaultCounty();

    expect(result).toEqual({
      countyKey: "chester",
      coverageMode: "chester_real_limited",
    });
  });

  // Given a catalog that omits chester (and never lists invent-me)
  // When defaultCounty runs
  // Then the returned countyKey is present on the catalog and never an unpublished key
  it("never returns an unpublished key", async () => {
    const catalog: PublishedCountyCatalogEntry[] = [
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "orange",
        countyName: "Orange",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
    ];
    const catalogKeys = new Set(catalog.map((entry) => entry.countyKey));
    const caller = createCaller(catalog);

    const result = await caller.defaultCounty();

    expect(catalogKeys.has(result.countyKey)).toBe(true);
    expect(result.countyKey).not.toBe("chester");
    expect(result.countyKey).not.toBe("chester-demo");
    expect(result.countyKey).not.toBe("invent-me");
  });

  // Given official lee plus overlay chester with a local query table but not map-ready
  // When defaultCounty runs
  // Then lee remains the default
  it("returns lee when overlay chester is not map-search-ready", async () => {
    const caller = createCaller([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "chester",
        countyName: "Chester (real)",
        stateCode: "PA",
        propertyDatasetAvailable: true,
        mapSearchReady: false,
      },
    ]);

    const result = await caller.defaultCounty();

    expect(result).toEqual({
      countyKey: "lee",
      coverageMode: "lee_dev_fallback",
    });
  });

  // Given chester listed without a property table URL
  // When defaultCounty runs
  // Then lee remains the default
  it("does not flip to chester when catalog lists chester without a property table", async () => {
    const caller = createCaller([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "chester",
        countyName: "Chester (real)",
        stateCode: "PA",
        propertyDatasetAvailable: false,
        mapSearchReady: false,
      },
    ]);

    const result = await caller.defaultCounty();

    expect(result).toEqual({
      countyKey: "lee",
      coverageMode: "lee_dev_fallback",
    });
  });
});

describe("resolveDefaultCountyFromCatalog", () => {
  // Given official lee and overlay-only chester in the merged catalog
  // When resolveDefaultCountyFromCatalog runs
  // Then lee is the default
  it("returns lee when official lee is map-ready and chester is overlay-only", () => {
    const result = resolveDefaultCountyFromCatalog([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "chester",
        countyName: "Chester (real)",
        stateCode: "PA",
        propertyDatasetAvailable: true,
        mapSearchReady: false,
      },
    ]);

    expect(result).toEqual({
      countyKey: "lee",
      coverageMode: "lee_dev_fallback",
    });
  });

  // Given map-ready chester-demo on the served catalog
  // When resolveDefaultCountyFromCatalog runs
  // Then chester_demo_synthetic is returned
  it("prefers chester-demo over chester and lee when map-search-ready", () => {
    const result = resolveDefaultCountyFromCatalog([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "chester",
        countyName: "Chester (real)",
        stateCode: "PA",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "chester-demo",
        countyName: "Chester (demo data)",
        stateCode: "PA",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
    ]);

    expect(result).toEqual({
      countyKey: "chester-demo",
      coverageMode: "chester_demo_synthetic",
    });
  });

  // Given map-ready chester without chester-demo
  // When resolveDefaultCountyFromCatalog runs
  // Then chester_real_limited is returned
  it("returns chester when chester is map-search-ready and chester-demo is absent", () => {
    const result = resolveDefaultCountyFromCatalog([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "chester",
        countyName: "Chester (real)",
        stateCode: "PA",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
    ]);

    expect(result).toEqual({
      countyKey: "chester",
      coverageMode: "chester_real_limited",
    });
  });

  // Given a catalog with neither map-ready chester keys nor map-ready lee
  // When resolveDefaultCountyFromCatalog runs
  // Then resolution fails
  it("throws when neither chester-demo, chester, nor lee is map-search-ready", () => {
    expect(() =>
      resolveDefaultCountyFromCatalog([
        {
          countyKey: "orange",
          countyName: "Orange",
          stateCode: "FL",
          propertyDatasetAvailable: true,
          mapSearchReady: true,
        },
        {
          countyKey: "chester",
          countyName: "Chester (real)",
          stateCode: "PA",
          propertyDatasetAvailable: true,
          mapSearchReady: false,
        },
      ]),
    ).toThrow(
      "Published catalog has no usable default county (need map-search-ready chester-demo, chester, or lee)",
    );
  });
});

describe("counties.list", () => {
  // Given a mocked published catalog
  // When list runs
  // Then every returned row is from the catalog with names and propertyDatasetAvailable
  it("returns only catalog counties", async () => {
    const caller = createCaller([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "rock-island",
        countyName: "Rock Island",
        stateCode: "IL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
    ]);

    const listed = await caller.list();

    expect(listed).toEqual([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "rock-island",
        countyName: "Rock Island",
        stateCode: "IL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
    ]);
    expect(listed.every((row) => row.countyKey !== "chester")).toBe(true);
  });

  // Given official lee on the mocked catalog
  // When list runs
  // Then the lee row reports mapSearchReady true
  it("returns lee with mapSearchReady true", async () => {
    const caller = createCaller([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
    ]);

    const listed = await caller.list();
    const leeRow = listed.find((row) => row.countyKey === "lee");

    expect(leeRow?.mapSearchReady).toBe(true);
  });

  // Given overlay chester with a local query table but not map-ready
  // When list runs
  // Then the chester row reports mapSearchReady false
  it("returns overlay chester with mapSearchReady false", async () => {
    const caller = createCaller([
      {
        countyKey: "lee",
        countyName: "Lee",
        stateCode: "FL",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      },
      {
        countyKey: "chester",
        countyName: "Chester (real)",
        stateCode: "PA",
        propertyDatasetAvailable: true,
        mapSearchReady: false,
      },
    ]);

    const listed = await caller.list();
    const chesterRow = listed.find((row) => row.countyKey === "chester");

    expect(chesterRow?.propertyDatasetAvailable).toBe(true);
    expect(chesterRow?.mapSearchReady).toBe(false);
  });
});

describe("publishedCountyListItemSchema", () => {
  // Given a catalog row shape without mapSearchReady
  // When the list output schema parses it
  // Then validation fails so incomplete rows cannot reach the SPA
  it("rejects a row missing mapSearchReady", () => {
    const parsed = publishedCountyListItemSchema.safeParse({
      countyKey: "lee",
      countyName: "Lee",
      stateCode: "FL",
      propertyDatasetAvailable: true,
    });

    expect(parsed.success).toBe(false);
  });
});
