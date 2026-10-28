import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createApp } from "../apps/api/src/app";
import { answerQuestion } from "../packages/agent/src/index";
import {
  answerWithBedrock,
  boundedToolArguments,
  type ConverseTransport,
} from "../packages/agent/src/bedrock";
import { interpretIntent, requireIntent } from "../packages/agent/src/intent";
import {
  officialPlaceResolver,
  resolveQueryPlace,
} from "../packages/places/src/index";
import { ConstraintLedger } from "../apps/crm-web/src/ConstraintLedger";
import {
  queryToUrl,
  queryFromUrl,
  updateQueryContext,
} from "../packages/map-domain/src/index";
import {
  QuerySchema,
  CONTRACT_VERSION,
  type QueryInput,
  type SearchResponse,
  type Property,
} from "../packages/contracts/src/index";
import { nonemptyEvidenceProperty } from "./support/evidence-fixture";
const base = QuerySchema.parse({
  snapshotId: "synthetic-p5-integration",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
  includeUnknown: true,
  limit: 50,
});
const leads = {
  list: () => [],
  create: () => {
    throw Error("No lead mutation expected");
  },
  update: () => {
    throw Error("No lead mutation expected");
  },
};
function data(
  query: QueryInput,
  rows: Property[] = [nonemptyEvidenceProperty],
): SearchResponse {
  return {
    contractVersion: CONTRACT_VERSION,
    snapshotId: query.snapshotId,
    queryHash: "a".repeat(64),
    rows: rows.map((x) => ({
      ...x,
      coordinates: { lat: query.lat, lng: query.lng },
      distanceMeters: 0,
    })),
    total: rows.length,
    truncated: false,
    nextCursor: null,
    limitations: ["Synthetic integration evidence only"],
    ...(query.placeId ? { placeResolution: resolveQueryPlace(query) } : {}),
  };
}
function provider(
  ordinals: number[],
  calls: { value: number },
): ConverseTransport {
  return {
    converse: async () => {
      calls.value++;
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
                  toolUseId: "synthetic",
                  name: "selectGroundedEvidence",
                  input: {
                    selections: ordinals.map((ordinal) => ({
                      ordinal,
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
}
it("API refusals expose a typed rejected ledger before any reader or agent invocation", async () => {
  let reads = 0,
    modelInvocations = 0;
  const reader = {
    search: async (q: QueryInput) => {
      reads++;
      return data(q);
    },
    detail: async () => nonemptyEvidenceProperty,
  };
  const app = createApp({
    oracle: reader,
    leads,
    agent: async (prompt, q) => {
      modelInvocations++;
      return answerQuestion(reader, prompt, q);
    },
  });
  const response = await app({
    method: "POST",
    path: "/api/agent",
    headers: {},
    body: { prompt: "Find roofs within five miles of Novi", query: base },
  });
  const body = JSON.parse(response.body);
  expect(response.statusCode).toBe(400);
  expect(body.mode).toBe("refused-before-model");
  expect(body.intent.accepted).toBe(false);
  expect(
    body.intent.ledger.some(
      (x: { classification: string; typedField: string }) =>
        x.classification === "ambiguous" && x.typedField === "placeId",
    ),
  ).toBe(true);
  expect({ reads, modelInvocations }).toEqual({
    reads: 0,
    modelInvocations: 0,
  });
});
it("the original city query returns official coordinates and a query-bound accepted ledger", async () => {
  const reads: QueryInput[] = [];
  const reader = {
    search: async (q: QueryInput) => {
      reads.push(q);
      return data(q);
    },
    detail: async () => nonemptyEvidenceProperty,
  };
  const app = createApp({ oracle: reader, leads });
  const response = await app({
    method: "POST",
    path: "/api/agent",
    headers: {},
    body: {
      prompt:
        "Which properties in Oakland County within five miles of Troy have roofs older than 15 years?",
      query: base,
    },
  });
  expect(response.statusCode).toBe(200);
  const answer = JSON.parse(response.body),
    place = officialPlaceResolver.get("us-26-125-80700-city")!;
  expect(reads).toHaveLength(1);
  expect(reads[0]).toMatchObject({
    placeId: place.placeId,
    placeIndexDigest: place.indexDigest,
    lat: place.center.lat,
    lng: place.center.lng,
    roofMinAgeYears: 15,
    radiusMeters: 8046.72,
  });
  expect(answer.intent.accepted).toBe(true);
  expect(answer.intent.query).toEqual(answer.query);
  expect(answer.intent.placeResolution).toEqual(place);
  expect(
    answer.intent.ledger.every(
      (x: { material: boolean; classification: string }) =>
        !x.material || x.classification === "applied",
    ),
  ).toBe(true);
});
it("the original vague-duration example orders observations without inventing a cutoff or contractor-presence filter", async () => {
  const prompt =
    "Which properties near that area have open roofing permits that have been open for many years, and who is the listed contractor?";
  const plan = requireIntent(prompt, base);
  const property = {
    ...nonemptyEvidenceProperty,
    permits: [
      {
        id: "SYN-OPEN",
        status: "open" as const,
        statusBasis: "explicit_open" as const,
        statusObservedAt: "2026-10-28T00:00:00Z",
        kind: "roof_repair" as const,
        openedAt: "2010-01-01",
        closedAt: null,
        contractor: {
          reportedName: "Synthetic applicant",
          verifiedCompanyId: null,
          license: null,
          rating: null,
        },
        provenance: nonemptyEvidenceProperty.provenance,
      },
    ],
  };
  const answer = await answerQuestion(
    { search: async (q) => data(q, [property]), detail: async () => property },
    prompt,
    base,
  );
  expect(plan.query).toMatchObject({
    permitStatus: "open",
    minOpenDays: 0,
    sort: "permit_open_days_desc",
  });
  expect(plan.query.requiresContractor).toBeUndefined();
  expect(answer.caveats.join(" ")).toContain("no numeric minimum");
});
it("same-permit business predicates are validated before constructing a model request", async () => {
  const open = {
    id: "SYN-A",
    status: "open" as const,
    kind: "roof_repair" as const,
    openedAt: "2010-01-01",
    closedAt: null,
    contractor: {
      reportedName: "Synthetic",
      verifiedCompanyId: null,
      license: null,
      rating: null,
    },
    provenance: nonemptyEvidenceProperty.provenance,
  };
  const property = {
    ...nonemptyEvidenceProperty,
    permits: [
      open,
      {
        ...open,
        id: "SYN-B",
        status: "closed" as const,
        closedAt: "2020-01-01",
        contractor: {
          ...open.contractor,
          verifiedCompanyId: "SYN-VERIFIED-COMPANY",
        },
      },
    ],
  };
  const calls = { value: 0 };
  let reads = 0;
  await expect(
    answerWithBedrock(
      {
        search: async (q) => {
          reads++;
          return data(q, [property]);
        },
        detail: async () => property,
      },
      provider([0], calls),
      "Find open permits with verified contractors",
      base,
      { modelId: "synthetic" },
    ),
  ).rejects.toThrow("validated source predicate");
  expect(reads).toBe(1);
  expect(calls.value).toBe(0);
});
it("missing or altered official place response evidence is rejected before model use", async () => {
  const calls = { value: 0 };
  for (const mismatch of ["missing", "altered"]) {
    await expect(
      answerWithBedrock(
        {
          search: async (q) => {
            const response = data(q);
            if (mismatch === "missing") delete response.placeResolution;
            else
              response.placeResolution = {
                ...response.placeResolution!,
                indexDigest: "0".repeat(64),
              };
            return response;
          },
          detail: async () => nonemptyEvidenceProperty,
        },
        provider([0], calls),
        "Find roofs older than 15 within five miles of Troy",
        base,
        { modelId: "synthetic" },
      ),
    ).rejects.toThrow("official place binding");
  }
  expect(calls.value).toBe(0);
});
it("a stale active place binding is refused before retrieval", async () => {
  const place = officialPlaceResolver.get("us-26-125-80700-city")!;
  let reads = 0;
  await expect(
    answerQuestion(
      {
        search: async (q) => {
          reads++;
          return data(q);
        },
        detail: async () => nonemptyEvidenceProperty,
      },
      "Find evidence",
      { ...base, placeId: place.placeId, placeIndexDigest: place.indexDigest },
    ),
  ).rejects.toThrow("active place");
  expect(reads).toBe(0);
});
it("legacy typed-tool guard cannot erase new place/order/business predicates", () => {
  const query = requireIntent(
    "Find properties with verified contractors and verified license observations and observed BBB ratings within five miles of Troy sorted by distance",
    base,
  ).query;
  expect(query).toMatchObject({
    requiresContractor: true,
    requiresVerifiedLicense: true,
    requiresBbbRating: true,
  });
  for (const field of [
    "placeId",
    "placeIndexDigest",
    "sort",
    "requiresContractor",
    "requiresVerifiedLicense",
    "requiresBbbRating",
  ] as const)
    expect(() =>
      boundedToolArguments({ ...query, [field]: undefined }, query),
    ).toThrow();
});
it("an explicit sort cannot be reversed by model ordinals", async () => {
  const calls = { value: 0 };
  let reads = 0;
  const old = {
    ...nonemptyEvidenceProperty,
    id: "SYN-OLDER",
    roof: { ...nonemptyEvidenceProperty.roof, ageYears: 50 },
  };
  await expect(
    answerWithBedrock(
      {
        search: async (q) => {
          reads++;
          return data(q, [old, nonemptyEvidenceProperty]);
        },
        detail: async () => old,
      },
      provider([1, 0], calls),
      "Find top two oldest roofs",
      base,
      { modelId: "synthetic" },
    ),
  ).rejects.toThrow("authoritative result order");
  expect({ reads, calls: calls.value }).toEqual({ reads: 1, calls: 1 });
});
it("the fixed model protocol explicitly retains authoritative source order when a sort is requested", async () => {
  const calls = { value: 0 };
  const fake = provider([0], calls);
  const ordered: ConverseTransport = {
    converse: async (request, options) => {
      expect(request.system?.[0].text).toContain(
        "If boundedQuery.sort is present, retain authoritative source order: return selected supplied ordinals in strictly increasing numeric order.",
      );
      expect(
        JSON.parse(request.messages![0].content![0].text!).boundedQuery.sort,
      ).toBe("distance");
      return fake.converse(request, options);
    },
  };
  const answer = await answerWithBedrock(
    {
      search: async (q) => data(q),
      detail: async () => nonemptyEvidenceProperty,
    },
    ordered,
    "Find properties sorted by distance",
    base,
    { modelId: "synthetic" },
  );
  expect(answer.mode).toBe("bedrock-grounded");
  expect(calls.value).toBe(1);
});
it("invalid source order cannot enter model context or cached deterministic rendering", async () => {
  const calls = { value: 0 };
  let reads = 0;
  const old = {
    ...nonemptyEvidenceProperty,
    id: "SYN-OLDER",
    roof: { ...nonemptyEvidenceProperty.roof, ageYears: 50 },
  };
  const query = requireIntent("Find top two oldest roofs", base).query;
  const invalid = data(query, [nonemptyEvidenceProperty, old]);
  const reader = {
    search: async () => {
      reads++;
      return invalid;
    },
    detail: async () => old,
  };
  await expect(
    answerWithBedrock(
      reader,
      provider([0], calls),
      "Find top two oldest roofs",
      base,
      { modelId: "synthetic" },
    ),
  ).rejects.toThrow("authoritative result order");
  expect({ reads, calls: calls.value }).toEqual({ reads: 1, calls: 0 });
  const { answerFromEvidence } = await import("../packages/agent/src/index");
  expect(() =>
    answerFromEvidence(invalid, query, "deterministic-fallback"),
  ).toThrow("authoritative result order");
  expect(reads).toBe(1);
});
it("named place precision, new predicates/order/limit and unknown inclusion survive URL reload; manual movement clears binding", () => {
  const place = officialPlaceResolver.get("us-26-125-80700-city")!;
  const query = QuerySchema.parse({
    ...base,
    lat: place.center.lat,
    lng: place.center.lng,
    placeId: place.placeId,
    placeIndexDigest: place.indexDigest,
    permitStatus: "unknown",
    requiresContractor: true,
    requiresVerifiedLicense: true,
    requiresBbbRating: true,
    sort: "roof_age_desc",
    limit: 17,
    includeUnknown: true,
  });
  const restored = queryFromUrl(queryToUrl(query), query.snapshotId);
  expect(restored).toEqual(query);
  expect(resolveQueryPlace(restored)).toEqual(place);
  const moved = updateQueryContext(restored, { lng: restored.lng + 0.02 });
  expect(moved.placeId).toBeUndefined();
  expect(moved.placeIndexDigest).toBeUndefined();
  expect(moved.requiresBbbRating).toBe(true);
});
it("accepted/rejected ledgers are accessible, escaped and explicit about geographic center versus polygon containment", () => {
  const accepted = requireIntent(
    "Find roofs older than 15 within five miles of Troy",
    base,
  );
  const html = renderToStaticMarkup(
    <ConstraintLedger intent={accepted} onApply={() => {}} />,
  );
  expect(html).toContain('aria-label="Constraint ledger"');
  expect(html).toContain("Show this search on the map");
  expect(html).toContain("not a municipal-boundary filter");
  expect(html).toContain("FIPS");
  const rejected = interpretIntent(
    "Find properties with BBB rating above 80",
    base,
  );
  const rejectedHtml = renderToStaticMarkup(
    <ConstraintLedger intent={rejected} />,
  );
  expect(rejectedHtml).toContain("Request not run");
  expect(rejectedHtml).toContain(
    "refused before evidence retrieval or model use",
  );
  expect(rejectedHtml).toContain("BBB numeric/grade thresholds");
});
