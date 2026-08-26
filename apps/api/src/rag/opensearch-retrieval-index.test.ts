import { describe, expect, it } from "vitest";

import {
  buildFilterClauses,
  fuseRetrievalResultsWithRrf,
} from "./opensearch-retrieval-index.js";

describe("opensearch retrieval helpers", () => {
  it("builds geo_distance filter when center and radius are provided", () => {
    const clauses = buildFilterClauses({
      county: "lee",
      center: { lat: 26.6406, lng: -81.8723 },
      radiusMiles: 5,
    });

    expect(clauses.some((clause) => "geo_distance" in clause)).toBe(true);
  });

  it("fuses lexical and vector rankings deterministically with RRF", () => {
    const chunkA = {
      chunkId: "a#property-summary",
      propertyId: "a",
      county: "lee",
      documentKind: "property_summary" as const,
      text: "A",
      sourceUri: "elephant://lee/property/a",
      built_year: 1990,
      has_open_roofing_permit: false,
      open_permit_years: null,
      latitude: 1,
      longitude: 1,
    };
    const chunkB = {
      chunkId: "b#property-summary",
      propertyId: "b",
      county: "lee",
      documentKind: "property_summary" as const,
      text: "B",
      sourceUri: "elephant://lee/property/b",
      built_year: 1990,
      has_open_roofing_permit: false,
      open_permit_years: null,
      latitude: 2,
      longitude: 2,
    };

    const fused = fuseRetrievalResultsWithRrf(
      [[{ chunk: chunkA, score: 1 }], [{ chunk: chunkB, score: 1 }]],
      2,
    );

    expect(fused.map((entry) => entry.chunk.propertyId)).toEqual(["a", "b"]);
  });

  it("restricts retrieval to allowed property ids when provided", () => {
    const clauses = buildFilterClauses({
      county: "lee",
      allowedPropertyIds: new Set(["lee-prop-202"]),
    });

    expect(clauses).toEqual(
      expect.arrayContaining([
        { term: { county: "lee" } },
        { terms: { propertyId: ["lee-prop-202"] } },
      ]),
    );
  });

  it("reports not indexed when OpenSearch index exists but has zero documents", async () => {
    const client = {
      indices: {
        exists: async () => ({ body: true }),
      },
      count: async () => ({ body: { count: 0 } }),
      search: async () => ({ body: { hits: { hits: [] } } }),
      bulk: async () => ({}),
    };

    const { createOpenSearchRetrievalIndex } =
      await import("./opensearch-retrieval-index.js");
    const retrievalIndex = createOpenSearchRetrievalIndex(
      client as never,
      "roofing-opportunity-chunks",
    );

    expect(await retrievalIndex.isIndexed()).toBe(false);
  });
});
