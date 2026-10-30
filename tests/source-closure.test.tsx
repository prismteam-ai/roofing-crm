import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { interpretIntent } from "../packages/agent/src/intent";
import { SOURCE_CLOSURE_CORPUS } from "../packages/agent/src/intent/source-corpus";
import { answerWithBedrock } from "../packages/agent/src/bedrock";
import { minimizedEvidenceRow } from "../packages/agent/src/evidence";
import {
  CONTRACT_VERSION,
  type SearchResponse,
  type QueryInput,
} from "../packages/contracts/src/index";
import { queryFromUrl, queryToUrl } from "../packages/map-domain/src/index";
import {
  propertyEvidence,
  isRestrictedProviderCitation,
} from "../packages/map-domain/src/signals";
import { ProviderObservations } from "../apps/crm-web/src/ProviderObservations";
import { RecordedDeedEvidence } from "../apps/crm-web/src/RecordedDeedEvidence";
import { SourceEvidenceFilters } from "../apps/crm-web/src/SourceEvidenceFilters";
import { approvedModelResponse } from "./support/retrieval-model";
import {
  sourceProperty,
  deedObservation,
  providerObservation,
  SOURCE_SNAPSHOT,
  PRIVATE_PARTY_CANARY,
  PRIVATE_LICENSE_CANARY,
} from "./support/source-observations";
const base: QueryInput = {
  snapshotId: SOURCE_SNAPSHOT,
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
  limit: 50,
};
function data(): SearchResponse {
  return {
    contractVersion: CONTRACT_VERSION,
    snapshotId: SOURCE_SNAPSHOT,
    queryHash: "synthetic-source-query",
    rows: [{ ...sourceProperty(), distanceMeters: 0 }],
    total: 1,
    truncated: false,
    nextCursor: null,
    limitations: ["Synthetic only"],
  };
}
it("preselects independent source cases and retains exact qualified meanings without substituting stronger tenure", () => {
  expect(SOURCE_CLOSURE_CORPUS).toHaveLength(12);
  for (const item of SOURCE_CLOSURE_CORPUS) {
    const plan = interpretIntent(item.prompt, base);
    expect(plan.accepted, item.id).toBe(item.expected === "accepted");
    if ("query" in item) expect(plan.query, item.id).toMatchObject(item.query);
    if (plan.accepted) expect(plan.query?.minOwnershipYears).toBeUndefined();
  }
  const tenure = interpretIntent("Find properties owned for ten years", base);
  expect(
    tenure.ledger.find((x) => x.normalizedMeaning === "true_tenure")?.reason,
  ).toContain("no observed recorded deed");
  const native = interpretIntent("Find native-reported open permits", base);
  expect(native.query?.permitActivityClaim).toBe("native_reported_open");
});
it("all four source filters round-trip through the URL without losing independent native-duration predicates", () => {
  const query = {
    ...base,
    providerPermitStatus: "IN_PROGRESS" as const,
    permitActivityClaim: "provider_reported_active" as const,
    minPermitAgeSinceIssueDays: 1827,
    minRecordedDeedGapYears: 10,
    minOpenDays: 0,
  };
  expect(queryFromUrl(queryToUrl(query), SOURCE_SNAPSHOT)).toMatchObject(query);
});
it("typed model retrieval preserves every new predicate across both reads and sends no source/party/license/URL facts to the model", async () => {
  const query = {
    ...base,
    providerPermitStatus: "ISSUED" as const,
    permitActivityClaim: "not_established" as const,
    minPermitAgeSinceIssueDays: 1827,
    minRecordedDeedGapYears: 10,
  };
  const queries: QueryInput[] = [];
  const answer = await answerWithBedrock(
    {
      search: async (q) => {
        queries.push(q);
        return data();
      },
      detail: async () => sourceProperty(),
    },
    {
      converse: async (request) => {
        const serialized = JSON.stringify(request);
        for (const sensitive of [
          PRIVATE_PARTY_CANARY,
          PRIVATE_LICENSE_CANARY,
          "www.ocmideeds.com",
          "SYN-PROVIDER-RECORD",
        ])
          expect(serialized).not.toContain(sensitive);
        return approvedModelResponse(request);
      },
    },
    "Find roofing evidence",
    query,
    { modelId: "synthetic" },
  );
  expect(queries).toHaveLength(2);
  for (const actual of queries) expect(actual).toMatchObject(query);
  expect(answer.answer).toContain(
    "does not establish legal ownership continuity",
  );
  expect(answer.answer).toContain("not continuous open duration");
  expect(
    answer.citations.some((value) =>
      value.startsWith("synthetic-provider-source:"),
    ),
  ).toBe(true);
  expect(
    answer.citations.some((value) => value.startsWith("synthetic-deed-index:")),
  ).toBe(true);
  expect(JSON.stringify(minimizedEvidenceRow(data().rows[0], 0))).not.toContain(
    PRIVATE_PARTY_CANARY,
  );
});
it("empty source-qualified evidence skips the model; invalid issued-to-open and deed-gap positives are refused before dispatch", async () => {
  let calls = 0;
  const provider = {
    converse: async (request: Parameters<typeof approvedModelResponse>[0]) => {
      calls++;
      return approvedModelResponse(request);
    },
  };
  const empty = await answerWithBedrock(
    {
      search: async () => ({ ...data(), rows: [], total: 0 }),
      detail: async () => sourceProperty(),
    },
    provider,
    "Find provider-reported active permits",
    base,
    { modelId: "synthetic" },
  );
  expect(empty.mode).toBe("evidence-empty");
  expect(calls).toBe(0);
  await expect(
    answerWithBedrock(
      { search: async () => data(), detail: async () => sourceProperty() },
      provider,
      "Find provider-reported active permits",
      base,
      { modelId: "synthetic" },
    ),
  ).rejects.toThrow("source predicate");
  await expect(
    answerWithBedrock(
      { search: async () => data(), detail: async () => sourceProperty() },
      provider,
      "Find roofing evidence",
      { ...base, minRecordedDeedGapYears: 20 },
      { modelId: "synthetic" },
    ),
  ).rejects.toThrow("source predicate");
  expect(calls).toBe(0);
});
it("restricted provider rows remain separately marked while official deed evidence stays visible", () => {
  const permit = renderToStaticMarkup(
    <ProviderObservations observations={[providerObservation()]} />,
  );
  expect(permit).toContain(
    'data-private-evidence="provider-permit-observations"',
  );
  expect(permit).toContain(PRIVATE_PARTY_CANARY);
  expect(permit).toContain(PRIVATE_LICENSE_CANARY);
  expect(permit).toContain("current active/open work is not established");
  expect(permit).toContain("contractor role unverified");
  expect(permit).toContain("BBB rating: unavailable");
  expect(
    renderToStaticMarkup(
      <ProviderObservations
        observations={[providerObservation()]}
        municipalKind="other"
      />,
    ),
  ).toContain("Classification disagreement");
  const deed = renderToStaticMarkup(
    <RecordedDeedEvidence observations={[deedObservation()]} />,
  );
  expect(deed).toContain('data-source-evidence="recorded-deed-index"');
  expect(deed).toContain("source verified through 2026-10-19");
  expect(deed).toContain("retrospectively qualified");
  expect(deed).toContain("2016-10-19");
  expect(deed).toContain("ends 9 days before");
  expect(deed).toContain("Prior parcel lineage was not reviewed");
  const filters = renderToStaticMarkup(
    <SourceEvidenceFilters
      query={{ ...base, minRecordedDeedGapYears: 10 }}
      update={() => undefined}
    />,
  );
  expect(filters).toContain('aria-label="Recorded deed gap years"');
  expect(filters).toContain("does not establish uninterrupted ownership");
});

it("classifies only exact provider citations as restricted and keeps official IDs visible", () => {
  const row = sourceProperty();
  const provider = row.permits.flatMap(
    (permit) => permit.sourceObservations ?? [],
  )[0]!;
  const citation = {
    sourceId: provider.provenance.sourceId,
    recordId: provider.providerRecordId,
    digest: provider.provenance.recordDigest,
  };
  expect(isRestrictedProviderCitation(row, citation)).toBe(true);
  expect(
    isRestrictedProviderCitation(row, {
      ...citation,
      recordId: "different-public-record",
    }),
  ).toBe(false);
  expect(
    isRestrictedProviderCitation(row, { ...citation, digest: "0".repeat(64) }),
  ).toBe(false);
  for (const official of propertyEvidence(row).filter(
    (entry) => entry.sourceId !== citation.sourceId,
  ))
    expect(isRestrictedProviderCitation(row, official)).toBe(false);
});
