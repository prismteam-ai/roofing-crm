import { MemoryCampaignStore } from "../packages/agent/src/campaign";
import { MICRO_MODEL } from "../packages/runtime-config/src/index";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { LeadStore } from "../packages/lead-domain/src/index";
import {
  AccessService,
  accessCodeDigest,
} from "../packages/hosted-runtime/src/access";
import { MemorySessionStore } from "../packages/hosted-runtime/src/sessions";
import { MemoryQuotaStore } from "../packages/hosted-runtime/src/quota";
import {
  DomainError,
  CONTRACT_VERSION,
  PropertySchema,
} from "../packages/contracts/src/index";
import type {
  createHostedHandler as HostedFactory,
  HttpEvent,
} from "../apps/api/src/lambda";
import type { ConverseTransport } from "../packages/agent/src/bedrock";
const importStart = performance.now();
const packaged = (await import(
  pathToFileURL(resolve("build/lambda/index.mjs")).href
)) as {
  createHostedHandler: typeof HostedFactory;
  DomainError: typeof DomainError;
};
const bundleImportMs = performance.now() - importStart;
const leads = new LeadStore(":memory:");
const sessions = new MemorySessionStore();
const quota = new MemoryQuotaStore();
const campaign = new MemoryCampaignStore();
// Ephemeral test-only material stays in process memory and is never printed or retained.
const entry = randomUUID(),
  access = new AccessService({
    signingKey: randomBytes(32).toString("hex"),
    reviewCodeDigest: accessCodeDigest(entry),
    keyVersion: "emulation",
    sessionTtlSeconds: 60,
  });
const snapshotId = "lambda-emulation-synthetic-v1";
const query = { snapshotId, lat: 42.66, lng: -83.29, radiusMeters: 8046.72 };
const property = PropertySchema.parse({
  id: "SYN-EMULATED",
  nativeId: "SYN-EMULATED",
  parcelIds: [],
  address: "Synthetic emulation property",
  usage: "unknown",
  coordinates: { lat: query.lat, lng: query.lng },
  roof: {
    ageYears: null,
    basis: "unknown",
    confidence: "unknown",
    asOf: "2026-10-27",
    caveats: ["Synthetic only"],
  },
  permits: [],
  ownership: {
    lastTransferDate: null,
    historyCoverage: "unknown",
    ownerRegion: "unknown",
  },
  provenance: [
    {
      sourceId: "synthetic",
      recordId: "SYN-EMULATED",
      observedAt: new Date().toISOString(),
      digest: "emulation-only",
      kind: "synthetic",
    },
  ],
});
const oracle = {
  health: async () => ({
    snapshotId,
    mode: "synthetic",
    contractVersion: CONTRACT_VERSION,
    count: 1,
    digest: "emulation-only",
  }),
  search: async () => ({
    contractVersion: CONTRACT_VERSION,
    snapshotId,
    queryHash: "emulation-query",
    rows: [{ ...property, distanceMeters: 0 }],
    total: 1,
    truncated: false,
    nextCursor: null,
    limitations: ["Synthetic packaged runtime emulation"],
  }),
  detail: async () => property,
};
let fakeProviderCalls = 0;
const provider: ConverseTransport = {
  converse: async () => {
    fakeProviderCalls++;
    return {
      $metadata: {},
      metrics: { latencyMs: 0 },
      usage: { inputTokens: 20, outputTokens: 20, totalTokens: 40 },
      stopReason: "tool_use",
      output: {
        message: {
          role: "assistant",
          content: [
            {
              toolUse: {
                toolUseId: "fake-read",
                name: "searchRoofingEvidence",
                input: query,
              },
            },
          ],
        },
      },
    };
  },
};
function fromLocal<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof DomainError)
      throw new packaged.DomainError(error.code, error.message);
    throw error;
  }
}
const handler = packaged.createHostedHandler(
  () => ({
    leads: {
      list: (session) => fromLocal(() => leads.list(session)),
      create: (input) => fromLocal(() => leads.create(input)),
      update: (id, input) => fromLocal(() => leads.update(id, input)),
    },
    sessions,
    quota,
    access: async () => access,
    provider,
    campaign,
    price: async () => ({
      modelId: MICRO_MODEL,
      region: "us-east-1",
      inputUsdPerMillion: 0.035,
      outputUsdPerMillion: 0.14,
      verifiedAt: new Date().toISOString(),
      source: "https://aws.amazon.com/bedrock/pricing/",
    }),
  }),
  () => oracle,
  () => MICRO_MODEL,
);
const checks: { route: string; status: number; latencyMs: number }[] = [];
const sessionState: { cookie?: string } = {};
async function invoke(
  method: string,
  path: string,
  body?: unknown,
  expected = 200,
) {
  const start = performance.now();
  const event: HttpEvent = {
    rawPath: path,
    requestContext: { http: { method } },
    ...(sessionState.cookie ? { cookies: [sessionState.cookie] } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
  const response = await handler(event);
  if (response.statusCode !== expected)
    throw new Error(
      `Packaged ${method} ${path}: expected ${expected}, got ${response.statusCode}`,
    );
  checks.push({
    route: `${method} ${path}`,
    status: response.statusCode,
    latencyMs: performance.now() - start,
  });
  return response;
}
await invoke("GET", "/api/health");
await invoke("POST", "/api/search", query, 401);
const login = await invoke("POST", "/api/session", { accessCode: entry });
sessionState.cookie = (login as { cookies?: string[] }).cookies?.[0]?.split(
  ";",
)[0];
if (!sessionState.cookie)
  throw new Error("Packaged session did not set a cookie");
const sid = (JSON.parse(login.body) as { session: { id: string } }).session.id;
await invoke("POST", "/api/search", query);
await invoke("POST", "/api/search", query);
const selection = {
  sessionId: sid,
  propertyId: property.id,
  snapshotId,
  idempotencyKey: "emulated-request",
};
const first = JSON.parse(
  (await invoke("POST", "/api/leads", selection)).body,
) as { id: string };
const retry = JSON.parse(
  (await invoke("POST", "/api/leads", selection)).body,
) as { id: string };
if (first.id !== retry.id) throw new Error("Packaged idempotency failed");
await invoke("POST", "/api/leads", { ...selection, sessionId: "other" }, 403);
await invoke("PATCH", `/api/leads/${first.id}`, {
  sessionId: sid,
  expectedVersion: 1,
  status: "qualified",
  note: "Synthetic emulation qualification",
});
await invoke(
  "PATCH",
  `/api/leads/${first.id}`,
  { sessionId: sid, expectedVersion: 1, note: "stale" },
  409,
);
const answer = JSON.parse(
  (
    await invoke("POST", "/api/agent", {
      prompt: "Find roofing evidence",
      query,
    })
  ).body,
) as {
  citations: string[];
  modelAudit: {
    converseCalls: number;
    measuredMicroUsd: number;
    reservedMicroUsd: number;
  };
};
if (answer.citations[0] !== "synthetic:SYN-EMULATED" || fakeProviderCalls !== 1)
  throw new Error("Packaged provider grounding failed");
if (
  answer.modelAudit.converseCalls !== 1 ||
  answer.modelAudit.measuredMicroUsd <= 0 ||
  answer.modelAudit.reservedMicroUsd !== 560 ||
  campaign.audit.length !== 2
)
  throw new Error("Packaged durable campaign/usage audit failed");
await invoke("DELETE", "/api/session");
await invoke("POST", "/api/search", query, 401);
const malformed = await handler({
  rawPath: "/api/search",
  requestContext: { http: { method: "POST" } },
  body: "{",
});
if (malformed.statusCode !== 400) throw new Error("Malformed body accepted");
leads.close();
console.log(
  JSON.stringify(
    {
      proof: "exact-bundle-hosted-api-gateway-v2-invocation",
      node: process.version,
      platform: process.platform,
      bundleSha256: createHash("sha256")
        .update(await readFile("build/lambda/index.mjs"))
        .digest("hex"),
      bundleImportMs,
      rssBytes: process.memoryUsage().rss,
      checks,
      malformedStatus: malformed.statusCode,
      fakeProviderCalls,
      serviceCalls: 0,
      liveInferenceCalls: 0,
    },
    null,
    2,
  ),
);
