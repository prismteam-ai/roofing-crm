import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  answerWithBedrock,
  minimizedEvidenceRow,
  type ConverseTransport,
  boundedIntent,
} from "../packages/agent/src/bedrock";
import { answerQuestion } from "../packages/agent/src/index";
import {
  PropertySchema,
  CONTRACT_VERSION,
  type QueryInput,
} from "../packages/contracts/src/index";
const q = {
  snapshotId: "synthetic-grounded",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
};
const source = {
  sourceId: "official-troy-issued-permits",
  recordId: "DO_NOT_SEND_RAW_NATIVE",
  observedAt: "2026-10-28T00:00:00Z",
  digest: "a".repeat(64),
  kind: "synthetic",
};
const p = PropertySchema.parse({
  id: "DO_NOT_SEND_RAW_ID",
  nativeId: "DO_NOT_SEND_RAW_NATIVE",
  address: "DO_NOT_SEND_RAW_ADDRESS",
  parcelIds: [],
  coordinates: { lat: 42.66, lng: -83.29 },
  usage: "residential",
  roof: {
    ageYears: 26,
    basis: "built_year",
    confidence: "low",
    asOf: "2026-10-28",
    caveats: ["DO_NOT_SEND_RAW_SOURCE_CAVEAT"],
  },
  permits: [
    {
      id: "DO_NOT_SEND_RAW_PERMIT_ID",
      status: "open",
      statusBasis: "explicit_open",
      statusObservedAt: "2021-01-01T00:00:00Z",
      kind: "roof_repair",
      openedAt: "2020-01-01",
      closedAt: null,
      contractor: {
        reportedName: "DO_NOT_SEND_RAW_BUSINESS_NAME",
        verifiedCompanyId: null,
        license: "SYN-LIC-1",
        rating: null,
        licenseEvidence: {
          identifier: "SYN-LIC-1",
          type: "Residential business license",
          status: "Inactive",
          sourceUrl: "https://example.invalid/DO_NOT_SEND_RAW_URL",
          observedAt: "2026-10-27T00:00:00Z",
          matchBasis: "DO_NOT_SEND_RAW_MATCH_TEXT",
          confidence: "medium",
        },
        ratingEvidence: {
          value: "NR",
          scale: "BBB",
          sourceUrl: "https://example.invalid/DO_NOT_SEND_RAW_URL",
          observedAt: "2026-10-27T00:00:00Z",
          matchConfidence: "low",
        },
      },
      provenance: [source],
    },
  ],
  ownership: {
    lastTransferDate: null,
    historyCoverage: "partial",
    ownerRegion: "unknown",
    events: [
      {
        id: "DO_NOT_SEND_RAW_SALE_ID",
        kind: "reported_sale",
        date: "2010-01-01",
        provenance: [source],
      },
    ],
  },
  provenance: [source],
});
it("explicit roof age excludes unknowns inherited from the UI unless the user explicitly opts in", () => {
  const base = { ...q, includeUnknown: true };
  expect(
    boundedIntent("Find roofs older than 15 within 5 miles", base),
  ).toMatchObject({ roofMinAgeYears: 15, includeUnknown: false });
  for (const prompt of [
    "Find roofs older than 15 and include unknown roof ages",
    "Find roofs older than 15 including unknown roof evidence",
  ])
    expect(boundedIntent(prompt, base).includeUnknown).toBe(true);
  expect(
    boundedIntent(
      "Find roofs older than 15 but do not include unknown roof ages",
      base,
    ).includeUnknown,
  ).toBe(false);
  expect(
    boundedIntent("Show unknown roof and permit evidence", base).includeUnknown,
  ).toBe(true);
});
it("the grounded model and deterministic path see only known older roofs unless unknown evidence is explicitly requested", async () => {
  const unknown = {
    ...p,
    id: "synthetic-unknown",
    roof: {
      ...p.roof,
      ageYears: null,
      basis: "unknown" as const,
      confidence: "unknown" as const,
    },
  };
  for (const optIn of [false, true]) {
    const base = { ...q, includeUnknown: true },
      prompt =
        "Find roofs older than 15" +
        (optIn ? " and include unknown roof ages" : "");
    let reads = 0,
      calls = 0;
    const sourceRows = [p, unknown];
    const reader = {
      search: async (input: QueryInput) => {
        reads++;
        const rows = sourceRows
          .filter((row) =>
            row.roof.ageYears === null
              ? input.includeUnknown
              : row.roof.ageYears > input.roofMinAgeYears!,
          )
          .map((row) => ({ ...row, distanceMeters: 0 }));
        return {
          contractVersion: CONTRACT_VERSION,
          snapshotId: q.snapshotId,
          queryHash: "synthetic-explicit-age",
          rows,
          total: rows.length,
          truncated: false,
          nextCursor: null,
          limitations: ["Synthetic"],
        };
      },
      detail: async () => p,
    };
    const provider: ConverseTransport = {
      converse: async (request) => {
        calls++;
        const rows = JSON.parse(request.messages![0].content![0].text!)
          .retrievedEvidence.rows as {
          ordinal: number;
          roof: { ageYears: number | null };
        }[];
        expect(rows).toHaveLength(optIn ? 2 : 1);
        if (!optIn)
          expect(
            rows.every(
              (row) => row.roof.ageYears !== null && row.roof.ageYears > 15,
            ),
          ).toBe(true);
        return {
          $metadata: {},
          metrics: { latencyMs: 1 },
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
          stopReason: "tool_use",
          output: {
            message: {
              role: "assistant",
              content: [
                {
                  toolUse: {
                    toolUseId: "age",
                    name: "selectGroundedEvidence",
                    input: {
                      selections: rows.map((row) => ({
                        ordinal: row.ordinal,
                        reason: "context_match",
                      })),
                    },
                  },
                },
              ],
            },
          },
        };
      },
    };
    const answer = await answerWithBedrock(reader, provider, prompt, base, {
      modelId: "synthetic",
    });
    const deterministic = await answerQuestion(reader, prompt, base);
    expect(answer.query.includeUnknown).toBe(optIn);
    expect(answer.results).toHaveLength(optIn ? 2 : 1);
    expect(deterministic.results).toEqual(answer.results);
    expect(reads).toBe(2);
    expect(calls).toBe(1);
  }
});
it("rejects a backend unknown-age row violating an explicit age predicate before provider use or deterministic rendering", async () => {
  let calls = 0;
  const invalid = { ...p, roof: { ...p.roof, ageYears: null } };
  const reader = {
    search: async () => ({
      contractVersion: CONTRACT_VERSION,
      snapshotId: q.snapshotId,
      queryHash: "synthetic-invalid-age",
      rows: [{ ...invalid, distanceMeters: 0 }],
      total: 1,
      truncated: false,
      nextCursor: null,
      limitations: ["Synthetic"],
    }),
    detail: async () => p,
  };
  const provider: ConverseTransport = {
    converse: async () => {
      calls++;
      throw Error("No model call");
    },
  };
  await expect(
    answerWithBedrock(
      reader,
      provider,
      "Find roofs older than 15",
      { ...q, includeUnknown: true },
      { modelId: "synthetic" },
    ),
  ).rejects.toThrow("roof-age predicate");
  await expect(
    answerQuestion(reader, "Find roofs older than 15", {
      ...q,
      includeUnknown: true,
    }),
  ).rejects.toThrow("roof-age predicate");
  expect(calls).toBe(0);
});
it("exposes only literal allowlisted retrieved facts, observed duration, business role and licensing/rating evidence", async () => {
  let reads = 0,
    calls = 0;
  const searched: QueryInput[] = [];
  const data = {
    contractVersion: CONTRACT_VERSION,
    snapshotId: q.snapshotId,
    queryHash: "synthetic-query",
    rows: [{ ...p, distanceMeters: 0 }],
    total: 9,
    truncated: true,
    nextCursor: null,
    limitations: ["DO_NOT_SEND_RAW_LIMITATION"],
  };
  const provider: ConverseTransport = {
    converse: async (request) => {
      calls++;
      expect(reads).toBe(1);
      const raw = JSON.stringify(request);
      expect(raw).not.toContain("DO_NOT_SEND_RAW");
      const message = JSON.parse(request.messages![0].content![0].text!),
        row = message.retrievedEvidence.rows[0];
      expect(row).toMatchObject({
        ordinal: 0,
        roof: { ageYears: 26, basis: "built_year", confidence: "low" },
        reportedBusinessRole: "business_applicant_not_verified_contractor",
        license: [
          {
            identifier: "SYN-LIC-1",
            status: "Inactive",
            matchConfidence: "medium",
          },
        ],
        bbb: [{ value: "NR", scale: "BBB", matchConfidence: "low" }],
        reportedSale: {
          latestObservedDate: "2010-01-01",
          historyCoverage: "partial",
        },
        permits: {
          open: 1,
          oldestOpenDays: 366,
          oldestOpenObservedAt: "2021-01-01",
        },
      });
      expect(message.evidenceDigest).toBe(
        createHash("sha256")
          .update(JSON.stringify(message.retrievedEvidence))
          .digest("hex"),
      );
      return {
        $metadata: {},
        metrics: { latencyMs: 1 },
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        stopReason: "tool_use",
        output: {
          message: {
            role: "assistant",
            content: [
              {
                toolUse: {
                  toolUseId: "grounded",
                  name: "selectGroundedEvidence",
                  input: {
                    selections: [
                      { ordinal: 0, reason: "reported_business_license" },
                    ],
                  },
                },
              },
            ],
          },
        },
      };
    },
  };
  const answer = await answerWithBedrock(
    {
      search: async (input) => {
        reads++;
        searched.push(input);
        return data;
      },
      detail: async () => p,
    },
    provider,
    "Show available business license evidence",
    q,
    { modelId: "synthetic" },
  );
  expect(reads).toBe(1);
  expect(calls).toBe(1);
  expect(searched[0]).toMatchObject(q);
  expect(answer.results).toEqual(data.rows);
  expect(answer.toolTrace[0]).toMatchObject({
    totalMatched: 9,
    retrievedRowCount: 1,
    minimizedRowCount: 1,
    selectedOrdinals: [0],
    modelSawMinimizedFacts: true,
  });
  expect(answer.answer).toContain("9 matching properties");
  expect(answer.answer).toContain("not complete coverage");
});
it("does not promote issued-only or unknown records to open evidence in the minimized facts", () => {
  const row = {
    ...p,
    permits: [
      {
        ...p.permits[0],
        statusBasis: "issued_only" as const,
        status: "unknown" as const,
        openedAt: null,
        statusObservedAt: undefined,
      },
    ],
    distanceMeters: 0,
  };
  expect(minimizedEvidenceRow(row, 0).permits).toMatchObject({
    open: 0,
    unknown: 1,
    oldestOpenDays: null,
    oldestOpenObservedAt: null,
  });
});
