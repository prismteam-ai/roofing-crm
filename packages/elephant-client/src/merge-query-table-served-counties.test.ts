import { describe, expect, it } from "vitest";
import { mergeQueryTableServedCountiesIntoCatalog } from "./merge-query-table-served-counties.js";
import type { PublishedCountyCatalogEntry } from "./published-county-catalog.js";

const LEE: PublishedCountyCatalogEntry = {
  countyKey: "lee",
  countyName: "Lee",
  stateCode: "FL",
  propertyDatasetAvailable: true,
  mapSearchReady: true,
};

const CHESTER_MAP =
  '{"lee":"https://example.invalid/lee","chester":"https://example.invalid/chester"}';

const CHESTER_DEMO_MAP =
  '{"lee":"https://example.invalid/lee","chester-demo":"https://example.invalid/chester-demo"}';

const MONTGOMERY_MAP =
  '{"lee":"https://example.invalid/lee","montgomery":"https://example.invalid/montgomery"}';

const MULTI_OVERLAY_MAP =
  '{"lee":"https://example.invalid/lee","chester":"https://example.invalid/chester","chester-demo":"https://example.invalid/chester-demo","montgomery":"https://example.invalid/montgomery","delaware":"https://example.invalid/delaware","santa-clara":"https://example.invalid/sc"}';

const CHESTER_GEO_MAP =
  '{"chester":"k51geo","chester-demo":"k51geo","montgomery":"k51geo"}';

describe("mergeQueryTableServedCountiesIntoCatalog", () => {
  // Given Oracle's catalog omits chester and the query-table map serves it without geo
  // When merge runs
  // Then chester is appended with a property table but not map-ready
  it("appends chester when the query-table map serves it and the catalog omits it", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog([LEE], CHESTER_MAP);

    expect(merged.map((entry) => entry.countyKey)).toEqual(["lee", "chester"]);
    expect(merged[1]).toEqual({
      countyKey: "chester",
      countyName: "Chester (real)",
      stateCode: "PA",
      propertyDatasetAvailable: true,
      mapSearchReady: false,
    });
  });

  // Given property + geo capability for chester
  // When merge runs
  // Then chester is mapSearchReady
  it("sets mapSearchReady true when chester has property and geo capability", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog(
      [LEE],
      CHESTER_MAP,
      CHESTER_GEO_MAP,
    );

    expect(merged.find((entry) => entry.countyKey === "chester")).toEqual({
      countyKey: "chester",
      countyName: "Chester (real)",
      stateCode: "PA",
      propertyDatasetAvailable: true,
      mapSearchReady: true,
    });
  });

  // Given property + geo for chester-demo
  // When merge runs
  // Then chester-demo is appended and map-ready with demo label
  it("appends map-ready chester-demo when property and geo maps serve it", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog(
      [LEE],
      CHESTER_DEMO_MAP,
      CHESTER_GEO_MAP,
    );

    expect(merged.find((entry) => entry.countyKey === "chester-demo")).toEqual({
      countyKey: "chester-demo",
      countyName: "Chester (demo data)",
      stateCode: "PA",
      propertyDatasetAvailable: true,
      mapSearchReady: true,
    });
  });

  // Given property table without geo for chester
  // When merge runs
  // Then chester stays unavailable for map search
  it("keeps chester unavailable when geo capability is missing", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog([LEE], CHESTER_MAP, "{}");

    expect(merged.find((entry) => entry.countyKey === "chester")?.mapSearchReady).toBe(
      false,
    );
  });

  // Given the catalog already lists chester with a property table
  // When merge runs
  // Then chester is not duplicated
  it("does not duplicate chester already listed with a property table", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog(
      [
        LEE,
        {
          countyKey: "chester",
          countyName: "Chester",
          stateCode: "PA",
          propertyDatasetAvailable: true,
          mapSearchReady: true,
        },
      ],
      CHESTER_MAP,
      CHESTER_GEO_MAP,
    );

    expect(merged.filter((entry) => entry.countyKey === "chester")).toHaveLength(1);
    expect(merged.find((entry) => entry.countyKey === "chester")?.countyName).toBe(
      "Chester (real)",
    );
  });

  // Given the catalog lists chester without a query table
  // When the map serves chester with geo
  // Then propertyDatasetAvailable and mapSearchReady become true
  it("upgrades a catalog chester row that has no property table", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog(
      [
        LEE,
        {
          countyKey: "chester",
          countyName: "Chester",
          stateCode: "PA",
          propertyDatasetAvailable: false,
          mapSearchReady: false,
        },
      ],
      CHESTER_MAP,
      CHESTER_GEO_MAP,
    );

    expect(merged.find((entry) => entry.countyKey === "chester")).toEqual({
      countyKey: "chester",
      countyName: "Chester (real)",
      stateCode: "PA",
      propertyDatasetAvailable: true,
      mapSearchReady: true,
    });
  });

  // Given other map keys such as santa-clara
  // When merge runs
  // Then only allowlisted overlays are added
  it("does not overlay counties outside the allowlist", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog(
      [LEE],
      '{"lee":"https://example.invalid/lee","santa-clara":"https://example.invalid/sc"}',
    );

    expect(merged.every((entry) => entry.countyKey !== "santa-clara")).toBe(true);
    expect(merged.every((entry) => entry.countyKey !== "chester")).toBe(true);
  });

  // Given Oracle's catalog omits montgomery and the query-table map serves it with geo
  // When merge runs
  // Then montgomery is appended and map-ready
  it("appends montgomery when the query-table map serves it and the catalog omits it", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog(
      [LEE],
      MONTGOMERY_MAP,
      CHESTER_GEO_MAP,
    );

    expect(merged.map((entry) => entry.countyKey)).toEqual(["lee", "montgomery"]);
    expect(merged[1]).toEqual({
      countyKey: "montgomery",
      countyName: "Montgomery",
      stateCode: "PA",
      propertyDatasetAvailable: true,
      mapSearchReady: true,
    });
  });

  // Given delaware and santa-clara are in the query-table map but not the allowlist
  // When merge runs
  // Then neither is added to the picker catalog
  it("does not overlay delaware or santa-clara even when the query-table map serves them", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog(
      [LEE],
      MULTI_OVERLAY_MAP,
      CHESTER_GEO_MAP,
    );

    expect(merged.map((entry) => entry.countyKey)).toEqual([
      "lee",
      "chester",
      "chester-demo",
      "montgomery",
    ]);
    expect(merged.every((entry) => entry.countyKey !== "delaware")).toBe(true);
    expect(merged.every((entry) => entry.countyKey !== "santa-clara")).toBe(true);
  });

  // Given official lee is map-ready on the catalog snapshot
  // When merge runs with overlay counties in the query-table map
  // Then lee keeps mapSearchReady true
  it("keeps mapSearchReady true on official lee after merge", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog(
      [LEE],
      MULTI_OVERLAY_MAP,
      CHESTER_GEO_MAP,
    );

    expect(merged.find((entry) => entry.countyKey === "lee")).toEqual({
      countyKey: "lee",
      countyName: "Lee",
      stateCode: "FL",
      propertyDatasetAvailable: true,
      mapSearchReady: true,
    });
  });

  // Given montgomery is overlay-only without geo
  // When merge runs
  // Then montgomery is not marked map-ready
  it("does not set mapSearchReady true on overlay-only montgomery without geo", () => {
    const merged = mergeQueryTableServedCountiesIntoCatalog([LEE], MONTGOMERY_MAP);

    expect(merged.find((entry) => entry.countyKey === "montgomery")).toEqual({
      countyKey: "montgomery",
      countyName: "Montgomery",
      stateCode: "PA",
      propertyDatasetAvailable: true,
      mapSearchReady: false,
    });
  });
});
