import { describe, it, expect } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createHostedHandler } from "../apps/api/src/lambda";
import {
  QUALITY_CORPUS,
  assessAnswer,
  qualityFailure,
} from "../packages/agent/src/quality";
import {
  boundedIntent,
  boundedToolArguments,
  answerWithBedrock,
  ROUTING_ARCHITECTURE,
  type ConverseTransport,
} from "../packages/agent/src/bedrock";
import {
  CAMPAIGN_PHASE,
  MemoryCampaignStore,
  DynamoCampaignStore,
} from "../packages/agent/src/campaign";
import {
  QuerySchema,
  CONTRACT_VERSION,
  PropertySchema,
  type QueryInput,
  type SearchResponse,
} from "../packages/contracts/src/index";
import {
  AccessService,
  accessCodeDigest,
} from "../packages/hosted-runtime/src/access";
import { MemorySessionStore } from "../packages/hosted-runtime/src/sessions";
import { MemoryQuotaStore } from "../packages/hosted-runtime/src/quota";
import { MICRO_MODEL } from "../packages/runtime-config/src/index";
import { LeadStore } from "../packages/lead-domain/src/index";
import { answerQuestion } from "../packages/agent/src/index";
import {
  GetCommand,
  PutCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
const now = Date.parse("2026-10-28T02:00:00Z"),
  hash = (x: unknown) =>
    createHash("sha256").update(JSON.stringify(x)).digest("hex");
const source = {
  sourceId: "synthetic-p4",
  recordId: "SYN-P4-1",
  observedAt: new Date(now).toISOString(),
  digest: "synthetic",
  kind: "synthetic",
};
const property = PropertySchema.parse({
  id: "SYN-P4-1",
  nativeId: "SYN-P4-1",
  parcelIds: [],
  address: "Synthetic test property",
  coordinates: { lat: 42.66, lng: -83.29 },
  usage: "residential",
  roof: {
    ageYears: 25,
    basis: "built_year",
    confidence: "low",
    asOf: "2026-10-28",
    caveats: ["Synthetic building-year proxy; not roof replacement"],
  },
  permits: [
    {
      id: "SYN-PERMIT-1",
      status: "open",
      kind: "roof_repair",
      openedAt: "2010-01-01",
      closedAt: null,
      contractor: {
        reportedName: "Synthetic Roofing LLC",
        verifiedCompanyId: null,
        license: null,
        rating: null,
      },
      provenance: [source],
    },
  ],
  ownership: {
    lastTransferDate: null,
    historyCoverage: "unknown",
    ownerRegion: "unknown",
  },
  provenance: [source],
});
function evidence(input: QueryInput): SearchResponse {
  const q = QuerySchema.parse(input),
    outside = q.lat === 42.9;
  const p = outside
    ? {
        ...property,
        id: "SYN-P4-UNKNOWN",
        roof: {
          ...property.roof,
          ageYears: null,
          basis: "unknown" as const,
          confidence: "unknown" as const,
        },
        permits: [],
      }
    : property;
  return {
    contractVersion: CONTRACT_VERSION,
    snapshotId: q.snapshotId,
    queryHash: hash(q),
    rows: [{ ...p, distanceMeters: 0 }],
    total: 1,
    truncated: false,
    nextCursor: null,
    limitations: [
      "Synthetic test only; source status is explicit, reported contractor is unverified and missing license/BBB stays unknown",
    ],
  };
}
for (const item of QUALITY_CORPUS)
  it(`P4 frozen corpus ${item.id}: ${item.refusal ? "refused before provider/read" : "one provider route matches exact server evidence"}`, async () => {
    const code = randomUUID(),
      leads = new LeadStore(":memory:"),
      campaign = new MemoryCampaignStore(),
      sessions = new MemorySessionStore();
    let providerCalls = 0,
      reads = 0;
    const requests: string[] = [];
    const base: QueryInput = {
      snapshotId: "synthetic-p4-corpus",
      lat: item.id === "unknown" ? 42.9 : 42.66,
      lng: item.id === "unknown" ? -83.5 : -83.29,
      radiusMeters: 5 * 1609.344,
      includeUnknown: true,
      limit: 50,
    };
    const provider: ConverseTransport = {
      converse: async (request) => {
        providerCalls++;
        requests.push(JSON.stringify(request));
        expect(
          JSON.parse(request.messages![0].content![0].text!).retrievedEvidence
            .rows[0].roof.ageYears,
        ).toBe(item.id === "unknown" ? null : property.roof.ageYears);
        return {
          $metadata: {},
          metrics: { latencyMs: 1 },
          stopReason: "tool_use",
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
          output: {
            message: {
              role: "assistant",
              content: [
                {
                  toolUse: {
                    toolUseId: "synthetic-routing",
                    name: "selectGroundedEvidence",
                    input: {
                      selections: [{ ordinal: 0, reason: "context_match" }],
                    },
                  },
                },
              ],
            },
          },
        };
      },
    };
    const access = new AccessService(
      {
        signingKey: randomBytes(32).toString("hex"),
        reviewCodeDigest: accessCodeDigest(code),
        keyVersion: "synthetic",
        sessionTtlSeconds: 60,
      },
      () => now,
    );
    const reader = {
      search: async (q: QueryInput) => {
        reads++;
        return evidence(q);
      },
      detail: async () => property,
      health: async () => ({
        snapshotId: base.snapshotId,
        mode: "synthetic",
        contractVersion: CONTRACT_VERSION,
      }),
    };
    const handler = createHostedHandler(
      () => ({
        leads,
        sessions,
        campaign,
        quota: new MemoryQuotaStore(),
        access: async () => access,
        provider,
        price: async () => ({
          modelId: MICRO_MODEL,
          region: "us-east-1" as const,
          inputUsdPerMillion: 0.035,
          outputUsdPerMillion: 0.14,
          verifiedAt: new Date(now).toISOString(),
          source: "https://aws.amazon.com/bedrock/pricing/",
        }),
      }),
      () => reader,
      () => MICRO_MODEL,
      () => now,
    );
    try {
      const login = await handler({
        rawPath: "/api/session",
        requestContext: { http: { method: "POST" } },
        body: JSON.stringify({ accessCode: code }),
      });
      const cookie = login.cookies![0].split(";")[0];
      const health = JSON.parse(
        (
          await handler({
            rawPath: "/api/health",
            requestContext: { http: { method: "GET" } },
          })
        ).body,
      );
      expect(health.provider).toBe("bedrock-grounded");
      expect(health.model).toMatchObject({
        architecture: ROUTING_ARCHITECTURE,
        phase: CAMPAIGN_PHASE,
      });
      const response = await handler({
        rawPath: "/api/agent",
        cookies: [cookie],
        requestContext: { http: { method: "POST" } },
        body: JSON.stringify({ prompt: item.prompt, query: base }),
      });
      const body = JSON.parse(response.body);
      if (item.refusal) {
        expect(response.statusCode).toBe(400);
        expect(body.mode).toBe("refused-before-model");
        expect(providerCalls).toBe(0);
        expect(reads).toBe(0);
        expect(campaign.audit).toHaveLength(0);
      } else {
        expect(response.statusCode).toBe(200);
        expect(body.mode).toBe("bedrock-grounded");
        expect(providerCalls).toBe(1);
        expect(reads).toBe(1);
        expect(body.modelAudit).toMatchObject({
          architecture: ROUTING_ARCHITECTURE,
          converseCalls: 1,
          inputTokens: 100,
          outputTokens: 20,
          unmeasuredCalls: 0,
          reservedMicroUsd: 560,
        });
        const reference = evidence(body.query);
        expect(body.query).toEqual(
          JSON.parse(JSON.stringify(boundedIntent(item.prompt, base))),
        );
        expect(body.toolTrace).toHaveLength(1);
        expect(body.toolTrace[0].modelSawMinimizedFacts).toBe(true);
        expect(body.toolTrace[0].arguments).toEqual(body.query);
        expect(body.toolTrace[0].argumentsDigest).toBe(
          hash(QuerySchema.parse(body.query)),
        );
        expect(body.toolTrace[0].resultDigest).toBe(hash(reference));
        expect(
          assessAnswer(item.id, item.prompt, base, body, reference).passed,
        ).toBe(true);
        expect(body.results).toEqual(reference.rows);
        expect(body.toolTrace[0].resultDigest).toBe(hash(reference));
        expect(requests.join(" ")).not.toContain("Synthetic test property");
        expect(requests.join(" ")).not.toContain("Synthetic Roofing LLC");
        expect(campaign.audit).toHaveLength(2);
      }
    } finally {
      leads.close();
    }
  });
describe("P4 identity and evidence guards", () => {
  it("binds permit and reported-sale duration to their own clauses in model and fallback reads", async () => {
    const base = {
      snapshotId: "synthetic",
      lat: 42.66,
      lng: -83.29,
      radiusMeters: 8046.72,
    };
    for (const [prompt, days, status] of [
      [
        "Show roofing permits for properties with last reported sale older than ten years",
        0,
        "any",
      ],
      [
        "Show open roofing permits for properties with last reported sale older than ten years",
        0,
        "open",
      ],
      [
        "Show open roofing permits older than five years and last reported sale older than ten years",
        1827,
        "open",
      ],
      [
        "Show open roofing permits that have been open for more than five years and last reported sale older than ten years",
        1827,
        "open",
      ],
      [
        "Show partial ownership records with last reported sale older than ten years",
        0,
        "any",
      ],
    ] as const) {
      const reads: QueryInput[] = [],
        modelInputs: QueryInput[] = [];
      const reader = {
        search: async (q: QueryInput) => {
          reads.push(q);
          return evidence(q);
        },
        detail: async () => property,
      };
      const provider: ConverseTransport = {
        converse: async (request) => {
          const q = JSON.parse(
            request.messages![0].content![0].text!,
          ).boundedQuery;
          modelInputs.push(q);
          return {
            $metadata: {},
            metrics: { latencyMs: 1 },
            stopReason: "tool_use",
            usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
            output: {
              message: {
                role: "assistant",
                content: [
                  {
                    toolUse: {
                      toolUseId: "synthetic-clause",
                      name: "selectGroundedEvidence",
                      input: {
                        selections: [{ ordinal: 0, reason: "context_match" }],
                      },
                    },
                  },
                ],
              },
            },
          };
        },
      };
      const routed = await answerWithBedrock(reader, provider, prompt, base, {
        modelId: MICRO_MODEL,
      });
      const fallback = await answerQuestion(reader, prompt, base);
      for (const q of [
        boundedIntent(prompt, base),
        routed.query,
        fallback.query,
        ...reads,
        ...modelInputs,
      ]) {
        expect(q).toMatchObject({
          minOpenDays: days,
          permitStatus: status,
          minReportedSaleAgeYears: 10,
        });
        expect(q.minOwnershipYears).toBeUndefined();
      }
      expect(modelInputs).toHaveLength(1);
      expect(reads).toHaveLength(2);
    }
  });
  it("refuses a separate unsupported tenure clause even when a valid reported-sale clause is present", async () => {
    const base = {
      snapshotId: "synthetic",
      lat: 42.66,
      lng: -83.29,
      radiusMeters: 8046.72,
    };
    for (const prompt of [
      "Show properties owned for 20 years and last reported sale older than ten years",
      "Show last reported sale older than ten years and properties owned for 20 years",
      "Show properties with ownership tenure over 20 years and last reported sale older than ten years",
    ]) {
      let providerCalls = 0,
        reads = 0;
      const reader = {
        search: async (q: QueryInput) => {
          reads++;
          return evidence(q);
        },
        detail: async () => property,
      };
      const provider: ConverseTransport = {
        converse: async () => {
          providerCalls++;
          throw Error("No provider use permitted");
        },
      };
      expect(() => boundedIntent(prompt, base)).toThrow("tenure");
      await expect(
        answerWithBedrock(reader, provider, prompt, base, {
          modelId: MICRO_MODEL,
        }),
      ).rejects.toThrow("tenure");
      await expect(answerQuestion(reader, prompt, base)).rejects.toThrow(
        "tenure",
      );
      expect(providerCalls).toBe(0);
      expect(reads).toBe(0);
    }
  });
  it("keeps deterministic fallback inside the same active map and page limit", async () => {
    const base = {
      snapshotId: "synthetic",
      lat: 42.66,
      lng: -83.29,
      radiusMeters: 1609.344,
      limit: 7,
    };
    let applied: QueryInput | undefined;
    await answerQuestion(
      {
        search: async (q) => {
          applied = q;
          return evidence(q);
        },
        detail: async () => property,
      },
      "Find evidence within 10 miles",
      base,
    );
    expect(applied).toMatchObject({
      radiusMeters: base.radiusMeters,
      limit: 7,
    });
  });
  it("keeps reported-sale age distinct from ownership tenure", () => {
    const base = {
      snapshotId: "synthetic",
      lat: 42.66,
      lng: -83.29,
      radiusMeters: 8046.72,
    };
    const q = boundedIntent(
      "Show last reported sale observed more than ten years ago",
      base,
    );
    expect(q.minReportedSaleAgeYears).toBe(10);
    expect(q.minOwnershipYears).toBeUndefined();
    expect(() =>
      boundedToolArguments({ ...q, minReportedSaleAgeYears: 5 }, q),
    ).toThrow("weakened");
    expect(() =>
      boundedIntent("Show properties owned for more than ten years", base),
    ).toThrow("tenure");
    expect(() =>
      boundedToolArguments({ ...base, minOwnershipYears: 10 }, base),
    ).toThrow("tenure");
  });
  it("refuses a historical P3 campaign as evidence for a P4 repair", () => {
    expect(() =>
      qualityFailure(
        {
          phase: "prism-assessment-p3",
          architecture: "two-turn-selection",
          accepted: false,
          outcomes: [],
        },
        "base",
      ),
    ).toThrow("P4");
  });
  it("writes only the immutable P4 partition, with no P3 reset or access", async () => {
    const legacy = { consumed: 41 },
      seen: string[] = [];
    const db = {
      send: async (command: GetCommand | PutCommand | TransactWriteCommand) => {
        if (command instanceof GetCommand)
          seen.push(String(command.input.Key?.pk));
        else if (command instanceof PutCommand)
          seen.push(String(command.input.Item?.pk));
        else
          for (const item of command.input.TransactItems!)
            seen.push(String(item.Update?.Key?.pk));
        return {};
      },
    };
    const store = new DynamoCampaignStore(
      db as never,
      "synthetic-shared-table",
    );
    await store.reserve({
      kind: "converse",
      subject: "synthetic",
      modelId: MICRO_MODEL,
      nowMs: now,
      reservedMicroUsd: 560,
    });
    await store.record({
      requestId: "synthetic",
      subjectDigest: hash("s"),
      promptDigest: hash("p"),
      modelId: MICRO_MODEL,
      revision: "base",
      architecture: ROUTING_ARCHITECTURE,
      region: "us-east-1",
      at: new Date(now).toISOString(),
      callIndex: 1,
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((x) => x === "campaign#prism-assessment-p4")).toBe(true);
    expect(legacy).toEqual({ consumed: 41 });
  });
});
