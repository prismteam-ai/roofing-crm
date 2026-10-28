import { nonemptyEvidenceProperty } from "./support/evidence-fixture";
import { describe, it, expect, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createHostedHandler } from "../apps/api/src/lambda";
import {
  bedrockTransport,
  type ConverseTransport,
} from "../packages/agent/src/bedrock";
import {
  CAMPAIGN_LIMITS,
  MemoryCampaignStore,
} from "../packages/agent/src/campaign";
import { MICRO_MODEL } from "../packages/runtime-config/src/index";
import {
  AccessService,
  accessCodeDigest,
} from "../packages/hosted-runtime/src/access";
import { MemorySessionStore } from "../packages/hosted-runtime/src/sessions";
import { MemoryQuotaStore } from "../packages/hosted-runtime/src/quota";
import { LeadStore } from "../packages/lead-domain/src/index";
import { CONTRACT_VERSION } from "../packages/contracts/src/index";
import {
  assertFrontendIdentity,
  assertAssetDigests,
} from "../packages/hosted-runtime/src/evidence-identity";
import { runtimeIdentity } from "../packages/hosted-runtime/src/release";

const PRIVATE_MARKER = "synthetic-private-provider-detail-never-return";
describe("independent P3 provider failure regression", () => {
  for (const kind of ["native-sdk-error", "ai-sdk-fetch"] as const)
    it(`${kind}: deterministic fallback retains one attempt and never exposes provider errors`, async () => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
      const now = Date.parse("2026-10-27T20:00:00Z"),
        q = {
          snapshotId: "synthetic-provider-failure",
          lat: 42.66,
          lng: -83.29,
          radiusMeters: 8046.72,
        };
      let providerCalls = 0,
        wireCalls = 0,
        reads = 0;
      const sdk =
        kind === "ai-sdk-fetch"
          ? bedrockTransport("us-east-2", {
              // Ephemeral synthetic signing material prevents all credential-chain/account access. The handler never opens a socket.
              credentialProvider: async () => ({
                accessKeyId: `synthetic-${randomBytes(8).toString("hex")}`,
                secretAccessKey: randomBytes(32).toString("hex"),
              }),
              fetch: async () => {
                wireCalls++;
                return Response.json(
                  { message: PRIVATE_MARKER },
                  {
                    status: 429,
                    headers: { "x-amzn-errortype": "ThrottlingException" },
                  },
                );
              },
            })
          : undefined;
      const provider: ConverseTransport = {
        converse: async (input, signal) => {
          providerCalls++;
          if (sdk) return sdk.converse(input, signal);
          throw Object.assign(new Error(PRIVATE_MARKER), {
            name: "ThrottlingException",
            $metadata: { requestId: PRIVATE_MARKER },
          });
        },
      };
      const campaign = new MemoryCampaignStore(),
        leads = new LeadStore(":memory:"),
        sessions = new MemorySessionStore(),
        quota = new MemoryQuotaStore(),
        entry = randomUUID();
      const access = new AccessService(
        {
          signingKey: randomBytes(32).toString("hex"),
          reviewCodeDigest: accessCodeDigest(entry),
          keyVersion: "synthetic-test",
          sessionTtlSeconds: 60,
        },
        () => now,
      );
      const handler = createHostedHandler(
        () => ({
          leads,
          sessions,
          quota,
          access: async () => access,
          provider,
          campaign,
          price: async () => ({
            modelId: MICRO_MODEL,
            region: "us-east-2",
            inputUsdPerMillion: 0.035,
            outputUsdPerMillion: 0.14,
            verifiedAt: new Date(now).toISOString(),
            source: "https://aws.amazon.com/bedrock/pricing/",
          }),
        }),
        () => ({
          health: async () => ({
            snapshotId: q.snapshotId,
            mode: "synthetic",
            contractVersion: CONTRACT_VERSION,
          }),
          detail: async () => {
            throw new Error("No detail request expected");
          },
          search: async () => {
            reads++;
            return {
              contractVersion: CONTRACT_VERSION,
              snapshotId: q.snapshotId,
              queryHash: "synthetic-fallback-query",
              rows: [{ ...nonemptyEvidenceProperty, distanceMeters: 0 }],
              total: 1,
              truncated: false,
              nextCursor: null,
              limitations: ["Synthetic test; missing records remain unknown"],
            };
          },
        }),
        () => MICRO_MODEL,
        () => now,
      );
      try {
        const login = await handler({
          rawPath: "/api/session",
          requestContext: { http: { method: "POST" } },
          body: JSON.stringify({ accessCode: entry }),
        });
        const cookie = login.cookies![0].split(";")[0],
          sid = JSON.parse(login.body).session.id as string;
        const result = await handler({
          rawPath: "/api/agent",
          cookies: [cookie],
          requestContext: { http: { method: "POST" } },
          body: JSON.stringify({ prompt: "Find evidence", query: q }),
        });
        const answer = JSON.parse(result.body);
        expect(result.statusCode).toBe(200);
        expect(answer.mode).toBe("deterministic-fallback");
        expect(answer.query).toMatchObject(q);
        expect(answer.toolTrace[0].queryHash).toBe("synthetic-fallback-query");
        expect(answer.caveats.join(" ")).toContain(
          "unmeasured usage is not claimed as zero spend",
        );
        expect(providerCalls).toBe(1);
        expect(reads).toBe(1);
        expect(wireCalls).toBe(kind === "ai-sdk-fetch" ? 1 : 0);
        expect(answer.modelAudit).toMatchObject({
          converseCalls: 1,
          unmeasuredCalls: 1,
          reservedMicroUsd: 560,
          measuredMicroUsd: 0,
          failureCode: "QUERY_TIMEOUT",
        });
        expect(campaign.audit).toHaveLength(1);
        expect(campaign.audit[0]).toMatchObject({
          status: "provider-failed",
          unmeasuredCalls: 1,
          reservedMicroUsd: 560,
          failureCode: "QUERY_TIMEOUT",
        });
        expect(result.body + JSON.stringify(campaign.audit)).not.toContain(
          PRIVATE_MARKER,
        );
        expect(result.body).not.toContain("ThrottlingException");
        expect(JSON.stringify(warning.mock.calls)).not.toContain(
          PRIVATE_MARKER,
        );
        expect(warning).not.toHaveBeenCalled(); // Availability is surfaced through bounded audit/metrics, never provider-error console logging.
        // A failed provider call stays charged against the current finite session ceiling.
        for (let i = 0; i < CAMPAIGN_LIMITS.conversePerSessionHour - 1; i++)
          await campaign.reserve({
            subject: sid,
            kind: "converse",
            modelId: MICRO_MODEL,
            nowMs: now,
            reservedMicroUsd: 1,
          });
        await expect(
          campaign.reserve({
            subject: sid,
            kind: "converse",
            modelId: MICRO_MODEL,
            nowMs: now,
            reservedMicroUsd: 1,
          }),
        ).rejects.toThrow("cap");
      } finally {
        warning.mockRestore();
        leads.close();
      }
    });
});
describe("hosted screenshot frontend identity gate", () => {
  const pinned = runtimeIdentity(
    "crm",
    { head: "a".repeat(40), tree: "b".repeat(40), dirty: false },
    { version: "0.2.1", sha256: "c".repeat(64) },
    "review",
  );
  const dom = {
    "data-head": pinned.head,
    "data-tree": pinned.tree,
    "data-build-id": pinned.buildId,
    "data-region": pinned.region,
    "data-stage": pinned.stage,
  };
  it("accepts only matching rendered/runtime/package identities before capture", () => {
    expect(() => assertFrontendIdentity(dom, pinned, pinned)).not.toThrow();
    for (const key of Object.keys(dom))
      expect(() =>
        assertFrontendIdentity({ ...dom, [key]: "stale" }, pinned, pinned),
      ).toThrow("Rendered frontend");
    for (const key of ["head", "tree", "buildId", "stage", "region"] as const)
      expect(() =>
        assertFrontendIdentity(dom, { ...pinned, [key]: "stale" }, pinned),
      ).toThrow("Rendered frontend");
    expect(() =>
      assertFrontendIdentity(dom, pinned, { ...pinned, sourceDirty: true }),
    ).toThrow("Clean pinned");
  });
  it("rejects stale, missing and extra loaded assets when a parent manifest is supplied", () => {
    const files = {
      "assets/index-example.js": "a".repeat(64),
      "assets/index-example.css": "b".repeat(64),
    };
    expect(() => assertAssetDigests(files, files)).not.toThrow();
    expect(() =>
      assertAssetDigests(
        { ...files, "assets/index-example.js": "c".repeat(64) },
        files,
      ),
    ).toThrow();
    expect(() =>
      assertAssetDigests(
        { "assets/index-example.js": files["assets/index-example.js"] },
        files,
      ),
    ).toThrow();
    expect(() =>
      assertAssetDigests(
        { ...files, "assets/stale.js": "c".repeat(64) },
        files,
      ),
    ).toThrow();
  });
});
