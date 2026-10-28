import { approvedModelResponse } from "./support/retrieval-model";
import { it, expect } from "vitest";
import {
  answerWithBedrock,
  type ConverseTransport,
} from "../packages/agent/src/bedrock";
import { groundedFailureDetail } from "../packages/agent/src/failure-detail";
import {
  DomainError,
  CONTRACT_VERSION,
  PropertySchema,
} from "../packages/contracts/src/index";
const q = {
  snapshotId: "synthetic-repair",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
};
const p = PropertySchema.parse({
  id: "synthetic-repair-row",
  nativeId: "synthetic-repair-row",
  address: "Synthetic repair fixture",
  parcelIds: [],
  coordinates: { lat: q.lat, lng: q.lng },
  usage: "unknown",
  roof: {
    ageYears: null,
    basis: "unknown",
    confidence: "unknown",
    asOf: "2026-10-28",
    caveats: ["Synthetic"],
  },
  permits: [],
  ownership: {
    lastTransferDate: null,
    historyCoverage: "unknown",
    ownerRegion: "unknown",
  },
  provenance: [],
});
const provider = (
  input: unknown,
  inspect?: (text: string) => void,
): ConverseTransport => ({
  converse: async (request) => {
    inspect?.(request.system);
    return {
      ...approvedModelResponse(request),
      content: [
        {
          ...approvedModelResponse(request).content[0],
          input: input ?? request.approved,
        },
      ],
    };
  },
});
const reader = (empty = false) => ({
  search: async () => ({
    contractVersion: CONTRACT_VERSION,
    snapshotId: q.snapshotId,
    queryHash: "synthetic-repair-query",
    rows: empty ? [] : [{ ...p, distanceMeters: 0 }],
    total: empty ? 0 : 1,
    truncated: false,
    nextCursor: null,
    limitations: ["Synthetic"],
  }),
  detail: async () => p,
});
it("active retrieval base and one gated repair never restore model-authored facts", async () => {
  let base = "",
    repair = "";
  for (const revision of ["base", "repair-1"] as const) {
    const result = await answerWithBedrock(
      reader(),
      provider(undefined, (text) => {
        if (revision === "base") base = text;
        else repair = text;
      }),
      "Find evidence",
      q,
      { modelId: "synthetic", promptRevision: revision },
    );
    expect(result.mode).toBe("bedrock-grounded");
    expect(result.toolTrace[0].rationaleSource).toBe("server-minimized-facts");
  }
  expect(base).not.toContain("Repair1:");
  expect(repair.startsWith(base)).toBe(true);
  expect(base).toContain("all five approvedRetrieval literals exactly");
  expect(repair).toContain("Do not add keys or rewrite digests, sort or limit");
});
it("v2 rejects empty/non-numeric/subset/unique/extra/model-rationale violations with fixed safe failure enums", async () => {
  for (const [input, detail] of [
    [{ ordinals: [] }, "selection_schema"],
    [{ ordinals: ["0"] }, "selection_schema"],
    [{ ordinals: [-1] }, "selection_schema"],
    [{ ordinals: [0, 0] }, "selection_ordinals"],
    [{ ordinals: [1] }, "selection_ordinals"],
    [
      { selections: [{ ordinal: 0, reason: "observed_bbb_rating" }] },
      "selection_schema",
    ],
    [{ ordinals: [0], reason: "observed_bbb_rating" }, "selection_schema"],
    [
      { ordinals: [0], text: "synthetic-private-provider-detail" },
      "selection_schema",
    ],
  ] as const) {
    try {
      await answerWithBedrock(reader(), provider(input), "Find evidence", q, {
        modelId: "synthetic",
        promptRevision: "repair-1",
      });
      throw Error("Invalid selection accepted");
    } catch (error) {
      expect(detail).toMatch(/^selection_/);
      expect(groundedFailureDetail(error)).toBe("retrieval_constraints");
    }
  }
  expect(
    groundedFailureDetail(
      new DomainError(
        "INVALID_INPUT",
        "Provider supplied invalid grounded selection arguments plus synthetic private text",
      ),
    ),
  ).toBeUndefined();
  expect(
    groundedFailureDetail(
      new Error("Provider supplied invalid grounded selection arguments"),
    ),
  ).toBeUndefined();
  expect(
    groundedFailureDetail(
      new DomainError("INVALID_INPUT", "Provider token usage was invalid"),
    ),
  ).toBe("usage_invalid");
  expect(
    groundedFailureDetail(
      new DomainError("INVALID_INPUT", "Provider token usage was inconsistent"),
    ),
  ).toBe("usage_inconsistent");
  expect(
    groundedFailureDetail(
      new DomainError(
        "COST_LIMIT_REACHED",
        "Provider exceeded the token budget",
      ),
    ),
  ).toBe("usage_budget");
});
