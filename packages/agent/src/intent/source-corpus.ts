/** Additional preselected 0.5 source-closure cases; the original 36-case quality gate remains distinct. */
export const SOURCE_CLOSURE_CORPUS = [
  {
    id: "source-01",
    prompt: "Find properties with provider status ISSUED",
    expected: "accepted",
    query: { providerPermitStatus: "ISSUED" },
  },
  {
    id: "source-02",
    prompt: "Find provider-reported active permits",
    expected: "accepted",
    query: { permitActivityClaim: "provider_reported_active" },
  },
  {
    id: "source-03",
    prompt: "Find properties with activity not established",
    expected: "accepted",
    query: { permitActivityClaim: "not_established" },
  },
  {
    id: "source-04",
    prompt: "Show open roofing permits older than five years",
    expected: "accepted",
    query: {
      permitStatus: "open",
      permitOpportunityMode: "confirmed_open",
      minPermitObservationAgeYears: 5,
    },
  },
  {
    id: "source-05",
    prompt:
      "Find properties with no observed recorded deed for more than ten years",
    expected: "accepted",
    query: { minRecordedDeedGapYears: 10 },
  },
  {
    id: "source-06",
    prompt:
      "Find properties with provider status ISSUED and permit age since issue at least 1827 days and no observed recorded deed for more than ten years",
    expected: "accepted",
    query: {
      providerPermitStatus: "ISSUED",
      minPermitAgeSinceIssueDays: 1827,
      minRecordedDeedGapYears: 10,
    },
  },
  {
    id: "source-07",
    prompt: "Find properties owned for ten years",
    expected: "refused",
  },
  {
    id: "source-08",
    prompt: "Find properties without provider status ISSUED",
    expected: "refused",
  },
  {
    id: "source-09",
    prompt:
      "Find properties with provider status ISSUED and provider status IN_PROGRESS",
    expected: "refused",
  },
  {
    id: "source-10",
    prompt: "Find properties with permit age since issue at least -1 days",
    expected: "refused",
  },
  {
    id: "source-11",
    prompt:
      "Find properties with no observed recorded deed for more than two hundred and one years",
    expected: "refused",
  },
  {
    id: "source-12",
    prompt: "Find properties with provider-reported continuous open history",
    expected: "refused",
  },
] as const;
