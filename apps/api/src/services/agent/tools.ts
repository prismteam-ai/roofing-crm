// T032 (B-09, Phase 4/US1), reshaped in the 009-agent-hardening architecture fix (ADR-06 §6.2/§6.3
// as actually accepted: a *code-driven* dispatch, not an AI-SDK tool loop — see
// docs/decisions/0000-agent-architecture.md §6.1 "deterministic tool dispatch... QueryPlan.intent
// tells your code exactly which service function(s) to call"). This file used to wrap each of
// these functions in the AI SDK's `tool()` envelope so the model's own `generateText` tool loop
// could call them; the model never calls a tool directly any more — `apps/api/src/agent/
// composeAnswer.ts`'s `dispatchPlan` reads `QueryPlan.intent` and calls the matching plain async
// function below itself, deterministically. The underlying logic and the services called
// (`services/search.ts`, `services/propertyDetail.ts`, `services/agent/placeResolver.ts`) are
// unchanged — only the AI-SDK `tool()` wrapper (Zod `inputSchema` + `execute`) is gone, since
// there is no longer a model-facing tool-call contract to validate against.
//
// CRITICAL (constitution P0, FR-002/AC-2, contracts/agent-api.md's `agent.confirmLead`):
// `proposeLeads` reads only — a `getProperty`-shaped lookup plus a duplicate check straight
// against the `LeadRepo` port (crm-leads) — and writes nothing. This file must NEVER import the
// application-layer lead-write service or its context accessor (see T029's import guard test,
// `apps/api/test/services/agent/toolsImportGuard.test.ts`, which greps this file's own source for
// those two identifiers by name); only `apps/api/src/routers/agent.ts`'s separate, rep-triggered
// `confirmLead` mutation is allowed to reach that call.
import { leadKey, yearsToDays } from "@crm/domain";
import { gazetteer } from "@crm/oracle-views";
import { LIVE_PERMIT_STATUS_CLASSES, type PlaceResolver } from "@crm/shared";
import type { LeadIndex, PropertyResult } from "../../adapters/duckDbParquet.js";
import type { LeadRepo } from "../../adapters/leadRepo.js";
import { searchPermits, searchProperties } from "../search.js";
import { propertyDetail } from "../propertyDetail.js";

/** Shared by this tool's `getProperty` lookup and `routers/agent.ts`'s `confirmLead` handler: an
 *  indexed `LeadIndex.getPropertyByRequestIdentifier` lookup (a real `WHERE` filter), never the
 *  full-table-scan-then-`.find` workaround both call sites used to duplicate. */
export async function propertyByTcadId(
  leadIndex: LeadIndex,
  tcadId: string,
): Promise<PropertyResult | undefined> {
  return leadIndex.getPropertyByRequestIdentifier(tcadId);
}

async function propertyCidForTcadId(
  leadIndex: LeadIndex,
  tcadId: string,
): Promise<string | undefined> {
  return (await propertyByTcadId(leadIndex, tcadId))?.propertyCid;
}

/** "Open" includes stalled (a stalled permit is open and not progressing), the one definition the
 *  map filter, the lead reasoning and the agent share (`isLivePermit`). The classes go to the index,
 *  which also requires no final date for open and stalled (a finaled permit is finished). */
export function withStalledWhenOpen(
  statusClass: readonly ("open" | "stalled" | "closed")[],
): ("open" | "stalled" | "closed")[] {
  const out = new Set(statusClass);
  if (out.has("open")) for (const live of LIVE_PERMIT_STATUS_CLASSES) out.add(live);
  return [...out];
}

/** Caps how many full rows ever go to the model in one dispatch result (ADR §6.2: "≤25 compact
 *  rows") — the UI pages the full set from `resultSetId`/the index itself, never from here. */
const MAX_COMPACT_ROWS = 25;

/** ADR-03 (amended 2026-10-25): the owner name is shown on screen but NEVER sent to the model.
 *  Returns a copy of `value` with every `ownerName` key, at any depth, set to null. Every tool
 *  result that can reach the model passes through this, whatever row shape it carries. */
export function withoutOwnerName<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutOwnerName(item)) as T;
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = key === "ownerName" ? null : withoutOwnerName(inner);
    }
    return out as T;
  }
  return value;
}

export interface AgentDispatchDeps {
  readonly leadIndex: LeadIndex;
  readonly leadRepo: LeadRepo;
  readonly placeResolver: PlaceResolver;
}

export interface ResolvePlaceArgs {
  readonly text: string;
}

export interface SearchPropertiesArgs {
  readonly lat: number;
  readonly lon: number;
  readonly radiusMi: number;
  readonly roofAgeMinYears?: number | undefined;
  /** T043 (B-09/US2, G4 "owners outside the area"): exact match against the stored
   *  ownerAreaClass enum. */
  readonly ownerAreaClass?: readonly string[] | undefined;
  readonly tenureYearsMin?: number | undefined;
  /** Permit condition ("with a stalled roofing permit"): keep only properties that have a permit
   *  of one of these classes (and open at least `openYearsMin` years, on the same permit). It is
   *  applied in SQL to every property in range, before the page and the counts. */
  readonly statusClass?: readonly ("open" | "stalled" | "closed")[] | undefined;
  readonly openYearsMin?: number | undefined;
}

export interface SearchPermitsArgs {
  readonly lat: number;
  readonly lon: number;
  readonly radiusMi: number;
  readonly statusClass?: readonly ("open" | "stalled" | "closed")[] | undefined;
  readonly openYearsMin?: number | undefined;
  /** T044 (B-09/US2, G5 "exact permit lookup"): scoped to the same radius as every other filter
   *  here (SC-06) — never a second, unscoped lookup path. */
  readonly permitNumber?: string | undefined;
}

export interface GetPropertyArgs {
  readonly tcadId?: string | undefined;
  readonly propertyCid?: string | undefined;
}

export interface ProposeLeadsArgs {
  readonly tcadIds: readonly string[];
}

/** Dropped the AI-SDK `tool()` envelope (see file header) — every function below is now a plain
 *  async function `apps/api/src/agent/composeAnswer.ts`'s `dispatchPlan` calls directly, keyed off
 *  `QueryPlan.intent`. Never writes anything (`proposeLeads` included — it only reads `leadRepo`
 *  for a duplicate check; see the file-header CRITICAL note). */
export function createAgentDispatch(deps: AgentDispatchDeps) {
  const { leadIndex, leadRepo, placeResolver } = deps;

  async function resolvePlace({ text }: ResolvePlaceArgs) {
    const resolution = await placeResolver.resolve(text);
    return {
      status: resolution.status,
      source: resolution.source,
      candidates: resolution.candidates.map((c) => ({
        name: c.name,
        lat: c.lat,
        lon: c.lon,
        match: c.match,
        score: c.score,
      })),
    };
  }

  async function searchPropertiesDispatch({
    lat,
    lon,
    radiusMi,
    roofAgeMinYears,
    ownerAreaClass,
    tenureYearsMin,
    statusClass,
    openYearsMin,
  }: SearchPropertiesArgs) {
    const result = await searchProperties(leadIndex, {
      center: { lat, lng: lon },
      radiusMi,
      ...(roofAgeMinYears === undefined ? {} : { roofAgeMinYears }),
      ...(statusClass === undefined || statusClass.length === 0
        ? {}
        : { permitStatusClass: withStalledWhenOpen(statusClass) }),
      ...(openYearsMin === undefined ? {} : { permitOpenDaysMin: yearsToDays(openYearsMin) }),
      ...(ownerAreaClass === undefined ? {} : { ownerAreaClass }),
      ...(tenureYearsMin === undefined ? {} : { tenureYearsMin }),
      limit: MAX_COMPACT_ROWS,
    });
    return withoutOwnerName({
      manifestCid: result.manifestCid,
      counts: result.counts,
      properties: result.properties.slice(0, MAX_COMPACT_ROWS),
    });
  }

  async function searchPermitsDispatch({
    lat,
    lon,
    radiusMi,
    statusClass,
    openYearsMin,
    permitNumber,
  }: SearchPermitsArgs) {
    // Filters, sort, page and total all run in SQL (services/search.ts): at most
    // MAX_COMPACT_ROWS rows and an exact count reach the model, whatever the radius. An exact
    // permit-number lookup ignores the radius (a county-wide circle is never built for it).
    const result = await searchPermits(leadIndex, {
      center: { lat, lng: lon },
      radiusMi,
      ...(permitNumber === undefined ? {} : { permitNumber }),
      ...(statusClass === undefined ? {} : { statusClass: withStalledWhenOpen(statusClass) }),
      ...(openYearsMin === undefined ? {} : { openDaysMin: yearsToDays(openYearsMin) }),
      limit: MAX_COMPACT_ROWS,
    });
    return withoutOwnerName({
      manifestCid: result.manifestCid,
      // B-09 review (CR finding 10): the full matching count, before the compact-row cap.
      matched: result.total,
      permits: result.permits.slice(0, MAX_COMPACT_ROWS),
    });
  }

  async function getPropertyDispatch({ tcadId, propertyCid }: GetPropertyArgs) {
    const cid =
      propertyCid ??
      (tcadId !== undefined ? await propertyCidForTcadId(leadIndex, tcadId) : undefined);
    if (cid === undefined) return { found: false as const };

    const detail = await propertyDetail(leadIndex, cid);
    if (detail.property === null) return { found: false as const };
    return withoutOwnerName({
      found: true as const,
      manifestCid: detail.manifestCid,
      property: detail.property,
      permits: detail.permits,
      bbbStatus: detail.bbbStatus,
      bbbStatusReason: detail.bbbStatusReason,
    });
  }

  async function getCoverageDispatch() {
    return leadIndex.indexInfo();
  }

  async function proposeLeadsDispatch({ tcadIds }: ProposeLeadsArgs) {
    const proposals = await Promise.all(
      tcadIds.map(async (tcadId) => {
        const key = leadKey(gazetteer.TRAVIS_FIPS, tcadId);
        const existing = await leadRepo.get(key); // read-only duplicate check; never writes
        return {
          tcadId,
          alreadyLead: existing !== null,
          leadId: existing?.lead.leadId,
        };
      }),
    );
    return { proposals };
  }

  return {
    resolvePlace,
    searchProperties: searchPropertiesDispatch,
    searchPermits: searchPermitsDispatch,
    getProperty: getPropertyDispatch,
    getCoverage: getCoverageDispatch,
    proposeLeads: proposeLeadsDispatch,
  };
}

export type AgentDispatch = ReturnType<typeof createAgentDispatch>;

// Referenced only for its type above (PropertyResult/searchProperties' return shape) — kept as an
// explicit import rather than an inline `Awaited<...>` so this file documents, in its own import
// list, exactly which service-layer shapes it depends on.
export type { PropertyResult };
