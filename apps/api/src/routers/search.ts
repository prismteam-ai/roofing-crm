/**
 * Search domain router.
 *
 * Turns a pin + radius into parcel candidates. Elephant `findPropertiesInArea`
 * is bbox-only, so this API converts radius to a bbox, loads candidates, then
 * drops anything outside the true circle via Haversine. Aging-roof filtering
 * uses `built_year` as a structure-age proxy (null years excluded). Chester GIS
 * MUNI clipping applies only when the request county is catalog-published
 * `chester`.
 */
import {
  listPublishedCounties as listPublishedCountiesFromElephantClient,
  type PublishedCountyCatalogEntry,
} from "@roofing-crm-challenge/elephant-client";
import { haversineDistanceMiles } from "@roofing-crm-challenge/shared";
import { z } from "zod";
import { publicProcedure, router } from "../trpc.js";
import { loadPublishedCountyCatalog } from "./counties.js";

/** Approximate statute miles per degree of latitude. */
const MILES_PER_DEGREE_LATITUDE = 69.0;

/** Chester pilot municipality codes (West Chester + Coatesville). */
const CHESTER_PILOT_GIS_MUNI_CODES = [1, 16] as const;

const searchInRadiusCenterSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * Input for radius search over published county parcels.
 *
 * `gisMuni` is accepted on every county so the Chester flip needs no client
 * rewrite; clipping runs only for catalog-published `chester`.
 */
export const searchInRadiusInputSchema = z.object({
  county: z.string().min(1),
  center: searchInRadiusCenterSchema,
  radiusMiles: z.number().positive(),
  minStructureAgeYears: z.number().int().positive().optional(),
  gisMuni: z.array(z.number().int()).optional(),
  limit: z.number().int().positive().optional(),
});

export type SearchInRadiusInput = z.infer<typeof searchInRadiusInputSchema>;

const searchInRadiusCandidateSchema = z.object({
  propertyId: z.string().min(1),
  parcelIdentifier: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  builtYear: z.number().int().nullable(),
  /** `synthetic_demo` on chester-demo rows; null on sourced counties. */
  builtYearSource: z.string().nullable(),
  addressStreet: z.string().nullable(),
  addressCity: z.string().nullable(),
  gisMuni: z.number().int().nullable(),
  distanceMiles: z.number(),
  /**
   * Published has-permits flag so the SPA permit layer can spend its
   * properties.get scan budget on parcels that actually have permits.
   */
  hasPermits: z.boolean().nullable(),
});

export type SearchInRadiusCandidate = z.infer<typeof searchInRadiusCandidateSchema>;

/** Geographic bounding box used to call bbox-only MCP area search. */
export interface SearchInRadiusBoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/**
 * Property row returned from the injectable bbox/MCP loader before Haversine.
 *
 * Optional `gisMuni` supports Chester pilot clipping; Lee rows leave it null
 * because the published Lee view has no municipality code.
 */
export interface SearchInRadiusPropertyRow {
  propertyId: string;
  parcelIdentifier: string | null;
  latitude: number;
  longitude: number;
  builtYear: number | null;
  /** Present on chester-demo (`synthetic_demo`); null/undefined elsewhere. */
  builtYearSource?: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressZip: string | null;
  hasPermits: boolean | null;
  permitCount: number | null;
  hasBbbContractor: boolean | null;
  gisMuni: number | null;
}

/** Pin center passed to bbox loaders for nearest-first DuckDB ordering. */
export interface SearchInRadiusCenter {
  lat: number;
  lng: number;
}

/**
 * Dependencies for the search router.
 *
 * Injected in Vitest so Haversine and MUNI policy can be tested without MCP.
 */
export interface SearchRouterDependencies {
  listPropertiesInBoundingBox: (arguments_: {
    county: string;
    boundingBox: SearchInRadiusBoundingBox;
    center: SearchInRadiusCenter;
  }) => Promise<SearchInRadiusPropertyRow[]>;
  listPublishedCounties: () => Promise<PublishedCountyCatalogEntry[]>;
}

/**
 * Converts degrees to radians.
 */
function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export { haversineDistanceMiles };

/**
 * Builds a WGS84 bounding box that fully contains a circle of the given radius.
 *
 * Longitude span widens near the poles via cos(latitude); the circle is
 * refined by Haversine after MCP returns bbox candidates.
 */
export function boundingBoxForRadiusMiles(
  centerLatitude: number,
  centerLongitude: number,
  radiusMiles: number,
): SearchInRadiusBoundingBox {
  const deltaLatitude = radiusMiles / MILES_PER_DEGREE_LATITUDE;
  const milesPerDegreeLongitude =
    MILES_PER_DEGREE_LATITUDE *
    Math.max(0.01, Math.cos(degreesToRadians(centerLatitude)));
  const deltaLongitude = radiusMiles / milesPerDegreeLongitude;

  return {
    minLat: centerLatitude - deltaLatitude,
    maxLat: centerLatitude + deltaLatitude,
    minLng: centerLongitude - deltaLongitude,
    maxLng: centerLongitude + deltaLongitude,
  };
}

/**
 * Whether Chester GIS MUNI clipping should run for this request.
 *
 * Requires the request county to be `chester` and that key to appear on the
 * published catalog — dataset-info alone must not enable clipping.
 */
export function shouldApplyChesterGisMuniClip(arguments_: {
  countyKey: string;
  catalogEntries: PublishedCountyCatalogEntry[];
}): boolean {
  const normalizedCountyKey = arguments_.countyKey.trim().toLowerCase();
  if (normalizedCountyKey !== "chester") {
    return false;
  }

  return arguments_.catalogEntries.some(
    (entry) =>
      entry.countyKey.trim().toLowerCase() === "chester" &&
      entry.propertyDatasetAvailable,
  );
}

/**
 * Resolves the inclusive built_year cutoff for the aging-roof layer.
 *
 * Structures at or older than this calendar year match the roof-age proxy
 * (`built_year <= currentUtcYear - minStructureAgeYears`).
 */
export function resolveAgingRoofBuiltYearCutoff(arguments_: {
  currentUtcYear: number;
  minStructureAgeYears: number;
}): number {
  return arguments_.currentUtcYear - arguments_.minStructureAgeYears;
}

/**
 * Whether a parcel belongs on the aging-roof layer via structure year built.
 *
 * Null `builtYear` is excluded — Elephant has no roof-install date, and missing
 * structure year must not invent age. Recent builds above the cutoff are out.
 */
export function isAgingRoofLayerCandidate(arguments_: {
  builtYear: number | null;
  currentUtcYear: number;
  minStructureAgeYears: number;
}): boolean {
  if (arguments_.builtYear === null) {
    return false;
  }

  const builtYearCutoff = resolveAgingRoofBuiltYearCutoff({
    currentUtcYear: arguments_.currentUtcYear,
    minStructureAgeYears: arguments_.minStructureAgeYears,
  });

  return arguments_.builtYear <= builtYearCutoff;
}

/**
 * Filters bbox MCP rows to those inside the pin radius, optionally Chester MUNI.
 *
 * Applies the aging-roof `built_year` proxy only when `minStructureAgeYears` is
 * set. Local SPA search omits it so the structure-year toggle can still show
 * unknown years. `gisMuni` is ignored unless Chester clipping is active; when
 * active and the client omits `gisMuni`, the pilot defaults to codes 1 and 16.
 */
export function filterSearchInRadiusCandidates(arguments_: {
  propertyRows: SearchInRadiusPropertyRow[];
  centerLatitude: number;
  centerLongitude: number;
  radiusMiles: number;
  applyChesterGisMuniClip: boolean;
  gisMuniFilter: number[] | undefined;
  minStructureAgeYears: number | undefined;
  currentUtcYear: number;
  limit: number | undefined;
}): SearchInRadiusCandidate[] {
  // The published Chester query table exposes no gis_muni column, so every
  // served row carries null — clipping would empty all results. Only clip
  // when the rows actually publish municipality codes.
  const anyRowPublishesGisMuni = arguments_.propertyRows.some(
    (propertyRow) => propertyRow.gisMuni !== null,
  );
  const allowedGisMuniCodes =
    arguments_.applyChesterGisMuniClip && anyRowPublishesGisMuni
      ? new Set(
          arguments_.gisMuniFilter && arguments_.gisMuniFilter.length > 0
            ? arguments_.gisMuniFilter
            : CHESTER_PILOT_GIS_MUNI_CODES,
        )
      : null;

  const candidates: SearchInRadiusCandidate[] = [];

  for (const propertyRow of arguments_.propertyRows) {
    if (allowedGisMuniCodes !== null) {
      if (
        propertyRow.gisMuni === null ||
        !allowedGisMuniCodes.has(propertyRow.gisMuni)
      ) {
        continue;
      }
    }

    if (
      arguments_.minStructureAgeYears !== undefined &&
      !isAgingRoofLayerCandidate({
        builtYear: propertyRow.builtYear,
        currentUtcYear: arguments_.currentUtcYear,
        minStructureAgeYears: arguments_.minStructureAgeYears,
      })
    ) {
      continue;
    }

    const distanceMiles = haversineDistanceMiles(
      arguments_.centerLatitude,
      arguments_.centerLongitude,
      propertyRow.latitude,
      propertyRow.longitude,
    );

    if (distanceMiles > arguments_.radiusMiles) {
      continue;
    }

    candidates.push({
      propertyId: propertyRow.propertyId,
      parcelIdentifier: propertyRow.parcelIdentifier,
      latitude: propertyRow.latitude,
      longitude: propertyRow.longitude,
      builtYear: propertyRow.builtYear,
      builtYearSource: propertyRow.builtYearSource ?? null,
      addressStreet: propertyRow.addressStreet,
      addressCity: propertyRow.addressCity,
      gisMuni: propertyRow.gisMuni,
      distanceMiles,
      hasPermits: propertyRow.hasPermits,
    });
  }

  candidates.sort((candidateA, candidateB) => {
    if (candidateA.distanceMiles !== candidateB.distanceMiles) {
      return candidateA.distanceMiles - candidateB.distanceMiles;
    }
    const builtYearA = candidateA.builtYear ?? Number.POSITIVE_INFINITY;
    const builtYearB = candidateB.builtYear ?? Number.POSITIVE_INFINITY;
    return builtYearA - builtYearB;
  });

  if (arguments_.limit !== undefined) {
    return candidates.slice(0, arguments_.limit);
  }

  return candidates;
}

/**
 * Executes radius search using the same policy as the tRPC procedure.
 */
export async function executeSearchInRadius(
  dependencies: SearchRouterDependencies,
  input: SearchInRadiusInput,
): Promise<SearchInRadiusCandidate[]> {
  const boundingBox = boundingBoxForRadiusMiles(
    input.center.lat,
    input.center.lng,
    input.radiusMiles,
  );

  const [propertyRows, catalogEntries] = await Promise.all([
    dependencies.listPropertiesInBoundingBox({
      county: input.county,
      boundingBox,
      center: input.center,
    }),
    dependencies.listPublishedCounties(),
  ]);

  return filterSearchInRadiusCandidates({
    propertyRows,
    centerLatitude: input.center.lat,
    centerLongitude: input.center.lng,
    radiusMiles: input.radiusMiles,
    applyChesterGisMuniClip: shouldApplyChesterGisMuniClip({
      countyKey: input.county,
      catalogEntries,
    }),
    gisMuniFilter: input.gisMuni,
    minStructureAgeYears: input.minStructureAgeYears,
    currentUtcYear: new Date().getUTCFullYear(),
    limit: input.limit,
  });
}

/**
 * Builds the search tRPC router over injectable bbox and catalog loaders.
 */
export function createSearchRouter(dependencies: SearchRouterDependencies) {
  return router({
    /**
     * Returns parcels inside a pin radius after bbox MCP + Haversine filter.
     *
     * Accepts optional `gisMuni` but applies it only for catalog-published
     * `chester`. Empty radius results are valid.
     */
    inRadius: publicProcedure
      .input(searchInRadiusInputSchema)
      .output(z.array(searchInRadiusCandidateSchema))
      .query(async ({ ctx, input }) => {
        const startedAtMs = Date.now();
        const boundingBox = boundingBoxForRadiusMiles(
          input.center.lat,
          input.center.lng,
          input.radiusMiles,
        );
        ctx.logger.info("search.inRadius.start", {
          county: input.county,
          radiusMiles: input.radiusMiles,
          limit: input.limit,
          center: input.center,
          boundingBox,
        });

        try {
          const candidates = await executeSearchInRadius(dependencies, input);
          const durationMs = Date.now() - startedAtMs;
          ctx.logger.info("search.inRadius.ok", {
            county: input.county,
            candidateCount: candidates.length,
            durationMs,
          });
          if (durationMs >= 25_000) {
            ctx.logger.warn("search.inRadius.slow", {
              county: input.county,
              durationMs,
              apiGatewayHttpTimeoutMs: 29_000,
            });
          }
          return candidates;
        } catch (error) {
          const durationMs = Date.now() - startedAtMs;
          ctx.logger.error("search.inRadius.failed", {
            county: input.county,
            radiusMiles: input.radiusMiles,
            durationMs,
            errorName: error instanceof Error ? error.name : "unknown",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }),
  });
}

/**
 * Production search router.
 *
 * Bbox MCP transport throws until Lambda wiring lands; unit tests inject mocks
 * through `createSearchRouter`.
 */
export const searchRouter = createSearchRouter({
  listPropertiesInBoundingBox: loadPropertiesInBoundingBox,
  listPublishedCounties: () =>
    listPublishedCountiesFromElephantClient(loadPublishedCountyCatalog),
});

/**
 * Loads property rows inside a bounding box from Elephant MCP.
 *
 * Throws until the Lambda MCP transport is configured — Vitest injects a mock
 * via `createSearchRouter` instead of calling this path.
 */
export async function loadPropertiesInBoundingBox(_arguments: {
  county: string;
  boundingBox: SearchInRadiusBoundingBox;
  center: SearchInRadiusCenter;
}): Promise<SearchInRadiusPropertyRow[]> {
  throw new Error(
    "Property bbox search transport is not configured; inject listPropertiesInBoundingBox in createSearchRouter or wire MCP in the Lambda handler",
  );
}
