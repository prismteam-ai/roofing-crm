import type { Client } from "@opensearch-project/opensearch";
import { describe, expect, it } from "vitest";

import {
  buildIndexedSearchQueryBody,
  createIndexedSearchPropertyRowLoader,
  INDEXED_SEARCH_ROW_LIMIT,
  mapChunkToSearchPropertyRow,
} from "./search-property-rows-from-index.js";
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";

const demoCenter = { lat: 26.6406, lng: -81.8723 };
const demoBoundingBox = {
  minLat: 26.5681,
  maxLat: 26.7131,
  minLng: -81.9534,
  maxLng: -81.7912,
};

function buildChunk(
  overrides: Partial<RoofingOpportunityChunk> = {},
): RoofingOpportunityChunk {
  return {
    chunkId: "lee-prop-1-summary",
    propertyId: "lee-prop-1",
    parcel_identifier: "parcel-1",
    county: "lee",
    documentKind: "property_summary",
    text: "Published lee parcel parcel-1.",
    sourceUri: "elephant://lee/property/lee-prop-1",
    built_year: 1978,
    has_open_roofing_permit: false,
    open_permit_years: null,
    latitude: 26.6401,
    longitude: -81.8712,
    address_street: "2017 HEITMAN STREET",
    address_city: "FORT MYERS",
    ...overrides,
  };
}

describe("buildIndexedSearchQueryBody", () => {
  it("filters property_summary chunks to the bbox and sorts nearest-first from the pin", () => {
    const body = buildIndexedSearchQueryBody({
      county: " Lee ",
      boundingBox: demoBoundingBox,
      center: demoCenter,
    });

    expect(body).toEqual({
      size: INDEXED_SEARCH_ROW_LIMIT,
      query: {
        bool: {
          filter: [
            { term: { county: "lee" } },
            { term: { documentKind: "property_summary" } },
            { range: { latitude: { gte: 26.5681, lte: 26.7131 } } },
            { range: { longitude: { gte: -81.9534, lte: -81.7912 } } },
          ],
        },
      },
      sort: [
        {
          _geo_distance: {
            location: { lat: 26.6406, lon: -81.8723 },
            order: "asc",
            unit: "mi",
          },
        },
      ],
    });
  });
});

describe("mapChunkToSearchPropertyRow", () => {
  it("maps corpus fields and leaves unindexed fields null", () => {
    expect(mapChunkToSearchPropertyRow(buildChunk())).toEqual({
      propertyId: "lee-prop-1",
      parcelIdentifier: "parcel-1",
      latitude: 26.6401,
      longitude: -81.8712,
      builtYear: 1978,
      builtYearSource: null,
      addressStreet: "2017 HEITMAN STREET",
      addressCity: "FORT MYERS",
      addressZip: null,
      hasPermits: false,
      permitCount: null,
      hasBbbContractor: null,
      gisMuni: null,
    });
  });

  it("marks hasBbbContractor from an explicit bbb_rating value", () => {
    expect(
      mapChunkToSearchPropertyRow(buildChunk({ bbb_rating: "A+" })).hasBbbContractor,
    ).toBe(true);
    expect(
      mapChunkToSearchPropertyRow(buildChunk({ bbb_rating: null })).hasBbbContractor,
    ).toBe(false);
  });
});

describe("createIndexedSearchPropertyRowLoader", () => {
  it("returns one row per property, preserving nearest-first hit order", async () => {
    const hits = [
      { _source: buildChunk() },
      {
        _source: buildChunk({
          chunkId: "lee-prop-1-permit",
          documentKind: "roofing_permit",
        }),
      },
      {
        _source: buildChunk({
          chunkId: "lee-prop-2-summary",
          propertyId: "lee-prop-2",
          parcel_identifier: "parcel-2",
          latitude: 26.6501,
          longitude: -81.8801,
        }),
      },
    ];
    const fakeClient = {
      search: async () => ({ body: { hits: { hits } } }),
    } as unknown as Client;

    const loadRows = createIndexedSearchPropertyRowLoader(fakeClient);
    const rows = await loadRows({
      county: "lee",
      boundingBox: demoBoundingBox,
      center: demoCenter,
    });

    expect(rows.map((row) => row.propertyId)).toEqual(["lee-prop-1", "lee-prop-2"]);
  });
});
