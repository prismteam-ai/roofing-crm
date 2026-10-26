// Thin-router extraction (tasks.md T013; agent-design.md alakazam §1: "services/propertyDetail.ts
// (from property.ts, including bbbFor/lineageUrl)"). The business logic previously inline in
// routers/property.ts, unchanged — never recomputing or guessing a BBB rating (ADR-07,
// constitution P0-4). routers/property.ts now only validates input and shapes the tRPC response
// (traceId, error mapping); the new agent `getProperty` tool (Phase 4) calls this same function
// instead of a second copy.
import type { LeadIndex, PermitResult, PropertyResult } from "../adapters/duckDbParquet.js";
import { nearestPlace, type NearestPlace } from "./agent/placeResolver.js";

export type BbbStatus = "rated" | "not_found" | "blocked" | "not_checked";

/** contract v1.1 (Run 3) publishes `bbb_status` and `bbb_status_reason` on every permit row:
 *  `blocked` / `bbb_blocked` when the permit prints a contractor name (BBB blocks the lookup,
 *  Task A A-01; no rating is ever published), else `not_checked` / `contractor_unresolved`. The
 *  permit's own values are read verbatim (packages/oracle-contract/src/columns.ts). Only a permit
 *  that carries neither (an index built before v1.1, or a property with no permits) falls back to
 *  the v1 derivation — "contractor_unresolved if unresolved, else no_lexicon_carrier" — so the
 *  reason is never empty (AC-7) and a rating is never invented (ADR-07, constitution P0-4). */
export function bbbFor(
  permit: Pick<PermitResult, "contractorResolution" | "bbbStatus" | "bbbStatusReason"> | undefined,
): {
  bbbStatus: BbbStatus;
  bbbStatusReason: string;
} {
  if (permit?.bbbStatus != null && permit.bbbStatusReason != null) {
    return { bbbStatus: permit.bbbStatus, bbbStatusReason: permit.bbbStatusReason };
  }
  return {
    bbbStatus: "not_checked",
    bbbStatusReason:
      permit?.contractorResolution === "resolved" ? "no_lexicon_carrier" : "contractor_unresolved",
  };
}

/** Task A ships as CountyLens (docs/02-design.md). Since A-13 its
 *  Explorer lives at `/tx/travis/explore` (the earlier `/explore` answers 404 — that was this
 *  link's defect). The Explorer opens a property's panel from `sel` only when the property is
 *  among the search results, and it searches the default place (Austin, 5 mi) unless told
 *  otherwise, so the link also centres the search on the property (`at=lat,lon`, `r=1`, nearest
 *  first): the property is then always the first row. Without coordinates (a property the index
 *  holds no point for) only `sel` can be sent. The host comes only from `EXPLORER_BASE_URL`
 *  (set by infra from cdk context `crm:explorerBaseUrl`); when it is unset the link is null
 *  (the drawer and Apps menu then say it is not available) — there is no default host and never a
 *  placeholder. The path and parameters are fixed by Task A's own route (contracts/ui-routes.md:
 *  `at`, `r`, `sel`). */
export function lineageUrl(
  propertyCid: string,
  at?: { readonly lat: number | null; readonly lng: number | null },
): string | null {
  const base = countyLensBaseUrl();
  if (base === null) return null;
  const params = new URLSearchParams();
  if (at?.lat != null && at.lng != null) {
    params.set("at", `${String(at.lat)},${String(at.lng)}`);
    params.set("r", "1");
  }
  params.set("sel", propertyCid);
  return `${base}/tx/travis/explore?${params.toString().replace(/%2C/g, ",")}`;
}

/** CountyLens's origin (no trailing slash): the one config read shared by the lineage link and
 *  the shell's Apps menu (routers/shell.ts), so both always point at the same deploy. Null when
 *  `EXPLORER_BASE_URL` is unset or empty (same rule as `LANDING_PAGE_URL`). */
export function countyLensBaseUrl(): string | null {
  const base = process.env.EXPLORER_BASE_URL;
  if (base === undefined || base === "") return null;
  return base.replace(/\/$/, "");
}

export interface PropertyDetailResult {
  property: PropertyResult | null;
  permits: PermitResult[];
  bbbStatus: BbbStatus | null;
  bbbStatusReason: string | null;
  /** Null when `EXPLORER_BASE_URL` is not configured. */
  lineageUrl: string | null;
  manifestCid: string;
  /** The nearest travis-places@1.0.0 place centroid to the property's coordinates, for the
   *  drawer header "TCAD {id} · near {place}" (E-93). Absent when the property is not in this
   *  run or has no coordinates — the drawer then says why from the row's own `missing` entry. */
  nearPlace?: NearestPlace;
}

/** contracts/property-detail.md step 1: never throws when the CID isn't in the currently
 *  promoted run — a typed "not in this run" null, per the existing B-02 `LeadIndex.getProperty`
 *  contract. */
export async function propertyDetail(
  leadIndex: LeadIndex,
  propertyCid: string,
): Promise<PropertyDetailResult> {
  const [found, { manifestCid }] = await Promise.all([
    leadIndex.getProperty(propertyCid),
    leadIndex.indexInfo(),
  ]);

  if (found === null) {
    return {
      property: null,
      permits: [],
      bbbStatus: null,
      bbbStatusReason: null,
      lineageUrl: lineageUrl(propertyCid),
      manifestCid,
    };
  }

  const { permits, ...property } = found;
  // The first permit's BBB state stands for the drawer-level field; each permit card shows its
  // own (they differ when only some permits print a contractor name). A property with no permits
  // at all is "unresolved" by the vendored fallback rule (nothing to match a contractor on).
  const { bbbStatus, bbbStatusReason } = bbbFor(permits[0]);

  const near =
    property.latitude === null || property.longitude === null
      ? undefined
      : nearestPlace({ lat: property.latitude, lon: property.longitude });

  return {
    property,
    permits,
    bbbStatus,
    bbbStatusReason,
    lineageUrl: lineageUrl(propertyCid, {
      lat: property.latitude,
      lng: property.longitude,
    }),
    manifestCid,
    ...(near === undefined ? {} : { nearPlace: near }),
  };
}
