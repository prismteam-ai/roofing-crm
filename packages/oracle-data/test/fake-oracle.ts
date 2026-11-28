import { PermitLead, PropertyLead } from "oracle-broward/contract";
import type { z } from "zod";

export const CID = "bafkreigdrq3tmzv6wk4ymglnlncrxflgsdkcw6g4z6hmzbbtdtp4lxvdqi";
export const OTHER_CID = "bafkreihndgnyrwxk7pqrt4hbdng4zpthn4h75bpg37e4224m3bz6ixoj4u";
export const FTL = { lat: 26.1224, lon: -80.1373 };

type Prop = z.infer<typeof PropertyLead>;
type Permit = z.infer<typeof PermitLead>;

export function property(over: Partial<Prop> = {}): Prop {
  return PropertyLead.parse({
    parcel_identifier: "504203010010",
    property_cid: "baguqeeraproperty",
    address: "100 SE 1st Ave",
    city: "Fort Lauderdale",
    zip: "33301",
    lat: 26.12,
    lon: -80.14,
    geo_status: "parcel_centroid",
    property_type: "SingleFamily",
    property_usage_type: "Residential",
    year_built: 2001,
    roof_date: null,
    roof_age_years: 25,
    roof_age_basis: "year_built",
    roof_age_confidence: "low",
    owner_type: "person",
    owner_location_class: "in_county",
    occupancy_class: "owner_occupied",
    homestead: true,
    last_sale_date: "2010-01-01",
    years_since_transfer: 16,
    last_sale_price: 300000,
    market_value: 500000,
    open_roof_permits: 0,
    max_open_days: null,
    permit_jurisdiction_covered: true,
    roll_source: "bcpa-taxroll",
    source_url: "https://bcpa.net",
    retrieved_at: "2026-11-27",
    manifest_cid: CID,
    provenance: [{ source_url: "https://bcpa.net" }],
    distance_miles: 0.4,
    ...over,
  });
}

export function permit(over: Partial<Permit> = {}): Permit {
  return PermitLead.parse({
    permit_key: "ftl:R-1",
    property_improvement_cid: null,
    parcel_identifier: "504203010010",
    property_cid: "baguqeeraproperty",
    address: "100 SE 1st Ave",
    city: "Fort Lauderdale",
    lat: 26.12,
    lon: -80.14,
    permit_number: "R-1",
    permit_type: "Roof",
    description: "Reroof",
    raw_status: "Issued",
    status: "open",
    roof_work_class: "primary_roof_replacement",
    application_date: "2019-01-01",
    issue_date: "2019-01-10",
    completion_date: null,
    open_days: 6 * 366,
    open_years: 6,
    contractor_name: "Acme Roofing LLC",
    contractor_license: "CCC1",
    contractor_license_status: "C",
    contractor_company_cid: null,
    bbb_rating: null,
    bbb_accredited: null,
    source_system: "ftl",
    source_url: "https://ftl.gov/permit/R-1",
    retrieved_at: "2026-11-27",
    manifest_cid: CID,
    provenance: [{ source_url: "https://ftl.gov/permit/R-1" }],
    distance_miles: 0.4,
    ...over,
  });
}

export interface FakeOracle {
  fetch: typeof fetch;
  calls: string[];
}

/** A fake Oracle HTTP API v1 answering from fixed rows. */
export function fakeOracle(data: {
  properties?: Prop[];
  permits?: Permit[];
  uncovered?: { name: string; status: string; parcels: number }[];
  manifestCid?: string | null;
  fail?: "timeout" | 500 | "bad-shape";
}): FakeOracle {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (data.fail === "timeout") {
      await new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })),
        ),
      );
    }
    if (data.fail === 500) return json({ error: "boom" }, 500);
    const props = data.properties ?? [];
    const permits = data.permits ?? [];
    const uncovered = data.uncovered ?? [];
    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        published: true,
        manifestCid: data.manifestCid === undefined ? CID : data.manifestCid,
      });
    }
    if (url.pathname === "/api/dataset") {
      return json({
        manifestCid: data.manifestCid === undefined ? CID : data.manifestCid,
        published: true,
        runId: "20261127T223244Z-incremental",
        asOf: "2026-11-27",
        builtAt: "2026-11-27T14:55:45Z",
        viewsVersion: "roofing-views.v1",
        counts: { v_property: props.length, v_roof_permit: permits.length },
        coverage: null,
        permitCoverage: [],
        limitations: [],
      });
    }
    if (url.pathname === "/api/query/aged-roofs") {
      const min = Number(url.searchParams.get("minRoofAgeYears") ?? 15);
      const limit = Number(url.searchParams.get("limit") ?? 200);
      const rows = props.filter((p) => (p.roof_age_years ?? -1) >= min).slice(0, limit);
      if (data.fail === "bad-shape") return json({ total: 1, rows: [{ parcel_identifier: 7 }], uncovered });
      return json({ total: rows.length, rows, uncovered });
    }
    if (url.pathname === "/api/query/open-permits") {
      const min = Number(url.searchParams.get("minOpenYears") ?? 0);
      const rows = permits.filter((p) => (p.open_years ?? 0) >= min);
      return json({ total: rows.length, rows, uncovered });
    }
    const m = url.pathname.match(/^\/api\/property\/(.+)$/);
    if (m) {
      const p = props.find((x) => x.parcel_identifier === decodeURIComponent(m[1]));
      if (!p) return json({ error: "no parcel" }, 404);
      return json({
        property: p,
        owner: null,
        structure: null,
        roof_age: { basis: p.roof_age_basis, confidence: null, permit_key: null, policy: null },
        sales: [],
        tax: [],
        permits: permits
          .filter((x) => x.parcel_identifier === p.parcel_identifier)
          .map((x) => ({
            permit_key: x.permit_key,
            permit_number: x.permit_number,
            permit_type: x.permit_type,
            description: x.description,
            status: x.status,
            raw_status: x.raw_status,
            is_roofing: true,
            roof_work_class: x.roof_work_class,
            issue_date: x.issue_date,
            completion_date: x.completion_date,
            open_days: x.open_days,
            contractor_name: x.contractor_name,
            contractor_license: x.contractor_license,
            parcel_match_method: "folio",
            source_url: x.source_url,
          })),
        entities: [],
        appraiser_url: "https://bcpa.net",
      });
    }
    if (url.pathname === "/api/place") {
      const name = url.searchParams.get("name");
      if (name !== "Fort Lauderdale") return json({ error: "not a Broward place" }, 404);
      return json({ name, ...FTL, basis: "census_place", source_url: "https://census.gov" });
    }
    return json({ error: "not found" }, 404);
  }) as typeof fetch;
  return { fetch: f, calls };
}
