/**
 * Counties domain router.
 *
 * Surfaces the live Elephant published-county catalog and derives the CRM
 * default geography from the served catalog (including Chester overlays).
 */
import {
  listPublishedCounties as listPublishedCountiesFromElephantClient,
  type PublishedCountyCatalogEntry,
} from "@roofing-crm-challenge/elephant-client";
import {
  parseCountyCatalogKey,
  type CoverageMode,
  type CountyCatalogKey,
} from "@roofing-crm-challenge/shared";
import { z } from "zod";
import { publicProcedure, router } from "../trpc.js";

export const publishedCountyListItemSchema = z.object({
  countyKey: z.string().min(1),
  countyName: z.string().min(1),
  stateCode: z.string().min(1),
  propertyDatasetAvailable: z.boolean(),
  mapSearchReady: z.boolean(),
});

const defaultCountyResultSchema = z.object({
  countyKey: z.string().min(1),
  coverageMode: z.enum([
    "lee_dev_fallback",
    "chester_demo_synthetic",
    "chester_real_limited",
    "montgomery_roof_age_demo",
  ]),
});

/** Result of resolving the CRM default county from a published catalog snapshot. */
export interface DefaultCountyResult {
  countyKey: CountyCatalogKey;
  coverageMode: CoverageMode;
}

/**
 * Dependencies for the counties router.
 *
 * `listPublishedCounties` is injectable so Vitest can supply a mocked catalog
 * without calling live MCP.
 */
export interface CountiesRouterDependencies {
  listPublishedCounties: () => Promise<PublishedCountyCatalogEntry[]>;
}

/**
 * Resolves the CRM default county from a served catalog snapshot.
 *
 * Prefers map-ready `chester-demo`, then `chester`, then `lee`. Throws when
 * none of those keys can serve radius search.
 */
export function resolveDefaultCountyFromCatalog(
  catalogEntries: PublishedCountyCatalogEntry[],
): DefaultCountyResult {
  const chesterDemoMapSearchReady = catalogEntries.find(
    (entry) =>
      entry.countyKey.trim().toLowerCase() === "chester-demo" && entry.mapSearchReady,
  );
  if (chesterDemoMapSearchReady !== undefined) {
    return {
      countyKey: parseCountyCatalogKey("chester-demo"),
      coverageMode: "chester_demo_synthetic",
    };
  }

  const chesterMapSearchReady = catalogEntries.find(
    (entry) =>
      entry.countyKey.trim().toLowerCase() === "chester" && entry.mapSearchReady,
  );
  if (chesterMapSearchReady !== undefined) {
    return {
      countyKey: parseCountyCatalogKey("chester"),
      coverageMode: "chester_real_limited",
    };
  }

  const leeMapSearchReady = catalogEntries.find(
    (entry) => entry.countyKey.trim().toLowerCase() === "lee" && entry.mapSearchReady,
  );
  if (leeMapSearchReady !== undefined) {
    return {
      countyKey: parseCountyCatalogKey("lee"),
      coverageMode: "lee_dev_fallback",
    };
  }

  throw new Error(
    "Published catalog has no usable default county (need map-search-ready chester-demo, chester, or lee)",
  );
}

/**
 * Builds the counties tRPC router over an injectable catalog loader.
 */
export function createCountiesRouter(dependencies: CountiesRouterDependencies) {
  return router({
    /**
     * Returns published catalog counties for UI county switchers.
     * Only keys present on the live catalog are included.
     */
    list: publicProcedure
      .output(z.array(publishedCountyListItemSchema))
      .query(async ({ ctx }) => {
        ctx.logger.debug("counties.list");
        const catalogEntries = await dependencies.listPublishedCounties();
        return catalogEntries.map((entry) => ({
          countyKey: entry.countyKey,
          countyName: entry.countyName,
          stateCode: entry.stateCode,
          propertyDatasetAvailable: entry.propertyDatasetAvailable,
          mapSearchReady: entry.mapSearchReady,
        }));
      }),

    /**
     * Returns the CRM default countyKey and coverageMode from the catalog.
     * Fort Myers / West Chester map pins are UI concerns — this returns keys only.
     */
    defaultCounty: publicProcedure
      .output(defaultCountyResultSchema)
      .query(async ({ ctx }) => {
        ctx.logger.debug("counties.defaultCounty");
        const catalogEntries = await dependencies.listPublishedCounties();
        return resolveDefaultCountyFromCatalog(catalogEntries);
      }),
  });
}

/**
 * Production counties router.
 *
 * Uses elephant-client `listPublishedCounties`. The MCP transport is injected
 * via `loadPublishedCountyCatalog`; wire that in Lambda when the client exists.
 */
export const countiesRouter = createCountiesRouter({
  listPublishedCounties: () =>
    listPublishedCountiesFromElephantClient(loadPublishedCountyCatalog),
});

/**
 * Loads the raw published-county catalog for production.
 *
 * Throws until the Lambda MCP transport is configured — unit tests inject a
 * mock through `createCountiesRouter` instead of calling this path.
 */
export async function loadPublishedCountyCatalog(): Promise<unknown> {
  throw new Error(
    "Published county catalog transport is not configured; inject listPublishedCounties in createCountiesRouter or wire MCP in the Lambda handler",
  );
}
