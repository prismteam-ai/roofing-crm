import { afterEach, expect, it, vi } from "vitest";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHmac } from "node:crypto";
import { createApp } from "../apps/api/src/app";
import { createHostedHandler, type HttpResult } from "../apps/api/src/lambda";
import {
  DynamoLeadStore,
  type DocumentTransport,
} from "../packages/lead-domain/src/dynamo";
import { LeadStore } from "../packages/lead-domain/src/index";
import { AuditedLeadSchema } from "../packages/lead-domain/src/audit";
import {
  AccessService,
  accessCodeDigest,
} from "../packages/hosted-runtime/src/access";
import { MemorySessionStore } from "../packages/hosted-runtime/src/sessions";
import { MemoryQuotaStore } from "../packages/hosted-runtime/src/quota";
import { telemetry } from "../packages/hosted-runtime/src/observability";
import { confirmedLead, parsedLeadRows } from "../apps/crm-web/src/lead-state";
import type { OracleReader } from "../packages/oracle-client/src/index";

/** No service, scans or legacy-partition fallback: only the production document commands. */
class WorkspaceDynamo implements DocumentTransport {
  items = new Map<string, Record<string, unknown>>();
  partitions: string[] = [];
  key(item: Record<string, unknown>) {
    return `${String(item.pk)}/${String(item.sk)}`;
  }
  async send(
    command: Parameters<DocumentTransport["send"]>[0],
  ): Promise<Record<string, unknown>> {
    if (command instanceof GetCommand) {
      this.partitions.push(String(command.input.Key!.pk));
      return {
        Item: structuredClone(this.items.get(this.key(command.input.Key!))),
      };
    }
    if (command instanceof QueryCommand) {
      const pk = String(command.input.ExpressionAttributeValues![":pk"]);
      this.partitions.push(pk);
      return {
        Items: [...this.items.values()]
          .filter(
            (item) => item.pk === pk && String(item.sk).startsWith("LEAD#"),
          )
          .map((item) => structuredClone(item)),
      };
    }
    const conflict = () =>
      Object.assign(new Error("synthetic conflict"), {
        name: "ConditionalCheckFailedException",
      });
    if (command instanceof TransactWriteCommand) {
      const puts = command.input.TransactItems!.map((item) => item.Put!);
      if (puts.some((put) => this.items.has(this.key(put.Item!))))
        throw conflict();
      for (const put of puts) {
        this.partitions.push(String(put.Item!.pk));
        this.items.set(this.key(put.Item!), structuredClone(put.Item!));
      }
      return {};
    }
    if (command instanceof PutCommand) {
      const item = command.input.Item!,
        old = this.items.get(this.key(item));
      const values = command.input.ExpressionAttributeValues!;
      if (
        command.input.ConditionExpression === "#v = :expected"
          ? old?.version !== values[":expected"]
          : old &&
            (old.propertyId !== values[":property"] ||
              old.snapshotId !== values[":snapshot"])
      )
        throw conflict();
      this.partitions.push(String(item.pk));
      this.items.set(this.key(item), structuredClone(item));
      return {};
    }
    throw Error("Unsupported document operation");
  }
}
const clockStart = Date.parse("2026-10-31T10:00:00Z");
const code = "synthetic-workspace-review";
const config = {
  signingKey: "synthetic-key-".repeat(4),
  reviewCodeDigest: accessCodeDigest(code),
  keyVersion: "synthetic",
  sessionTtlSeconds: 60,
};
const selection = {
  propertyId: "SYN-workspace",
  snapshotId: "synthetic-workspace",
  idempotencyKey: "create-main",
};
const oracle: OracleReader = {
  search: async () => {
    throw Error("No search expected");
  },
  detail: async () => ({}) as never,
};
const read = (out: HttpResult) => JSON.parse(out.body) as unknown;
const lead = (out: HttpResult) => AuditedLeadSchema.parse(read(out));
afterEach(() => vi.restoreAllMocks());

it("retains Dynamo leads and actor history across real signed logout/new login while existing browser bindings accept replies", async () => {
  let now = clockStart;
  const db = new WorkspaceDynamo(),
    sessions = new MemorySessionStore(),
    access = new AccessService(config, () => now);
  const oldRow = {
    pk: "SESSION#synthetic-old-login",
    sk: "LEAD#synthetic-old-lead",
    lead: { oldSynthetic: true },
  };
  db.items.set(db.key(oldRow), structuredClone(oldRow));
  const leads = new DynamoLeadStore(db, "test", () =>
    new Date(now).toISOString(),
  );
  const subjects: string[] = [];
  const quota = new MemoryQuotaStore(),
    consume = quota.consume.bind(quota);
  vi.spyOn(quota, "consume").mockImplementation(async (input, signal) => {
    subjects.push(input.subject);
    return consume(input, signal);
  });
  const handler = createHostedHandler(
    () => ({ leads, quota, sessions, access: async () => access }),
    () => oracle,
    undefined,
    () => now,
  );
  const request = (
    method: string,
    path: string,
    cookie?: string,
    body?: unknown,
  ) =>
    handler({
      version: "2.0",
      rawPath: path.split("?")[0],
      rawQueryString: path.split("?")[1],
      cookies: cookie ? [cookie] : [],
      body: body === undefined ? undefined : JSON.stringify(body),
      requestContext: { http: { method } },
    });
  const login = async () => {
    const result = await request("POST", "/api/session", undefined, {
      accessCode: code,
    });
    expect(result.statusCode).toBe(200);
    return {
      session: (read(result) as { session: { id: string } }).session,
      cookie: result.cookies![0].split(";")[0],
    };
  };
  const a = await login();
  const created = await request("POST", "/api/leads", a.cookie, {
    ...selection,
    sessionId: a.session.id,
  });
  expect(created.statusCode).toBe(200);
  let current = lead(created);
  confirmedLead(read(created), { ...selection, sessionId: a.session.id });
  expect(current.events[0].actorSessionId).toBe(a.session.id);
  const id = current.id;
  const retry = await request("POST", "/api/leads", a.cookie, {
    ...selection,
    sessionId: a.session.id,
  });
  expect(lead(retry)).toEqual(current);
  for (const change of [
    { status: "qualified" },
    { note: "Synthetic note from A" },
  ]) {
    const result = await request("PATCH", `/api/leads/${id}`, a.cookie, {
      sessionId: a.session.id,
      expectedVersion: current.version,
      ...change,
    });
    expect(result.statusCode).toBe(200);
    current = lead(result);
  }
  const stale = await request("PATCH", `/api/leads/${id}`, a.cookie, {
    sessionId: a.session.id,
    expectedVersion: 1,
    status: "archived",
  });
  expect(stale.statusCode).toBe(409);
  expect((await request("DELETE", "/api/session", a.cookie)).statusCode).toBe(
    200,
  );
  expect(await sessions.get(a.session.id)).toBeNull();
  for (const [method, path, body] of [
    ["GET", "/api/leads", undefined],
    [
      "PATCH",
      `/api/leads/${id}`,
      { expectedVersion: current.version, status: "archived" },
    ],
  ] as const)
    expect((await request(method, path, a.cookie, body)).statusCode).toBe(401);
  const b = await login();
  expect(b.session.id).not.toBe(a.session.id);
  const listed = await request(
    "GET",
    `/api/leads?sessionId=${b.session.id}`,
    b.cookie,
  );
  expect(listed.statusCode).toBe(200);
  const browserRows = parsedLeadRows(read(listed), b.session.id);
  expect(browserRows).toHaveLength(1);
  expect(browserRows[0].id).toBe(id);
  expect(browserRows[0].version).toBe(current.version);
  // API/domain history keeps trusted actors even though the old browser may ignore extra fields.
  expect(
    AuditedLeadSchema.array()
      .parse(read(listed))[0]
      .events.map((e) => e.actorSessionId),
  ).toEqual([a.session.id, a.session.id, a.session.id]);
  for (const change of [
    { note: "Synthetic note from B" },
    { status: "archived" },
  ] as const) {
    const previous = current;
    const result = await request("PATCH", `/api/leads/${id}`, b.cookie, {
      sessionId: b.session.id,
      expectedVersion: previous.version,
      ...change,
    });
    expect(result.statusCode).toBe(200);
    current = lead(result);
    confirmedLead(read(result), {
      ...selection,
      sessionId: b.session.id,
      id,
      previousVersion: previous.version,
      previousEventCount: previous.events.length,
      change,
    });
  }
  expect(current.id).toBe(id);
  expect(current.status).toBe("archived");
  expect(current.events.map((e) => e.actorSessionId)).toEqual([
    a.session.id,
    a.session.id,
    a.session.id,
    b.session.id,
    b.session.id,
  ]);
  const reread = AuditedLeadSchema.array().parse(
    read(await request("GET", "/api/leads", b.cookie)),
  )[0];
  expect(reread.events).toEqual(current.events);
  expect((await leads.list("review"))[0].sessionId).toBe("review");
  expect((await leads.list("review"))[0].events).toEqual(current.events);
  expect(db.partitions.every((pk) => pk === "WORKSPACE#review")).toBe(true);
  expect(db.items.get(db.key(oldRow))).toEqual(oldRow);
  expect(subjects).toContain(a.session.id);
  expect(subjects).toContain(b.session.id);
  expect(subjects).not.toContain("review");
  for (const forged of [
    { workspaceId: "other" },
    { actorSessionId: "forged-actor" },
  ]) {
    expect(
      (
        await request("POST", "/api/leads", b.cookie, {
          ...selection,
          sessionId: b.session.id,
          ...forged,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("PATCH", `/api/leads/${id}`, b.cookie, {
          sessionId: b.session.id,
          expectedVersion: current.version,
          note: "forged",
          ...forged,
        })
      ).statusCode,
    ).toBe(400);
  }
  expect(
    (
      await request("POST", "/api/leads", b.cookie, {
        ...selection,
        sessionId: "review",
      })
    ).statusCode,
  ).toBe(403);
  // A correctly signed capability for another workspace is rejected by the existing one-workspace access policy.
  const other = {
    ...access.issue(code).session,
    workspaceId: "other",
    v: config.keyVersion,
  };
  const payload = Buffer.from(JSON.stringify(other)).toString("base64url");
  const token = `${payload}.${createHmac("sha256", config.signingKey).update(payload).digest("base64url")}`;
  expect(
    (await request("GET", "/api/leads", `prism_review=${token}`)).statusCode,
  ).toBe(401);
  now += 61000;
  expect((await request("GET", "/api/leads", b.cookie)).statusCode).toBe(401);
});

it("uses only the server verified workspace for list/update/archive and rejects missing workspace", async () => {
  const db = new WorkspaceDynamo(),
    leads = new DynamoLeadStore(db, "test", () =>
      new Date(clockStart).toISOString(),
    );
  const owned = await leads.create({ ...selection, sessionId: "review" });
  const make = (workspaceId?: string) =>
    createApp({
      oracle,
      leads,
      access: {
        current: () => ({ id: "other-session", workspaceId }),
        issue: async () => {
          throw Error("No login expected");
        },
        logout: () => "",
      },
    });
  const app = make("other");
  expect(
    JSON.parse(
      (
        await app({
          method: "GET",
          path: "/api/leads?workspaceId=review",
          headers: {},
        })
      ).body,
    ),
  ).toEqual([]);
  for (const change of [
    { note: "other" },
    { status: "qualified" },
    { status: "archived" },
  ])
    expect(
      (
        await app({
          method: "PATCH",
          path: `/api/leads/${owned.id}`,
          headers: {},
          body: { sessionId: "other-session", expectedVersion: 1, ...change },
        })
      ).statusCode,
    ).toBe(403);
  expect((await leads.list("review"))[0].version).toBe(1);
  expect(
    (await make()({ method: "GET", path: "/api/leads", headers: {} }))
      .statusCode,
  ).toBe(403);
});

it("preserves the stable supplied local namespace, retries, optimistic versions, archive and persisted actor extensions", async () => {
  const leads = new LeadStore(":memory:", () =>
    new Date(clockStart).toISOString(),
  );
  try {
    const app = createApp({ oracle, leads });
    const request = (method: string, path: string, body?: unknown) =>
      app({ method, path, headers: {}, body });
    const input = { ...selection, sessionId: "local-stable" };
    const first = await request("POST", "/api/leads", input),
      current = lead(first);
    expect(lead(await request("POST", "/api/leads", input))).toEqual(current);
    expect(current.sessionId).toBe("local-stable");
    expect(current.events[0]).not.toHaveProperty("actorSessionId");
    const updated = await request("PATCH", `/api/leads/${current.id}`, {
      sessionId: input.sessionId,
      expectedVersion: 1,
      status: "archived",
      note: "Synthetic local note",
    });
    expect(lead(updated).status).toBe("archived");
    expect(
      (
        await request("PATCH", `/api/leads/${current.id}`, {
          sessionId: input.sessionId,
          expectedVersion: 1,
          status: "qualified",
        })
      ).statusCode,
    ).toBe(409);
    expect(
      JSON.parse(
        (await request("GET", "/api/leads?sessionId=other-local")).body,
      ),
    ).toEqual([]);
    const audited = leads.create(
      {
        ...selection,
        propertyId: "audited-local",
        idempotencyKey: "create-audited-local",
        sessionId: input.sessionId,
      },
      undefined,
      undefined,
      { actorSessionId: "trusted-A" },
    );
    leads.update(
      audited.id,
      {
        sessionId: input.sessionId,
        expectedVersion: 1,
        note: "Synthetic audit",
      },
      undefined,
      undefined,
      { actorSessionId: "trusted-B" },
    );
    expect(
      leads
        .list(input.sessionId)
        .find((x) => x.id === audited.id)!
        .events.map((e) => e.actorSessionId),
    ).toEqual(["trusted-A", "trusted-B"]);
  } finally {
    leads.close();
  }
});

it("classifies corrupted persisted lead data as internal storage failure without leaking details", async () => {
  const db = new WorkspaceDynamo(),
    leads = new DynamoLeadStore(db, "test", () =>
      new Date(clockStart).toISOString(),
    );
  vi.spyOn(telemetry.logger, "warn").mockImplementation(() => {});
  const created = await leads.create({ ...selection, sessionId: "review" });
  const row = db.items.get(`WORKSPACE#review/LEAD#${created.id}`)!;
  row.lead = { privateSql: "DO-NOT-LEAK" };
  const app = createApp({ oracle, leads });
  const result = await app({
    method: "GET",
    path: "/api/leads?sessionId=review",
    headers: {},
  });
  expect(result.statusCode).toBe(500);
  expect(JSON.parse(result.body).code).toBe("INTERNAL_ERROR");
  expect(result.body).not.toContain("DO-NOT-LEAK");
});
