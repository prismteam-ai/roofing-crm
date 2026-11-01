import { SourceCitationList } from "../apps/crm-web/src/SourceCitationList";
import { AgentPermitSections } from "../apps/crm-web/src/AgentPermitSections";
import type { AgentAnswer } from "../packages/agent/src/index";
import { PropertySchema } from "../packages/contracts/src/index";
import { nonemptyEvidenceProperty } from "./support/evidence-fixture";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuerySchema, type QueryInput } from "../packages/contracts/src/index";
import {
  queryFromUrl,
  queryToUrl,
  queryForPlace,
  updateQueryContext,
} from "../packages/map-domain/src/index";
import { officialPlaceResolver } from "../packages/places/src/index";
import {
  permitModeChange,
  PermitOpportunityControls,
} from "../apps/crm-web/src/PermitOpportunityControls";
import { PermitOpportunitySummary } from "../apps/crm-web/src/PermitOpportunitySummary";
import {
  sourceProperty,
  SOURCE_SNAPSHOT,
  PRIVATE_PARTY_CANARY,
} from "./support/source-observations";

const base: QueryInput = {
  snapshotId: SOURCE_SNAPSHOT,
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
  limit: 50,
};
it("round-trips the primary verification lane without converting its calendar age into open duration", () => {
  const q = QuerySchema.parse({
    ...base,
    permitOpportunityMode: "status_verification_needed",
    minPermitObservationAgeYears: 5,
    sort: "permit_issue_age_desc",
  });
  expect(queryFromUrl(queryToUrl(q), SOURCE_SNAPSHOT)).toEqual(q);
  expect(q.minOpenDays).toBe(0);
  expect(q.minPermitAgeSinceIssueDays).toBeUndefined();
  expect(
    queryFromUrl(queryToUrl(base), SOURCE_SNAPSHOT).permitOpportunityMode,
  ).toBeUndefined();
});
it("switching from a long-open advanced query to verification removes stale incompatible constraints", () => {
  const old = {
    ...base,
    permitStatus: "open" as const,
    minOpenDays: 4000,
    providerPermitStatus: "IN_PROGRESS" as const,
    permitActivityClaim: "provider_reported_active" as const,
    minPermitAgeSinceIssueDays: 3653,
    cursor: "old-page",
  };
  const next = QuerySchema.parse({
    ...old,
    ...permitModeChange(old, "status_verification_needed"),
  });
  expect(next.permitStatus).toBe("any");
  expect(next.minOpenDays).toBe(0);
  expect(next.permitOpportunityMode).toBe("status_verification_needed");
  expect(next.minPermitObservationAgeYears).toBe(5);
  expect(next.providerPermitStatus).toBeUndefined();
  expect(next.permitActivityClaim).toBeUndefined();
  expect(next.cursor).toBeUndefined();
});
it("keeps a no-permit-filter default and exposes the five qualified choices as primary controls", () => {
  const html = renderToStaticMarkup(
    <PermitOpportunityControls query={base} update={() => undefined} />,
  );
  for (const label of [
    "No permit filter",
    "Any roofing permit",
    "Confirmed open / active",
    "Status verification needed",
    "Confirmed closed / final",
    "Lifecycle unknown",
  ])
    expect(html).toContain(label);
  expect(html).toContain('value="none" selected');
  const selected = renderToStaticMarkup(
    <PermitOpportunityControls
      query={{ ...base, permitOpportunityMode: "status_verification_needed" }}
      update={() => undefined}
    />,
  );
  expect(selected).toContain("not time continuously open");
});
it("shows source-qualified derived facts without inventing an open status, and preserves provider-specific capture boundaries", () => {
  const property = sourceProperty();
  const html = renderToStaticMarkup(
    <PermitOpportunitySummary
      property={property}
      query={{
        ...base,
        permitOpportunityMode: "status_verification_needed",
        minPermitObservationAgeYears: 5,
      }}
      detailed
    />,
  );
  expect(html).toContain("Status verification needed");
  expect(html).toContain("2016-10-28");
  expect(html).toContain("since issue");
  expect(html).toContain("ISSUED (provider normalized)");
  expect(html).toContain("provider-derived-permit");
  expect(html).toContain(PRIVATE_PARTY_CANARY);
  expect(html).toContain("contractor role not independently established");
  expect(html).not.toContain("years open");
  expect(html).not.toContain("Confirmed open / active");
});
it("uses the same source-verified municipality identity as the agent and invalidates it on a manual pin move", () => {
  const place = officialPlaceResolver.resolve("City of Troy");
  expect(place.status).toBe("resolved");
  if (place.status !== "resolved")
    throw new Error("Missing original official Troy place");
  const q = queryForPlace({ ...base, cursor: "old-page" }, place.place.placeId);
  expect(q).toMatchObject({
    ...place.place.center,
    placeId: place.place.placeId,
    placeIndexDigest: place.place.indexDigest,
  });
  expect(q.cursor).toBeUndefined();
  expect(queryFromUrl(queryToUrl(q), SOURCE_SNAPSHOT)).toMatchObject(q);
  expect(updateQueryContext(q, { lng: q.lng + 0.01 }).placeId).toBeUndefined();
  expect(() => queryForPlace(base, "not-an-admitted-place")).toThrow();
});

it.each(["confirmed_closed", "lifecycle_unknown", undefined] as const)(
  "leaving strict open for %s clears the stale open-duration sort",
  (mode) => {
    const next = permitModeChange(
      {
        ...base,
        permitOpportunityMode: "confirmed_open",
        sort: "permit_open_days_desc",
      },
      mode,
    );
    expect(next.sort).toBeUndefined();
    expect(next.minOpenDays).toBe(0);
  },
);
function nativeProperty() {
  return PropertySchema.parse({
    ...nonemptyEvidenceProperty,
    id: "SYN-NATIVE-UI",
    permits: [
      {
        id: "SYN-NATIVE-PERMIT",
        kind: "roof_replacement",
        issuedAt: "2010-01-01",
        status: "unknown",
        statusBasis: "issued_only",
        openedAt: null,
        closedAt: null,
        contractor: {
          reportedName: "Synthetic applicant",
          verifiedCompanyId: null,
          license: null,
          rating: null,
        },
        provenance: [
          {
            sourceId: "synthetic-official-permit",
            recordId: "SYN-NATIVE-PERMIT",
            digest: "synthetic",
            observedAt: "2026-10-28T00:00:00Z",
            kind: "synthetic",
          },
        ],
      },
    ],
  });
}
it("tags only the actual provider citation while preserving an official citation in the same response", () => {
  const provider = sourceProperty();
  const observation = provider.permits[0].sourceObservations![0];
  const privateCitation = `${observation.provenance.sourceId}:${observation.providerRecordId}`;
  const officialCitation = "synthetic-official-permit:SYN-NATIVE-PERMIT";
  const html = renderToStaticMarkup(
    <SourceCitationList
      properties={[nativeProperty(), provider]}
      citations={[officialCitation, privateCitation]}
    />,
  );
  expect(html).toContain(`<span>${officialCitation}</span>`);
  expect(html).toContain('data-private-evidence="provider-derived-citation"');
  expect(html).toContain(privateCitation);
  expect(html).not.toContain(
    'data-private-evidence="provider-derived-citation">' + officialCitation,
  );
});
it("separates returned page count from the four displayed agent previews", () => {
  const query = {
    ...base,
    permitOpportunityMode: "status_verification_needed" as const,
    minPermitObservationAgeYears: 5,
  };
  const results = Array.from({ length: 5 }, (_, i) => ({
    ...nativeProperty(),
    id: `SYN-UI-${i}`,
    distanceMeters: i,
  }));
  const answer: AgentAnswer = {
    mode: "deterministic-offline",
    answer: "Source-qualified alternatives",
    query: { ...query, permitOpportunityMode: "confirmed_open" },
    results: [],
    citations: [],
    caveats: [],
    toolTrace: [],
    sourceQualifiedAlternativeSections: true,
    permitSections: [
      {
        kind: "status_verification_needed",
        label: "Status verification needed",
        query,
        queryHash: "synthetic-preview",
        total: 5,
        returnedCount: 5,
        truncated: false,
        nextCursor: null,
        results,
        citations: [],
        caveats: ["Synthetic UI test only"],
      },
    ],
  };
  const html = renderToStaticMarkup(
    <AgentPermitSections
      answer={answer}
      choose={() => undefined}
      apply={() => undefined}
    />,
  );
  const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  expect(text).toContain("5 returned · 4 previewed");
  expect(text).not.toContain("5 shown");
});

it.each([
  "?permitMode=not-a-real-mode",
  "?permitMode=status_verification_needed&permitAgeYears=-1",
  "?permitAgeYears=5",
  "?sort=permit_issue_age_desc",
])(
  "never silently broadens invalid new permit URL constraints: %s",
  (search) => {
    expect(() => queryFromUrl(search, SOURCE_SNAPSHOT)).toThrow(
      "No search was run",
    );
  },
);
