import {
  type LatLon,
  type LeadCandidate,
  type LeadSignals,
  type OpenRoofPermit,
  type SearchInput,
  type SearchResult,
} from "@crm/shared";
import {
  DatasetInfo,
  PermitDetail as PermitDetailSchema,
  PermitLead,
  PropertyDetail as PropertyDetailSchema,
  PropertyLead,
  ResolvedPlace,
} from "oracle-broward/contract";
import { z } from "zod";
import { isInsideCoverage } from "./coverage.ts";
import { OracleContractError, OracleManifestMismatch, oracleGet, type HttpOpts } from "./http.ts";
import { scoreCandidate } from "./score.ts";

export { isInsideCoverage } from "./coverage.ts";
export { OracleContractError, OracleManifestMismatch, OracleUnavailable } from "./http.ts";
export { scoreCandidate } from "./score.ts";

export type PropertyDetail = z.infer<typeof PropertyDetailSchema>;
export type PermitDetail = z.infer<typeof PermitDetailSchema>;

const Health = z.object({ ok: z.boolean(), manifestCid: z.string().nullable() }).loose();
const Uncovered = z.array(z.object({ name: z.string() }).loose());
const AgedRoofs = z.object({ total: z.number(), rows: z.array(PropertyLead), uncovered: Uncovered });
const OpenPermits = z.object({ total: z.number(), rows: z.array(PermitLead), uncovered: Uncovered });

/** Rows per query: the Oracle caps a query at 5,000; a 25-mile radius stays far below that for open permits. */
const ROW_LIMIT = 2000;

export interface OracleData {
  readonly manifestCid: string;
  health(): Promise<{ ok: boolean; manifestCid: string | null; mismatch: boolean }>;
  /** Run facts for the snapshot banner: views version, run id, as-of date and view row counts. */
  dataset(): Promise<{ viewsVersion: string; runId: string; asOf: string; counts: Record<string, number> }>;
  search(input: SearchInput): Promise<SearchResult>;
  property(id: string): Promise<PropertyDetail | null>;
  permit(id: string): Promise<PermitDetail | null>;
  resolvePlace(name: string): Promise<(LatLon & { name: string }) | null>;
  hasProperty(id: string): Promise<boolean>;
  signalsFor(id: string): Promise<LeadSignals | null>;
}

export function createOracleData(opts: {
  apiUrl: string;
  expectedManifestCid: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): OracleData {
  const http: HttpOpts = {
    apiUrl: opts.apiUrl,
    fetchImpl: opts.fetchImpl ?? fetch,
    timeoutMs: opts.timeoutMs ?? 10_000,
  };
  const expected = opts.expectedManifestCid;
  /** Every row names the run it came from; rows of another run are never mixed in. */
  const pinned = (rows: { manifest_cid: string | null }[]) => {
    const other = rows.find((r) => r.manifest_cid !== expected);
    if (other) throw new OracleManifestMismatch(expected, other.manifest_cid);
  };
  const qs = (p: Record<string, number | string>) =>
    new URLSearchParams(Object.entries(p).map(([k, v]): [string, string] => [k, String(v)])).toString();

  async function property(id: string) {
    const d = await oracleGet(http, `/api/property/${encodeURIComponent(id)}`, PropertyDetailSchema);
    if (d) pinned([d.property]);
    return d;
  }

  return {
    manifestCid: expected,

    async health() {
      const h = await oracleGet(http, "/api/health", Health);
      const manifestCid = h?.manifestCid ?? null;
      return { ok: Boolean(h?.ok), manifestCid, mismatch: manifestCid !== expected };
    },

    async dataset() {
      const d = await oracleGet(http, "/api/dataset", DatasetInfo);
      if (!d) throw new OracleContractError("Oracle has no /api/dataset");
      if (d.manifestCid !== expected) throw new OracleManifestMismatch(expected, d.manifestCid);
      return { viewsVersion: d.viewsVersion, runId: d.runId, asOf: d.asOf, counts: d.counts };
    },

    async search(input) {
      if (!isInsideCoverage(input.center)) {
        return {
          candidates: [],
          outsideCoverage: true,
          permitGaps: [],
          capped: [],
          rowLimit: ROW_LIMIT,
          manifestCid: expected,
        };
      }
      const base = {
        lat: input.center.lat,
        lon: input.center.lon,
        radiusMiles: input.radiusMiles,
        limit: ROW_LIMIT,
      };
      const [aged, open] = await Promise.all([
        input.layers.includes("aged_roofs")
          ? oracleGet(
              http,
              // Nearest first: a capped layer still covers the area, and the threshold changes it.
              `/api/query/aged-roofs?${qs({ ...base, minRoofAgeYears: input.minRoofAgeYears, order: "nearest" })}`,
              AgedRoofs,
            )
          : null,
        input.layers.includes("open_permits")
          ? oracleGet(
              http,
              `/api/query/open-permits?${qs({ ...base, minOpenYears: input.minOpenYears })}`,
              OpenPermits,
            )
          : null,
      ]);
      pinned([...(aged?.rows ?? []), ...(open?.rows ?? [])]);

      type Draft = Omit<LeadCandidate, "score" | "reasons">;
      const byId = new Map<string, Draft>();
      for (const p of aged?.rows ?? []) {
        if (p.lat === null || p.lon === null) continue;
        byId.set(p.parcel_identifier, {
          propertyId: p.parcel_identifier,
          propertyCid: p.property_cid,
          address: p.address,
          city: p.city,
          lat: p.lat,
          lon: p.lon,
          roofAgeYears: p.roof_age_years,
          roofAgeBasis: p.roof_age_basis ?? "unknown",
          openRoofPermits: [],
        });
      }
      const statuses = input.permitStatus;
      for (const r of open?.rows ?? []) {
        // A permit the Oracle could not link to a parcel cannot become a property lead.
        if (!r.parcel_identifier || r.lat === null || r.lon === null) continue;
        if (statuses && !statuses.includes(r.status)) continue;
        const permit: OpenRoofPermit = {
          permitId: r.permit_key,
          openDays: r.open_days,
          status: r.status,
          contractorName: r.contractor_name,
          contractorLicenseStatus: r.contractor_license_status,
          bbbGrade: r.bbb_rating,
        };
        const c = byId.get(r.parcel_identifier) ?? {
          propertyId: r.parcel_identifier,
          propertyCid: r.property_cid,
          address: r.address,
          city: r.city,
          lat: r.lat,
          lon: r.lon,
          // The Oracle joins the property's roof age onto each permit row.
          roofAgeYears: r.roof_age_years ?? null,
          roofAgeBasis: r.roof_age_basis ?? "unknown",
          openRoofPermits: [],
        };
        c.openRoofPermits.push(permit);
        byId.set(r.parcel_identifier, c);
      }
      const maxOpen = (c: Draft) => Math.max(0, ...c.openRoofPermits.map((p) => p.openDays ?? 0));
      const candidates = [...byId.values()]
        .map((c) => ({ ...c, ...scoreCandidate(c, { minRoofAgeYears: input.minRoofAgeYears }) }))
        .sort(
          (a, b) => b.score - a.score || maxOpen(b) - maxOpen(a) || a.propertyId.localeCompare(b.propertyId),
        );
      const permitGaps = [
        ...new Set([...(aged?.uncovered ?? []), ...(open?.uncovered ?? [])].map((u) => u.name)),
      ];
      const capped: SearchResult["capped"] = [];
      if ((aged?.rows.length ?? 0) >= ROW_LIMIT) capped.push("aged_roofs");
      if ((open?.rows.length ?? 0) >= ROW_LIMIT) capped.push("open_permits");
      return {
        candidates,
        outsideCoverage: false,
        permitGaps,
        capped,
        rowLimit: ROW_LIMIT,
        manifestCid: expected,
      };
    },

    property,

    async permit(id) {
      const d = await oracleGet(http, `/api/permit/${encodeURIComponent(id)}`, PermitDetailSchema);
      if (d?.property) pinned([d.property]);
      return d;
    },

    async resolvePlace(name) {
      const p = await oracleGet(http, `/api/place?${qs({ name })}`, ResolvedPlace);
      return p ? { name: p.name, lat: p.lat, lon: p.lon } : null;
    },

    async hasProperty(id) {
      return (await property(id)) !== null;
    },

    async signalsFor(id) {
      const d = await property(id);
      if (!d) return null;
      const p = d.property;
      return {
        roofAgeYears: p.roof_age_years,
        roofAgeBasis: p.roof_age_basis ?? "unknown",
        maxOpenDays: p.max_open_days,
        // Property detail carries no BBB grade; the pinned run has none (BBB answered 403).
        bbbGrade: null,
        ownerLocationClass: p.owner_location_class ?? "unknown",
      };
    },
  };
}
