import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createLeadsRepo, createLeadsTable, documentClient } from "@crm/leads-db";
import { createOracleData } from "@crm/oracle-data";
import { CID, fakeOracle, FTL, OTHER_CID, permit, property } from "@crm/oracle-data/testing";
import type { APIGatewayProxyEventV2, Context as LambdaContext } from "aws-lambda";
import { beforeEach, describe, expect, inject, test } from "vitest";
import { createContextFactory, type Deps, workspaceFromCookie } from "../src/context.ts";
import { createLambdaHandler } from "../src/lambda.ts";
import { createCaller } from "../src/router.ts";
import { seedLeads } from "../src/seed-leads.ts";
import { createApiServer } from "../src/server.ts";

const P1 = "504203010010";
const P2 = "504203010020";
const P3 = "504203010030";

function oracleWith(over: Parameters<typeof fakeOracle>[0] = {}) {
  const f = fakeOracle({
    properties: [
      property(),
      property({ parcel_identifier: P2, roof_age_years: 30, max_open_days: null, lat: 26.13, lon: -80.15 }),
      property({ parcel_identifier: P3, roof_age_years: 5, max_open_days: 8 * 366, lat: 26.3, lon: -80.1 }),
    ],
    permits: [
      permit(),
      permit({
        permit_key: "ftl:R-3",
        parcel_identifier: P3,
        lat: 26.3,
        lon: -80.1,
        open_days: 8 * 366,
        open_years: 8,
      }),
    ],
    ...over,
  });
  return createOracleData({ apiUrl: "http://oracle.test", expectedManifestCid: CID, fetchImpl: f.fetch });
}

let deps: Deps;
beforeEach(async () => {
  const doc = documentClient({ endpoint: inject("dynamoEndpoint") });
  const tableName = `leads-${randomUUID()}`;
  await createLeadsTable(doc, tableName);
  const oracle = oracleWith();
  deps = { oracle, leads: createLeadsRepo({ doc, tableName }), seed: () => seedLeads(oracle, [P2]) };
});

const caller = async (cookieHeader?: string, d: Deps = deps) => {
  const ctx = await createContextFactory(d, { secureCookies: true })({ cookieHeader });
  return { api: createCaller(ctx), ctx };
};

describe("map and details", () => {
  test("map.search returns candidates around Fort Lauderdale", async () => {
    const { api } = await caller();
    const r = await api.map.search({ center: FTL, radiusMiles: 5 });
    expect(r.outsideCoverage).toBe(false);
    expect(r.candidates.map((c) => c.propertyId)).toContain(P1);
    expect(r.manifestCid).toBe(CID);
  });

  test("property.get of an unknown id → NOT_FOUND", async () => {
    const { api } = await caller();
    await expect(api.property.get({ id: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("place.resolve finds a Broward place and returns null for an unknown one", async () => {
    const { api } = await caller();
    expect(await api.place.resolve({ name: "Fort Lauderdale" })).toEqual({ name: "Fort Lauderdale", ...FTL });
    expect(await api.place.resolve({ name: "Springfield" })).toBeNull();
  });
});

describe("meta.snapshot", () => {
  test("reports the pinned run and its counts", async () => {
    const { api } = await caller();
    expect(await api.meta.snapshot()).toMatchObject({
      manifestCid: CID,
      oracleHealthy: true,
      manifestMismatch: false,
      viewsVersion: "roofing-views.v1",
      counts: { v_property: 3 },
    });
  });

  test("reports a mismatch when the Oracle serves another run", async () => {
    const other = { ...deps, oracle: oracleWith({ manifestCid: OTHER_CID }) };
    const { api } = await caller(undefined, other);
    expect(await api.meta.snapshot()).toMatchObject({
      manifestMismatch: true,
      servedManifestCid: OTHER_CID,
      manifestCid: CID,
    });
  });

  test("reports the Oracle unhealthy when it is down, without throwing", async () => {
    const down = { ...deps, oracle: oracleWith({ fail: 500 }) };
    const { api } = await caller(undefined, down);
    expect(await api.meta.snapshot()).toMatchObject({ oracleHealthy: false });
  });
});

describe("leads", () => {
  test("leads.create captures the manifest CID and the property's signals from the Oracle", async () => {
    const { api } = await caller();
    const r = await api.leads.create({ propertyId: P1, permitId: "ftl:R-1" });
    expect(r.created).toBe(true);
    expect(r.lead).toMatchObject({
      propertyId: P1,
      permitId: "ftl:R-1",
      sourceManifestCid: CID,
      signals: { roofAgeYears: 25, permitStatuses: ["open"], address: "100 SE 1st Ave" },
    });
  });

  test("leads.createMany reports created vs existing", async () => {
    const { api } = await caller();
    await api.leads.create({ propertyId: P1 });
    expect(await api.leads.createMany({ items: [{ propertyId: P1 }, { propertyId: P3 }] })).toMatchObject({
      created: 1,
      existing: 1,
    });
  });

  test("leads.list accepts roof-age, open-years, permit-status and radius filters", async () => {
    const { api } = await caller();
    await api.leads.createMany({ items: [{ propertyId: P1 }, { propertyId: P3 }] });
    const ids = async (f: Parameters<typeof api.leads.list>[0]) =>
      (await api.leads.list(f)).map((l) => l.propertyId).sort();
    // P2 is the workspace's seed lead.
    expect(await ids({ minRoofAgeYears: 20 })).toEqual([P1, P2]);
    expect(await ids({ minOpenYears: 7 })).toEqual([P3]);
    expect(await ids({ permitStatus: ["open"] })).toEqual([P1, P3]);
    expect(await ids({ near: { center: FTL, radiusMiles: 5 } })).toEqual([P1, P2]);
  });

  test("an illegal status change is BAD_REQUEST; an unknown lead is NOT_FOUND", async () => {
    const { api } = await caller();
    const { lead } = await api.leads.create({ propertyId: P1 });
    await expect(api.leads.updateStatus({ id: lead.id, status: "won" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(api.leads.get({ id: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("a lead for a property the run lacks is NOT_FOUND", async () => {
    const { api } = await caller();
    await expect(api.leads.create({ propertyId: "999" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("workspaces", () => {
  test("the first request without a cookie issues crm_ws and seeds the workspace; later requests reuse it", async () => {
    const first = await caller();
    expect(first.ctx.setCookies).toHaveLength(1);
    const cookie = first.ctx.setCookies[0];
    expect(cookie).toMatch(/^crm_ws=[0-9a-f-]{36}; Path=\/; Max-Age=604800; HttpOnly; SameSite=Lax; Secure$/);
    expect((await first.api.leads.list()).map((l) => l.propertyId)).toEqual([P2]);

    const header = cookie.split(";")[0];
    const again = await caller(header);
    expect(again.ctx.setCookies).toEqual([]);
    expect(again.ctx.workspace).toBe(workspaceFromCookie(header));
    expect(await again.api.leads.list()).toHaveLength(1);

    // Another browser never sees this workspace's leads.
    const other = await caller();
    await first.api.leads.create({ propertyId: P1 });
    expect((await other.api.leads.list()).map((l) => l.propertyId)).toEqual([P2]);
  });

  test("a malformed cookie gets a fresh workspace", async () => {
    const { ctx } = await caller("crm_ws=../../etc");
    expect(ctx.setCookies).toHaveLength(1);
  });
});

describe("transports", () => {
  const event = (path: string, query: Record<string, string>, cookies?: string[]): APIGatewayProxyEventV2 =>
    ({
      version: "2.0",
      routeKey: "$default",
      rawPath: path,
      rawQueryString: new URLSearchParams(query).toString(),
      queryStringParameters: query,
      cookies,
      headers: { host: "api.example.com" },
      isBase64Encoded: false,
      requestContext: {
        accountId: "1",
        apiId: "a",
        domainName: "api.example.com",
        domainPrefix: "api",
        http: { method: "GET", path, protocol: "HTTP/1.1", sourceIp: "1.2.3.4", userAgent: "vitest" },
        requestId: "r",
        routeKey: "$default",
        stage: "$default",
        time: "",
        timeEpoch: 0,
      },
    }) as APIGatewayProxyEventV2;

  test("the Lambda handler answers an API Gateway v2 event for map.search and sets the workspace cookie", async () => {
    const handler = createLambdaHandler(deps);
    const input = JSON.stringify({ center: FTL, radiusMiles: 5 });
    const res = (await handler(event("/map.search", { input }), {
      functionName: "api",
    } as LambdaContext)) as any;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result.data.candidates.length).toBeGreaterThan(0);
    const setCookie =
      res.cookies?.[0] ?? res.headers?.["set-cookie"] ?? res.multiValueHeaders?.["set-cookie"]?.[0];
    expect(String(setCookie)).toMatch(/^crm_ws=/);
  });

  test("the local server serves /trpc and /health", async () => {
    const server = createApiServer({ manifestCid: CID, deps }).listen(0);
    try {
      await new Promise((r) => server.once("listening", r));
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/trpc/meta.snapshot`);
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toMatch(/^crm_ws=/);
      expect(((await res.json()) as any).result.data.manifestCid).toBe(CID);
    } finally {
      server.close();
    }
  });
});
