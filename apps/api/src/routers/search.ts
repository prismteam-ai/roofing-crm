// T013 (B-03, US1): search.properties per contracts/search-api.md. Thin-router extraction
// (tasks.md T012, agent-design.md alakazam §1): the radius/roof-age/permit business logic now
// lives in ../services/search.ts, shared with the new agent tools (Phase 4) — this router only
// validates input, calls the service, and shapes the tRPC response (manifestCid/traceId, typed
// error mapping).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  DEFAULT_SIMILAR_ROWS,
  HEX_OVERVIEW_MAX_ZOOM,
  MAX_PERMIT_ROWS,
  MAX_PROPERTY_ROWS,
  MAX_RADIUS_MI,
  MAX_SIMILAR_ROWS,
  MIN_RADIUS_MI,
} from "@crm/domain";
import { mapIndexNotReady, publicProcedure, requireLeadIndex, router } from "../trpc.js";
import {
  countyOverview as countyOverviewService,
  searchByAddress as searchByAddressService,
  CountyOverviewUnavailableError,
  searchPermits as searchPermitsService,
  searchProperties as searchPropertiesService,
  SIMILAR_RADIUS_MI,
  SIMILAR_ROOF_AGE_BAND_YEARS,
  similarProperties as similarPropertiesService,
  SimilarUnavailableError,
} from "../services/search.js";

const CountyOverviewInput = z.object({
  zoom: z
    .number()
    .int()
    .min(0)
    .max(HEX_OVERVIEW_MAX_ZOOM - 1),
  roofAgeMinYears: z.number().int().min(0).max(200).optional(),
  propertyUsageType: z.string().min(1).max(64).optional(),
  permits: z.boolean().optional(),
  permitStatus: z.enum(["open", "stalled"]).optional(),
  permitOpenDaysMin: z.number().int().min(0).max(36_500).optional(),
});

const LatLngInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Where an exact lookup (permit number, TCAD account) lands: the property and its coordinates, or
 *  a plain "not found" naming the run searched (the search box says so, never guesses). */
const ExactLookupInput = z.object({ value: z.string().trim().min(1).max(40) });
type ExactHit = {
  found: true;
  propertyCid: string;
  lat: number;
  lng: number;
  runId: string | null;
  traceId: string;
};
type ExactMiss = { found: false; runId: string | null; traceId: string };

const SearchPropertiesInput = z.object({
  center: LatLngInput,
  // FR-001/data-model.md: inclusive 0.5-25 mi, a Zod error outside it — never silently clamped.
  radiusMi: z.number().min(MIN_RADIUS_MI).max(MAX_RADIUS_MI),
  roofAgeMinYears: z.number().int().optional(),
  // Owner filters: tenure in whole years (stored `tenureYears` >= N; the column is carried in the index, so the filter is exact), and owners whose mailing
  // area is outside the county area (`ownerAreaClass` regional or out_of_area).
  tenureYearsMin: z.number().int().min(0).max(100).optional(),
  outOfArea: z.boolean().optional(),
  // Permit filters, applied in SQL to every property in the circle (not to the returned page).
  // The map's "Open" sends ["open","stalled"], its "Stalled" sends ["stalled"].
  permitStatusClass: z
    .array(z.enum(["open", "stalled", "closed"]))
    .min(1)
    .optional(),
  permitOpenDaysMin: z.number().int().min(0).max(36_500).optional(),
  // architecture-constitution.md §6's page-limit bound.
  limit: z.number().int().positive().max(MAX_PROPERTY_ROWS).optional(),
});

export const searchRouter = router({
  properties: publicProcedure.input(SearchPropertiesInput).query(async ({ input, ctx }) => {
    const leadIndex = requireLeadIndex(ctx);
    try {
      const result = await searchPropertiesService(leadIndex, input);
      return { ...result, traceId: ctx.requestId };
    } catch (error) {
      mapIndexNotReady(error);
    }
  }),

  // T028 (B-03, US3): search.permits per contracts/search-api.md. sort is fixed to "openDays".
  permits: publicProcedure
    .input(
      z.object({
        center: LatLngInput,
        radiusMi: z.number().min(MIN_RADIUS_MI).max(MAX_RADIUS_MI),
        sort: z.literal("openDays"),
        // Page size (default and ceiling 500: a permit row is about 0.7 KB). The response carries
        // `total` and `truncated`, so a clipped page is never presented as the whole set.
        limit: z.number().int().positive().max(MAX_PERMIT_ROWS).optional(),
        // Server-side filters (previously applied by the client over every permit in the radius).
        statusClass: z
          .array(z.enum(["open", "stalled", "closed"]))
          .min(1)
          .optional(),
        openDaysMin: z.number().int().min(0).max(36_500).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const leadIndex = requireLeadIndex(ctx);
      try {
        const { sort: _sort, ...rest } = input;
        const result = await searchPermitsService(leadIndex, rest);
        return { ...result, traceId: ctx.requestId };
      } catch (error) {
        mapIndexNotReady(error);
      }
    }),

  // Search box (Map top bar): an exact permit number, with or without the " BP" suffix the stored
  // numbers carry. Read-only; the radius is irrelevant to an exact lookup (the service ignores it).
  byPermitNumber: publicProcedure
    .input(ExactLookupInput)
    .query(async ({ input, ctx }): Promise<ExactHit | ExactMiss> => {
      const leadIndex = requireLeadIndex(ctx);
      try {
        const runId = (await leadIndex.currentRunId()) ?? null;
        const candidates = /^\d{4}-\d{6}$/.test(input.value)
          ? [`${input.value} BP`, input.value]
          : [input.value];
        for (const permitNumber of candidates) {
          const { permits } = await searchPermitsService(leadIndex, {
            center: { lat: 0, lng: 0 },
            radiusMi: MIN_RADIUS_MI,
            permitNumber,
            limit: 1,
          });
          const hit = permits[0];
          if (hit === undefined) continue;
          const property = await leadIndex.getProperty(hit.propertyCid);
          if (property === null || property.latitude === null || property.longitude === null) {
            continue;
          }
          return {
            found: true,
            propertyCid: property.propertyCid,
            lat: property.latitude,
            lng: property.longitude,
            runId,
            traceId: ctx.requestId,
          };
        }
        return { found: false, runId, traceId: ctx.requestId };
      } catch (error) {
        mapIndexNotReady(error);
      }
    }),

  // Search box: a TCAD account number (the property's requestIdentifier), via the indexed lookup.
  byTcadId: publicProcedure
    .input(ExactLookupInput)
    .query(async ({ input, ctx }): Promise<ExactHit | ExactMiss> => {
      const leadIndex = requireLeadIndex(ctx);
      try {
        const runId = (await leadIndex.currentRunId()) ?? null;
        const property = await leadIndex.getPropertyByRequestIdentifier(input.value);
        if (property === undefined || property.latitude === null || property.longitude === null) {
          return { found: false, runId, traceId: ctx.requestId };
        }
        return {
          found: true,
          propertyCid: property.propertyCid,
          lat: property.latitude,
          lng: property.longitude,
          runId,
          traceId: ctx.requestId,
        };
      } catch (error) {
        mapIndexNotReady(error);
      }
    }),

  // Search box: exact street address (TCAD's unnormalized_address, Run 3.1). The matching rule is
  // documented on `normalisedAddressSql` in the adapter. Read-only; a miss names the run searched.
  byAddress: publicProcedure
    .input(
      z.object({
        value: z.string().trim().min(3).max(200),
        limit: z.number().int().min(1).max(10).default(5),
      }),
    )
    .query(async ({ input, ctx }) => {
      const leadIndex = requireLeadIndex(ctx);
      try {
        const result = await searchByAddressService(leadIndex, input);
        return { ...result, traceId: ctx.requestId };
      } catch (error) {
        mapIndexNotReady(error);
      }
    }),

  // Drawer "Similar properties": same property type, roof age within 5 years, within 1 mile,
  // nearest first. Read-only; an empty list always says why (`reason`).
  similar: publicProcedure
    .input(
      z.object({
        propertyCid: z.string().min(1).max(100),
        limit: z.number().int().min(1).max(MAX_SIMILAR_ROWS).default(DEFAULT_SIMILAR_ROWS),
      }),
    )
    .query(async ({ input, ctx }) => {
      const leadIndex = requireLeadIndex(ctx);
      try {
        const result = await similarPropertiesService(leadIndex, input);
        // The matching rules travel with the answer so the drawer states them from the server.
        return {
          ...result,
          radiusMi: SIMILAR_RADIUS_MI,
          roofAgeBandYears: SIMILAR_ROOF_AGE_BAND_YEARS,
          limit: input.limit,
          traceId: ctx.requestId,
        };
      } catch (error) {
        if (error instanceof SimilarUnavailableError) {
          throw new TRPCError({ code: "NOT_IMPLEMENTED", message: error.message, cause: error });
        }
        mapIndexNotReady(error);
      }
    }),

  // design-review-log row 10: the whole-county hexagon aggregate for the map's zoomed-out view.
  // Behind the same Cognito JWT authorizer as every route but health.ping/auth.reportFailedAttempt
  // (infra/lib/crm-api-stack.ts). `zoom` is the whole-number map zoom, overview zooms only.
  countyOverview: publicProcedure.input(CountyOverviewInput).query(async ({ input, ctx }) => {
    const leadIndex = requireLeadIndex(ctx);
    try {
      const result = await countyOverviewService(leadIndex, input);
      return { ...result, traceId: ctx.requestId };
    } catch (error) {
      if (error instanceof CountyOverviewUnavailableError) {
        throw new TRPCError({ code: "NOT_IMPLEMENTED", message: error.message, cause: error });
      }
      mapIndexNotReady(error);
    }
  }),
});
