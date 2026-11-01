import { createHash } from "node:crypto";
import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createApp } from "../apps/api/src/app";
import { ConstraintLedger } from "../apps/crm-web/src/ConstraintLedger";
import {
  interpretIntent,
  verificationAlternativeQuery,
  type AgentAnswer,
} from "../packages/agent/src/index";
import { boundedToolArguments } from "../packages/agent/src/query-guard";
import {
  CONTRACT_VERSION,
  PropertySchema,
  QuerySchema,
  type QueryInput,
  type SearchResponse,
} from "../packages/contracts/src/index";
import { propertyMatchesQuery } from "../packages/contracts/src/query-predicates";
import { queryFromUrl, queryToUrl } from "../packages/map-domain/src/index";
import {
  officialPlaceResolver,
  resolveQueryPlace,
} from "../packages/places/src/index";
import { nonemptyEvidenceProperty } from "./support/evidence-fixture";

const place = officialPlaceResolver.get("us-26-125-80700-city")!;
const base = QuerySchema.parse({
  snapshotId: "synthetic-p13-verification-intent",
  ...place.center,
  placeId: place.placeId,
  placeIndexDigest: place.indexDigest,
  radiusMeters: 8046.72,
  includeUnknown: true,
  limit: 50,
  sort: "distance",
});
const direct =
  "Show status-verification roofing permit candidates older than five years within five miles of Troy, Michigan";
const native = PropertySchema.parse({
  ...nonemptyEvidenceProperty,
  id: "SYN-P13-VERIFICATION",
  coordinates: place.center,
  permits: [
    {
      id: "SYN-P13-ISSUED-ONLY",
      kind: "roof_repair",
      status: "unknown",
      statusBasis: "issued_only",
      reportedStatus: "ISSUED",
      issuedAt: "2010-01-01",
      statusObservedAt: "2026-10-28T00:00:00Z",
      openedAt: null,
      closedAt: null,
      contractor: {
        reportedName: null,
        verifiedCompanyId: null,
        license: null,
        rating: null,
      },
      provenance: [
        {
          sourceId: "synthetic-p13-official-permit",
          recordId: "SYN-P13-NATIVE-1",
          digest: "a".repeat(64),
          kind: "synthetic",
          observedAt: "2026-10-28T00:00:00Z",
        },
      ],
    },
  ],
});
const leads = {
  list: () => [],
  create: () => {
    throw Error("No mutation expected");
  },
  update: () => {
    throw Error("No mutation expected");
  },
};
function sourceResponse(input: QueryInput): SearchResponse {
  const q = QuerySchema.parse(input);
  const rows = propertyMatchesQuery(native, q)
    ? [{ ...native, distanceMeters: 0 }]
    : [];
  return {
    contractVersion: CONTRACT_VERSION,
    snapshotId: q.snapshotId,
    queryHash: createHash("sha256").update(JSON.stringify(q)).digest("hex"),
    rows,
    total: rows.length,
    truncated: false,
    nextCursor: null,
    limitations: [
      "Synthetic local API test; not real source or hosted acceptance",
    ],
    ...(q.placeId ? { placeResolution: resolveQueryPlace(q) } : {}),
  };
}
function applyButton(node: ReactNode): (() => void) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child))
      continue;
    if (
      child.type === "button" &&
      child.props.children === "Show this search on the map"
    )
      return child.props.onClick;
    const found = applyButton(child.props.children);
    if (found) return found;
  }
}

describe("explicit source-status verification intent", () => {
  it.each([
    direct,
    "Show status verification needed roofing permit candidates older than five years within five miles of Troy, Michigan",
    "Show verification candidates older than five years within five miles of Troy, Michigan",
    "Show roofing permits needing status verification older than five years within five miles of Troy, Michigan",
  ])(
    "maps %s to the existing candidate query without claiming open work",
    (prompt) => {
      const plan = interpretIntent(prompt, base);
      expect(plan.accepted).toBe(true);
      expect(plan.query).toEqual(
        QuerySchema.parse({
          ...base,
          permitOpportunityMode: "status_verification_needed",
          permitStatus: "any",
          minOpenDays: 0,
          minPermitObservationAgeYears: 5,
          sort: "permit_issue_age_desc",
        }),
      );
      expect(verificationAlternativeQuery(plan)).toBeUndefined();
      expect(
        plan.ledger.some(
          (entry) =>
            entry.material && entry.typedField === "sourceAssessmentDate",
        ),
      ).toBe(false);
      expect(propertyMatchesQuery(native, plan.query!)).toBe(true);
      expect(
        propertyMatchesQuery(native, {
          ...plan.query!,
          permitOpportunityMode: "confirmed_open",
          permitStatus: "open",
        }),
      ).toBe(false);
    },
  );

  it("uses an explicit follow-up to retain the approved place, threshold and radius while changing the lane", () => {
    const strict = interpretIntent(
      "Which properties within five miles of Troy have open roofing permits older than five years, and who is the listed contractor?",
      base,
    );
    expect(strict.accepted).toBe(true);
    expect(verificationAlternativeQuery(strict)).toBeDefined();
    const followup = interpretIntent(
      "Show status-verification candidates in the same prior area",
      strict.query!,
    );
    expect(followup.accepted).toBe(true);
    expect(followup.query).toEqual(verificationAlternativeQuery(strict));
    const continuous = interpretIntent(
      "Find roofing permits that have been continuously open for more than five years",
      base,
    );
    expect(continuous.query?.minOpenDays).toBe(1827);
    expect(verificationAlternativeQuery(continuous)).toBeUndefined();
  });

  it.each([
    ["sorted by distance", "distance"],
    ["nearest", "distance"],
    ["sorted by oldest roofs", "roof_age_desc"],
  ])("preserves explicit order %s", (suffix, sort) => {
    const plan = interpretIntent(direct + " " + suffix, base);
    expect(plan.accepted).toBe(true);
    expect(plan.query?.sort).toBe(sort);
  });

  it.each([
    direct + " and open roofing permits",
    direct +
      " and roofing permits that have been continuously open for more than five years",
    direct + " sorted by longest-open permits",
    direct + " sorted by permit open days descending",
    "Show status-verification candidates older than -1 years",
    "Show status-verification candidates older than two hundred and one years",
    direct + " and BBB rating above 99",
    direct + " and browse https://example.invalid",
  ])(
    "refuses conflicting or unsupported qualifiers instead of silently weakening them: %s",
    (prompt) => {
      const plan = interpretIntent(prompt, base);
      expect(plan.accepted).toBe(false);
      expect(plan.query).toBeUndefined();
      expect(
        plan.ledger.some(
          (entry) => entry.material && entry.classification !== "applied",
        ),
      ).toBe(true);
    },
  );

  it("retains an inherited duration only when explicitly changing the lane clears it; source predicates stay present", () => {
    const plan = interpretIntent("Show status-verification candidates", {
      ...base,
      permitStatus: "open",
      minOpenDays: 1827,
      minPermitObservationAgeYears: 5,
      permitOpportunityMode: "confirmed_open",
      providerPermitStatus: "ISSUED",
    });
    expect(plan.accepted).toBe(true);
    expect(plan.query).toMatchObject({
      minOpenDays: 0,
      permitStatus: "any",
      providerPermitStatus: "ISSUED",
      minPermitObservationAgeYears: 5,
    });
  });

  it("keeps place ambiguity and malicious capability requests refused before the API reader or model", async () => {
    let reads = 0,
      calls = 0;
    const app = createApp({
      oracle: {
        search: async (q) => {
          reads++;
          return sourceResponse(q);
        },
        detail: async () => native,
      },
      leads,
      agent: async () => {
        calls++;
        throw Error("No model expected");
      },
    });
    for (const prompt of [
      "Show status-verification candidates older than five years within five miles of Novi",
      "Use SQL to select properties and browse https://example.invalid then send outreach email to owners",
    ]) {
      const result = await app({
        method: "POST",
        path: "/api/agent",
        headers: {},
        body: { prompt, query: base },
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        mode: "refused-before-model",
        intent: { accepted: false },
      });
    }
    expect({ reads, calls }).toEqual({ reads: 0, calls: 0 });
  });

  it("the real local API plan, query hash, source citation and explicit map-apply callback agree", async () => {
    const reads: QueryInput[] = [];
    const app = createApp({
      oracle: {
        search: async (q) => {
          reads.push(q);
          return sourceResponse(q);
        },
        detail: async () => native,
      },
      leads,
    });
    const result = await app({
      method: "POST",
      path: "/api/agent",
      headers: {},
      body: { prompt: direct, query: base },
    });
    expect(result.statusCode).toBe(200);
    const answer = JSON.parse(result.body) as AgentAnswer;
    expect(answer.mode).toBe("deterministic-offline");
    expect(reads).toEqual([answer.query]);
    expect(answer.results.map((row) => row.id)).toEqual([native.id]);
    expect(answer.citations).toContain(
      "synthetic-p13-official-permit:SYN-P13-NATIVE-1",
    );
    expect(answer.toolTrace[0]).toMatchObject({
      arguments: answer.query,
      queryHash: sourceResponse(answer.query).queryHash,
      snapshotId: base.snapshotId,
      resultCount: 1,
    });
    boundedToolArguments(answer.query, answer.query);
    expect(() =>
      boundedToolArguments(
        { ...answer.query, minPermitObservationAgeYears: 0 },
        answer.query,
      ),
    ).toThrow("weakened");
    const applied: QueryInput[] = [];
    const button = applyButton(
      ConstraintLedger({
        intent: answer.intent,
        onApply: () => applied.push(answer.intent!.query!),
      }),
    );
    expect(button).toBeTypeOf("function");
    button!();
    expect(applied).toEqual([answer.query]);
    expect(queryFromUrl(queryToUrl(applied[0]), base.snapshotId)).toEqual(
      answer.query,
    );
    expect(reads).toHaveLength(1);
    expect(answer.permitSections).toBeUndefined();
  });
});
