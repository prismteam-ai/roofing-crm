import { expect, it } from "vitest";
import {
  CONTRACT_VERSION,
  PropertySchema,
} from "../packages/contracts/src/index";
import {
  answerWithBedrock,
  minimizedEvidenceContext,
  minimizedEvidenceRow,
} from "../packages/agent/src/bedrock";
import type { ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import { nonemptyEvidenceProperty } from "./support/evidence-fixture";

const privateSentinel = "SYNTHETIC_PRIVATE_REPORTED_OWNER_DO_NOT_SEND_TO_MODEL";
const row = {
  ...nonemptyEvidenceProperty,
  distanceMeters: 0,
  ownership: {
    ...nonemptyEvidenceProperty.ownership,
    reportedOwnerObservations: [
      {
        reportedName: privateSentinel,
        sourceLabel: "Owner" as const,
        relatedPermitEvent: { kind: "applied" as const, date: "2026-04-01" },
        ownershipEffectiveDate: null,
        roleVerification: "source_reported_unverified" as const,
        provenance: [
          {
            sourceId: "DO_NOT_SEND_OWNER_SOURCE",
            recordId: "DO_NOT_SEND_OWNER_RECORD",
            observedAt: "2026-10-28T00:00:00Z",
            digest: "a".repeat(64),
            kind: "synthetic" as const,
          },
        ],
        limitations: ["DO_NOT_SEND_OWNER_FREE_TEXT"],
      },
    ],
  },
};

it("the row minimizer excludes private reported owner names, event roles, provenance and free text", () => {
  expect(row.ownership.reportedOwnerObservations[0].reportedName).toBe(
    privateSentinel,
  );
  const projected = minimizedEvidenceRow(row, 0);
  const serialized = JSON.stringify(projected);
  expect(serialized).not.toContain(privateSentinel);
  expect(serialized).not.toContain("DO_NOT_SEND_OWNER");
  expect(projected).not.toHaveProperty("ownership");
  expect(projected).not.toHaveProperty("reportedOwnerObservations");
  expect(projected.reportedSale).toEqual({
    latestObservedDate: null,
    historyCoverage: "unknown",
  });
});

it("the complete minimized evidence context never copies private names from original retrieved rows", () => {
  const data = {
    contractVersion: CONTRACT_VERSION,
    snapshotId: "synthetic-owner-privacy",
    queryHash: "synthetic-owner-query",
    rows: [row],
    total: 1,
    truncated: false,
    nextCursor: null,
    limitations: ["DO_NOT_SEND_OWNER_RESPONSE_FREE_TEXT"],
  };
  const projected = minimizedEvidenceContext(data, [
    minimizedEvidenceRow(row, 0),
  ]);
  expect(JSON.stringify(projected)).not.toContain(privateSentinel);
  expect(JSON.stringify(projected)).not.toContain("DO_NOT_SEND_OWNER");
  expect(projected.minimizedRowCount).toBe(1);
});

it("the canonical private API row retains source-labeled owner evidence while the one captured model call excludes it", async () => {
  const parsed = PropertySchema.parse(row);
  expect(parsed.ownership.reportedOwnerObservations?.[0].reportedName).toBe(
    privateSentinel,
  );
  const query = {
    snapshotId: "synthetic-owner-privacy",
    lat: 42.66,
    lng: -83.29,
    radiusMeters: 1609.344,
    includeUnknown: true,
    limit: 5,
  };
  const data = {
    contractVersion: CONTRACT_VERSION,
    snapshotId: query.snapshotId,
    queryHash: "synthetic-owner-query",
    rows: [{ ...parsed, distanceMeters: 0 }],
    total: 1,
    truncated: false,
    nextCursor: null,
    limitations: [],
  };
  const requests: ConverseCommandInput[] = [];
  let reads = 0;
  const result = await answerWithBedrock(
    {
      search: async () => {
        reads++;
        return data;
      },
      detail: async () => {
        throw Error("No detail expected");
      },
    } as never,
    {
      converse: async (request) => {
        requests.push(structuredClone(request));
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
                    toolUseId: "synthetic-owner-tool",
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
    },
    "Find roofing evidence",
    query,
    { modelId: "amazon.nova-micro-v1:0" },
  );
  expect(reads).toBe(1);
  expect(requests).toHaveLength(1);
  expect(result.mode).toBe("bedrock-grounded");
  expect(
    result.results[0].ownership.reportedOwnerObservations?.[0].reportedName,
  ).toBe(privateSentinel);
  expect(JSON.stringify(requests)).not.toContain(privateSentinel);
  expect(JSON.stringify(requests)).not.toContain("DO_NOT_SEND_OWNER");
  expect(result.answer).not.toContain(privateSentinel);
  expect(result.toolTrace[0].minimizedRowCount).toBe(1);
});

it("the private observation schema rejects unknown roles, inferred effective dates and contact extras", () => {
  const owner = row.ownership.reportedOwnerObservations[0];
  for (const invalid of [
    { ...owner, sourceLabel: "Contact" },
    { ...owner, roleVerification: "verified_current_owner" },
    { ...owner, ownershipEffectiveDate: "2026-04-01" },
    { ...owner, contact: "DO_NOT_SEND_OWNER_CONTACT" },
  ])
    expect(
      PropertySchema.safeParse({
        ...row,
        ownership: { ...row.ownership, reportedOwnerObservations: [invalid] },
      }).success,
    ).toBe(false);
});
