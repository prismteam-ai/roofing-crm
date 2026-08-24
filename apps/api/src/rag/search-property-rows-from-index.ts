/**
 * Serves radius-search property rows from the OpenSearch RAG corpus.
 *
 * Fallback for `search.inRadius` when live Elephant MCP `queryProperties`
 * fails (cold DuckDB, upstream outage): the indexed corpus keeps the core
 * pin→radius→list flow alive with the last-indexed snapshot instead of a 500.
 */
import type { Client } from "@opensearch-project/opensearch";

import type {
  SearchInRadiusBoundingBox,
  SearchInRadiusCenter,
  SearchInRadiusPropertyRow,
} from "../routers/search.js";
import { SEARCH_PROPERTY_BBOX_QUERY_LIMIT } from "../query-properties-in-bounding-box.js";
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";
import { DEFAULT_RAG_INDEX_NAME } from "./opensearch-retrieval-index.js";

/** Same row cap as the live MCP bbox scan so both paths page identically. */
export const INDEXED_SEARCH_ROW_LIMIT = SEARCH_PROPERTY_BBOX_QUERY_LIMIT;

/**
 * Builds the OpenSearch query body for a bbox scan of property_summary chunks.
 *
 * Uses flat latitude/longitude range filters (same contract as the DuckDB bbox
 * WHERE clause) and sorts nearest-first from the pin via geo_distance.
 */
export function buildIndexedSearchQueryBody(arguments_: {
  county: string;
  boundingBox: SearchInRadiusBoundingBox;
  center: SearchInRadiusCenter;
}): Record<string, unknown> {
  return {
    size: INDEXED_SEARCH_ROW_LIMIT,
    query: {
      bool: {
        filter: [
          { term: { county: arguments_.county.trim().toLowerCase() } },
          { term: { documentKind: "property_summary" } },
          {
            range: {
              latitude: {
                gte: arguments_.boundingBox.minLat,
                lte: arguments_.boundingBox.maxLat,
              },
            },
          },
          {
            range: {
              longitude: {
                gte: arguments_.boundingBox.minLng,
                lte: arguments_.boundingBox.maxLng,
              },
            },
          },
        ],
      },
    },
    sort: [
      {
        _geo_distance: {
          location: {
            lat: arguments_.center.lat,
            lon: arguments_.center.lng,
          },
          order: "asc",
          unit: "mi",
        },
      },
    ],
  };
}

/**
 * Maps an indexed corpus chunk to the radius-search property row contract.
 *
 * Fields the corpus does not carry (zip, permit count, gisMuni) stay null;
 * the Haversine + built-year filters downstream only need coordinates and year.
 */
export function mapChunkToSearchPropertyRow(
  chunk: RoofingOpportunityChunk,
): SearchInRadiusPropertyRow {
  return {
    propertyId: chunk.propertyId,
    parcelIdentifier: chunk.parcel_identifier ?? null,
    latitude: chunk.latitude,
    longitude: chunk.longitude,
    builtYear: chunk.built_year,
    builtYearSource: chunk.provenance === "synthetic_demo" ? "synthetic_demo" : null,
    addressStreet: chunk.address_street ?? null,
    addressCity: chunk.address_city ?? null,
    addressZip: null,
    hasPermits: chunk.has_open_roofing_permit,
    permitCount: null,
    hasBbbContractor: chunk.bbb_rating !== undefined ? chunk.bbb_rating !== null : null,
    gisMuni: null,
  };
}

/**
 * Builds a bbox property-row loader backed by the OpenSearch RAG index.
 */
export function createIndexedSearchPropertyRowLoader(
  client: Client,
  indexName: string = DEFAULT_RAG_INDEX_NAME,
): (arguments_: {
  county: string;
  boundingBox: SearchInRadiusBoundingBox;
  center: SearchInRadiusCenter;
}) => Promise<SearchInRadiusPropertyRow[]> {
  return async (arguments_) => {
    const response = await client.search({
      index: indexName,
      body: buildIndexedSearchQueryBody(arguments_),
    });

    const hits = (response.body.hits?.hits ?? []) as Array<{
      _source?: RoofingOpportunityChunk;
    }>;

    const rowsByPropertyId = new Map<string, SearchInRadiusPropertyRow>();
    for (const hit of hits) {
      if (hit._source === undefined) {
        continue;
      }
      const row = mapChunkToSearchPropertyRow(hit._source);
      if (!rowsByPropertyId.has(row.propertyId)) {
        rowsByPropertyId.set(row.propertyId, row);
      }
    }
    return [...rowsByPropertyId.values()];
  };
}
