import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { McpDataSource } from "@/lib/mcp/types";

/**
 * Route-level tests. Validation paths run everywhere; the create -> list -> delete flow runs
 * only when TEST_DATABASE_URL points at a Postgres with the migrations applied
 * (e.g. TEST_DATABASE_URL=postgres://postgres:crm@localhost:5433/postgres npm test).
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const PARCEL = `TEST${Date.now().toString(36).toUpperCase()}`;

vi.hoisted(() => {
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  else delete process.env.DATABASE_URL;
  process.env.DB_DRIVER = "pg";
});

vi.mock("@/lib/mcp/client", () => {
  const fake: McpDataSource = {
    getPropertySchema: async () => ({
      county: "osceola",
      view: "properties",
      columnCount: 0,
      columns: [],
    }),
    getPermitSchema: async () => ({
      county: "osceola",
      view: "permits",
      columnCount: 0,
      columns: [],
    }),
    queryProperties: async <Row>(sql: string) => {
      const rows = sql.includes(`'${PARCEL}'`)
        ? [
            {
              request_identifier: PARCEL,
              parcel_identifier: PARCEL,
              address_street: "1 TEST ST",
              address_city: "KISSIMMEE",
              address_zip: "34741",
              latitude: 28.29,
              longitude: -81.4,
              roof_age_years: "31",
              roof_age_basis: "built_year",
              open_roof_permit_count: 1,
              oldest_open_roof_permit_days: 2000,
              source_urls: "https://src.example/p",
            },
          ]
        : [];
      return { county: "osceola", rowCount: rows.length, limit: 100, rows: rows as Row[] };
    },
    queryPermits: async <Row>() => ({
      county: "osceola",
      rowCount: 1,
      limit: 100,
      rows: [
        {
          permit_number: "T-1",
          parcel_identifier: PARCEL,
          is_roofing: true,
          is_open: true,
          days_open: 2000,
          source_url: "https://src.example/permit",
        },
      ] as Row[],
    }),
    findPropertiesInArea: async () => ({ count: 0, parcels: [] }),
  };
  return { mcp: fake, callMcpTool: vi.fn() };
});

const get = (url: string) => new NextRequest(new URL(url, "http://test.local"));
const json = (url: string, method: string, body: unknown) =>
  new NextRequest(new URL(url, "http://test.local"), {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/search validation", () => {
  it("returns 400 with issues for a bad lat", async () => {
    const { GET } = await import("@/app/api/search/route");
    const res = await GET(get("/api/search?lat=abc&lng=-81.4"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: Array<{ path: string[] }> };
    expect(body.error).toBe("Invalid request");
    expect(body.issues[0]?.path).toEqual(["lat"]);
  });
  it("returns 400 for an out-of-range radius", async () => {
    const { GET } = await import("@/app/api/search/route");
    expect((await GET(get("/api/search?lat=28.29&lng=-81.4&radiusMiles=99"))).status).toBe(400);
  });
});

describe("/api/leads validation", () => {
  it("rejects a body without parcelIds or with bad thresholds", async () => {
    const { POST } = await import("@/app/api/leads/route");
    expect((await POST(json("/api/leads", "POST", { nope: true }))).status).toBe(400);
    expect(
      (await POST(json("/api/leads", "POST", { parcelIds: ["P1"], roofAgeMin: -1 }))).status,
    ).toBe(400);
  });
  it("rejects an unknown status filter", async () => {
    const { GET } = await import("@/app/api/leads/route");
    expect((await GET(get("/api/leads?status=bogus"))).status).toBe(400);
  });
});

describe("/api/chat validation", () => {
  it("returns 503 without a key and 400 on an empty body with a key", async () => {
    const { POST } = await import("@/app/api/chat/route");
    delete process.env.ANTHROPIC_API_KEY;
    expect((await POST(json("/api/chat", "POST", {}))).status).toBe(503);
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await POST(json("/api/chat", "POST", {}));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Invalid request");
    const bad = await POST(
      new NextRequest("http://test.local/api/chat", { method: "POST", body: "not json" }),
    );
    expect(bad.status).toBe(400);
    delete process.env.ANTHROPIC_API_KEY;
  });
});

describe.skipIf(!TEST_DB)("/api/leads create -> list -> delete (TEST_DATABASE_URL)", () => {
  let leadId: number | null = null;
  afterAll(async () => {
    if (leadId === null) return;
    const { DELETE } = await import("@/app/api/leads/[id]/route");
    await DELETE(get(`/api/leads/${leadId}`), { params: Promise.resolve({ id: String(leadId) }) });
  });

  it("creates a lead from the mocked MCP parcel, lists it, updates status, deletes it", async () => {
    const leadsRoute = await import("@/app/api/leads/route");
    const created = await leadsRoute.POST(
      json("/api/leads", "POST", {
        parcelIds: [PARCEL, "UNKNOWN1"],
        roofAgeMin: 15,
        longOpenYears: 5,
      }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      created: Array<{ id: number; parcelId: string; signal: string }>;
      unknown: string[];
    };
    expect(body.created).toHaveLength(1);
    expect(body.created[0]).toMatchObject({ parcelId: PARCEL, signal: "long_open_permit" });
    expect(body.unknown).toEqual(["UNKNOWN1"]);
    leadId = body.created[0]!.id;

    const again = await leadsRoute.POST(json("/api/leads", "POST", { parcelIds: [PARCEL] }));
    const againBody = (await again.json()) as {
      created: unknown[];
      existing: Array<{ id: number }>;
    };
    expect(againBody.created).toHaveLength(0);
    expect(againBody.existing[0]?.id).toBe(leadId);

    const listed = await leadsRoute.GET(get("/api/leads?permitStatus=long_open&roofAgeMin=30"));
    const listBody = (await listed.json()) as { leads: Array<{ id: number; permitCount: number }> };
    expect(listBody.leads.some((l) => l.id === leadId && l.permitCount === 1)).toBe(true);

    const idRoute = await import("@/app/api/leads/[id]/route");
    const patched = await idRoute.PATCH(
      json(`/api/leads/${leadId}`, "PATCH", { status: "contacted" }),
      {
        params: Promise.resolve({ id: String(leadId) }),
      },
    );
    expect(patched.status).toBe(200);
    const detail = await idRoute.GET(get(`/api/leads/${leadId}`), {
      params: Promise.resolve({ id: String(leadId) }),
    });
    const detailBody = (await detail.json()) as {
      status: string;
      activities: Array<{ type: string }>;
      permits: unknown[];
    };
    expect(detailBody.status).toBe("contacted");
    expect(detailBody.permits).toHaveLength(1);
    expect(detailBody.activities.map((a) => a.type)).toEqual(["status_change", "created"]);

    const deleted = await idRoute.DELETE(get(`/api/leads/${leadId}`), {
      params: Promise.resolve({ id: String(leadId) }),
    });
    expect(deleted.status).toBe(204);
    leadId = null;
  });
});
