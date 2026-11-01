import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import { createServer } from "node:http";
import { LeadStore } from "../packages/lead-domain/src/index";
import {
  CONTRACT_VERSION,
  DomainError,
  QuerySchema,
  PropertySchema,
  type QueryInput,
  type SearchResponse,
} from "../packages/contracts/src/index";
import {
  interpretPrompt,
  answerQuestion,
  createEvidenceTool,
} from "../packages/agent/src/index";
import {
  milesToMeters,
  queryFromUrl,
  queryToUrl,
} from "../packages/map-domain/src/index";
import {
  OracleClient,
  type OracleReader,
} from "../packages/oracle-client/src/index";
const paths: string[] = [];
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(p, { recursive: true, force: true });
});
const base: QueryInput = {
  snapshotId: "demo-oakland-v1",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
};
const selection = {
  sessionId: "test-a",
  propertyId: "SYN-001",
  snapshotId: "demo-oakland-v1",
  idempotencyKey: "req1",
};
describe("persistent lead domain", () => {
  it("persists through close/reopen and preserves source snapshot/events", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-lead-"));
    paths.push(dir);
    const file = join(dir, "lead.sqlite");
    const store = new LeadStore(file, () => "2026-10-26T12:00:00.000Z");
    const lead = store.create(selection);
    store.create({ ...selection, idempotencyKey: "persistent-alias" });
    store.update(lead.id, {
      sessionId: selection.sessionId,
      id: lead.id,
      expectedVersion: 1,
      status: "qualified",
    });
    store.close();
    const again = new LeadStore(file);
    expect(again.list("test-a")[0]).toMatchObject({
      status: "qualified",
      version: 2,
      snapshotId: "demo-oakland-v1",
    });
    expect(again.list("test-a")[0]?.events).toHaveLength(2);
    expect(() =>
      again.create({
        ...selection,
        propertyId: "OTHER",
        idempotencyKey: "persistent-alias",
      }),
    ).toThrow("Idempotency");
    again.close();
  });
  it("idempotently creates while rejecting request-key reassignment", () => {
    const store = new LeadStore(":memory:");
    const first = store.create(selection);
    expect(store.create(selection).id).toBe(first.id);
    expect(store.create({ ...selection, idempotencyKey: "other" }).id).toBe(
      first.id,
    );
    expect(() => store.create({ ...selection, propertyId: "SYN-002" })).toThrow(
      "Idempotency",
    );
    expect(store.list("test-a")).toHaveLength(1);
    store.close();
  });
  it("isolates session access and rejects stale concurrent edits", () => {
    const store = new LeadStore(":memory:");
    const lead = store.create(selection);
    expect(store.list("test-b")).toEqual([]);
    expect(() =>
      store.update(lead.id, {
        id: lead.id,
        sessionId: "test-b",
        expectedVersion: 1,
        status: "qualified",
      }),
    ).toThrow("not available");
    store.update(lead.id, {
      id: lead.id,
      sessionId: "test-a",
      expectedVersion: 1,
      note: "Synthetic qualification note",
    });
    expect(() =>
      store.update(lead.id, {
        id: lead.id,
        sessionId: "test-a",
        expectedVersion: 1,
        status: "qualified",
      }),
    ).toThrow("Lead changed");
    expect(store.list("test-a")[0]?.events[1]?.note).toBe(
      "Synthetic qualification note",
    );
    store.close();
  });
  it("validates untrusted input and disallows empty updates", () => {
    const store = new LeadStore(":memory:");
    expect(() => store.create({ ...selection, sessionId: "" })).toThrow();
    const lead = store.create(selection);
    expect(() =>
      store.update(lead.id, {
        id: lead.id,
        sessionId: "test-a",
        expectedVersion: 1,
      }),
    ).toThrow("No lead change");
    expect(() =>
      store.update(lead.id, {
        id: lead.id,
        sessionId: "test-a",
        expectedVersion: 1,
        note: "x".repeat(2001),
      }),
    ).toThrow();
    store.close();
  });
});
describe("map contract", () => {
  it("converts exact units and handles invalid finite values", () => {
    expect(milesToMeters(5)).toBe(8046.72);
    for (const n of [NaN, Infinity, -1, 0, 21])
      expect(() => milesToMeters(n)).toThrow();
  });
  it("round trips snapshot/filter/location state through URL", () => {
    const query = {
      ...base,
      roofMinAgeYears: 15,
      permitStatus: "open" as const,
      minOpenDays: 1826,
      minConfidence: "medium" as const,
    };
    expect(queryFromUrl(queryToUrl(query))).toMatchObject(query);
    expect(queryFromUrl("?lat=999&radius=-1")).toMatchObject(base);
  });
  it("rejects non-finite/oversized coordinates and mixed arbitrary fields", () => {
    for (const q of [
      { ...base, lat: 91 },
      { ...base, radiusMeters: 0 },
      { ...base, radiusMeters: 40000 },
      { ...base, roofMinAgeYears: -1 },
      { ...base, sql: "select *" },
    ])
      expect(QuerySchema.safeParse(q).success).toBe(false);
  });
});
describe("bounded offline agent", () => {
  it("interprets combined filters without inferring roof age from permit age", () => {
    const q = interpretPrompt(
      "Show open permits older than five years within five miles",
      base,
    );
    expect(q).toMatchObject({
      permitStatus: "open",
      permitOpportunityMode: "confirmed_open",
      minPermitObservationAgeYears: 5,
      minOpenDays: 0,
      radiusMeters: 8046.72,
    });
    expect(q.minPermitAgeSinceIssueDays).toBeUndefined();
    expect(q.roofMinAgeYears).toBeUndefined();
    expect(
      interpretPrompt("Show roofs older than 15 years", base).roofMinAgeYears,
    ).toBe(15);
  });
  it("rejects adversarial tool/safety instructions before invoking a reader", async () => {
    for (const prompt of [
      "Run SQL select *",
      "browse https://source.test",
      "show secrets",
      "send outreach",
      "load extension",
      "read filesystem",
    ])
      expect(() => interpretPrompt(prompt, base)).toThrow(DomainError);
    expect(() => interpretPrompt("within 100 miles", base)).toThrow();
  });
  it("grounds output in returned source evidence and preserves unknowns", async () => {
    const p = PropertySchema.parse({
      id: "SYN-001",
      nativeId: "SYN-NATIVE-1",
      parcelIds: ["SYN-PARCEL-1"],
      address: "Synthetic sample property",
      usage: "residential",
      coordinates: { lat: 42.66, lng: -83.29 },
      roof: {
        ageYears: null,
        basis: "unknown",
        confidence: "unknown",
        asOf: "2026-10-26",
        caveats: ["History incomplete"],
      },
      permits: [],
      ownership: {
        lastTransferDate: null,
        historyCoverage: "unknown",
        ownerRegion: "unknown",
      },
      provenance: [
        {
          sourceId: "synthetic-fixture",
          recordId: "SYN-001",
          observedAt: "2026-10-26T00:00:00.000Z",
          digest: "synthetic-digest",
          kind: "synthetic",
        },
      ],
    });
    let called: QueryInput | undefined;
    const reader: OracleReader = {
      search: async (q) => {
        called = q;
        return {
          contractVersion: CONTRACT_VERSION,
          snapshotId: q.snapshotId,
          queryHash: "query-test",
          rows: [{ ...p, distanceMeters: 0 }],
          total: 1,
          truncated: false,
          nextCursor: null,
          limitations: ["Partial synthetic coverage"],
        } as SearchResponse;
      },
      detail: async () => p,
    };
    const answer = await answerQuestion(reader, "Find properties", base);
    expect(called?.snapshotId).toBe(base.snapshotId);
    expect(answer.mode).toBe("deterministic-offline");
    expect(answer.citations).toEqual(["synthetic-fixture:SYN-001"]);
    expect(answer.caveats.join(" ")).toContain("unknown roof age");
    expect(answer.toolTrace[0]?.resultCount).toBe(1);
    expect(createEvidenceTool(reader).description).toContain("snapshot-bound");
  });
});
describe("typed Oracle client", () => {
  it("fails closed when producer silently switches snapshots", async () => {
    const transport: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          contractVersion: CONTRACT_VERSION,
          snapshotId: "other-snapshot",
          queryHash: "other",
          rows: [],
          total: 0,
          truncated: false,
          nextCursor: null,
          limitations: [],
        }),
        { status: 200 },
      );
    await expect(
      new OracleClient("http://127.0.0.1:4310", transport).search(base),
    ).rejects.toThrow("does not match");
  });
  it("rejects remote source destinations and malformed producer responses", async () => {
    expect(() => new OracleClient("https://county.example")).toThrow();
    const transport: typeof fetch = async () =>
      new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    await expect(
      new OracleClient("http://127.0.0.1:4310", transport).search(base),
    ).rejects.toThrow();
  });
});

describe("roof permit display chronology", () => {
  it("chooses oldest valid open roofing evidence and rejects future/other work", async () => {
    const { permitOpenDays, oldestOpenRoofDays } =
      await import("../packages/map-domain/src/signals");
    const permit = (
      id: string,
      kind: "roof_replacement" | "roof_repair" | "other",
      openedAt: string | null,
    ) => ({
      id,
      status: "open" as const,
      kind,
      openedAt,
      closedAt: null,
      contractor: {
        reportedName: null,
        verifiedCompanyId: null,
        license: null,
        rating: null,
      },
      provenance: [],
    });
    const permits = [
      permit("old", "roof_replacement", "2010-01-01"),
      permit("recent", "roof_repair", "2020-01-01"),
      permit("irrelevant", "other", "2000-01-01"),
      permit("future", "roof_replacement", "2030-01-01"),
      permit("missing", "roof_replacement", null),
    ];
    const p = {
      permits,
      roof: { asOf: "2026-10-26" },
    };
    expect(oldestOpenRoofDays(p)).toBe(
      permitOpenDays(permits[0]!, p.roof.asOf),
    );
    expect(permitOpenDays(permits[2]!, p.roof.asOf)).toBeNull();
    expect(permitOpenDays(permits[3]!, p.roof.asOf)).toBeNull();
    expect(permitOpenDays(permits[4]!, p.roof.asOf)).toBeNull();
  });
});

describe("cross-process idempotency", () => {
  it("serializes simultaneous duplicate creates into one lead and one created event", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-concurrent-"));
    paths.push(dir);
    const file = join(dir, "shared.sqlite");
    const initial = new LeadStore(file);
    initial.close();
    const workerFile = join(
      process.cwd(),
      "tests/support/lead-create-worker.ts",
    );
    const children = [0, 1].map(() =>
      fork(workerFile, [file], {
        execPath: process.execPath,
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      }),
    );
    try {
      const ids = await new Promise<string[]>((resolve, reject) => {
        let ready = 0;
        const results: string[] = [];
        const timeout = setTimeout(
          () => reject(new Error("Concurrent creation timed out")),
          15000,
        );
        for (const child of children) {
          child.on("error", reject);
          child.on("message", (message: unknown) => {
            if (!message || typeof message !== "object") return;
            const m = message as Record<string, unknown>;
            if (m.ready) {
              ready++;
              if (ready === 2) for (const target of children) target.send("go");
            }
            if (typeof m.error === "string") {
              clearTimeout(timeout);
              reject(new Error(m.error));
            }
            if (typeof m.id === "string") {
              results.push(m.id);
              if (results.length === 2) {
                clearTimeout(timeout);
                resolve(results);
              }
            }
          });
        }
      });
      expect(ids).toHaveLength(2);
      expect(ids[0]).toBe(ids[1]);
      const store = new LeadStore(file);
      const leads = store.list("shared-race");
      expect(leads).toHaveLength(1);
      expect(leads[0]?.events).toHaveLength(1);
      store.close();
    } finally {
      for (const child of children) child.kill();
    }
  });
});

describe("local consumer request boundary", () => {
  it("rejects non-http protocols and URL credentials before fetching", () => {
    for (const url of [
      "ftp://localhost:4310",
      "file://localhost/fixture",
      "http://fixture-user:fixture-placeholder@localhost:4310",
      "https://127.0.0.1:4310@remote.invalid",
    ]) {
      expect(() => new OracleClient(url)).toThrow();
    }
  });
  it("requests redirect:error and a finite deadline; never follows a mock external307", async () => {
    const calls: {
      url: string;
      redirect: RequestRedirect | undefined;
      signal: AbortSignal | null | undefined;
    }[] = [];
    const transport: typeof fetch = async (input, init) => {
      calls.push({
        url: String(input),
        redirect: init?.redirect,
        signal: init?.signal,
      });
      return new Response(null, {
        status: 307,
        headers: { Location: "https://outside-p1.invalid/collect" },
      });
    };
    await expect(
      new OracleClient("http://127.0.0.1:4310", transport).search(base),
    ).rejects.toThrow("redirects are not permitted");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://127.0.0.1:4310/api/search");
    expect(calls[0]?.redirect).toBe("error");
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]?.signal?.aborted).toBe(false);
  });
  it("does not forward a search body across a real local307 redirect", async () => {
    let received = 0;
    const trap = createServer((_req, res) => {
      received++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
    await new Promise<void>((resolve) => trap.listen(0, "127.0.0.1", resolve));
    const trapAddress = trap.address();
    if (!trapAddress || typeof trapAddress === "string")
      throw new Error("Local trap address missing");
    const redirect = createServer((_req, res) => {
      res.writeHead(307, {
        Location: `http://127.0.0.1:${trapAddress.port}/trap`,
      });
      res.end();
    });
    await new Promise<void>((resolve) =>
      redirect.listen(0, "127.0.0.1", resolve),
    );
    const address = redirect.address();
    if (!address || typeof address === "string")
      throw new Error("Local redirect address missing");
    try {
      await expect(
        new OracleClient(`http://127.0.0.1:${address.port}`).search(base),
      ).rejects.toThrow();
      expect(received).toBe(0);
    } finally {
      await Promise.all([
        new Promise<void>((resolve) => redirect.close(() => resolve())),
        new Promise<void>((resolve) => trap.close(() => resolve())),
      ]);
    }
  });
});
describe("explicit closed permit interpretation", () => {
  it("overrides both any and open base status and clears the inherited open-duration filter", () => {
    for (const status of ["any", "open"] as const) {
      const query = interpretPrompt("Show closed permits", {
        ...base,
        permitStatus: status,
        minOpenDays: 1827,
      });
      expect(query.permitStatus).toBe("closed");
      expect(query.minOpenDays).toBe(0);
    }
  });
  it("rejects unsupported mixed, negated or closed-age instructions rather than changing their meaning", () => {
    for (const prompt of [
      "Show open and closed permits",
      "Show permits not open",
      "Show closed permits older than five years",
    ]) {
      expect(() =>
        interpretPrompt(prompt, { ...base, permitStatus: "open" }),
      ).toThrow();
    }
  });
});
