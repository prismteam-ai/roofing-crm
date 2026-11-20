/**
 * Recorded-shape answers of POST /agent/answer for the mocked tests (unit and Playwright). The shape follows the
 * agent's AgentAnswer plus `signature` (src/agent-types.ts AnswerResponse, as the pipeline's agent API returns it); the texts are written for the
 * tests. Each answer cites at most three records; every signature is a dummy (the server's MAC is never needed:
 * the mocks do not verify it). No token or key appears here.
 */
import type { AnswerResponse } from "../src/agent-types.ts";

export const DUMMY_SIGNATURE_1 = "dummy-signature-1-for-tests-only-not-a-mac";
export const DUMMY_SIGNATURE_2 = "dummy-signature-2-for-tests-only-not-a-mac";

/** The standing gaps as an answer states them on a run whose contractor window is read. */
export const STANDING_GAPS = [
  "Permits cover the City of Los Angeles only (LADBS); parcels elsewhere in the county have no permit data.",
  "No contractor license data after May 2023.",
  "The contractor rows (LADBS roofing permits, contractor view (data.lacity.org 8guu-8f5m)) cover permits issued 2013-01-02 to 2023-05-19 (by permit_issue_date).",
  "BBB ratings are not available.",
  "No owner data: owner names and contact details are neither collected nor served.",
  "Permit descriptions are not read or returned.",
];

const ROLL = "LA County Assessor - Assessor Parcel Data Roll 2026";
const LADBS = "LADBS building permits (City of Los Angeles, data.lacity.org)";
const LADBS_LICENSE =
  "none stated in the dataset metadata; the portal's terms of use (May 2014) apply";
const LADBS_ATTRIBUTION =
  "LADBS (City of Los Angeles Department of Building and Safety)";
const CONTRACTORS =
  "LADBS roofing permits, contractor view (data.lacity.org 8guu-8f5m)";

const usage = {
  input_tokens: 1000,
  output_tokens: 100,
  model_calls: 2,
  tool_calls: 1,
};

export const QUESTION_1 =
  "Which properties within five miles of Van Nuys have roofs older than 15 years?";
/** The parcel cited in ANSWERED's Sources (a parcel the hosted data API serves, near Van Nuys). */
export const CITED_PARCEL = "2218022020";
export const QUESTION_2 = "Which of those have open roofing permits?";

export const ANSWERED: AnswerResponse = {
  status: "answered",
  text: [
    "**115,373 parcels within 5 miles of Van Nuys have roofs older than 15 years.** The nearest two:",
    "",
    "| Parcel ID | Roof year | Basis |",
    "|---|---|---|",
    "| 2218022020 | 2002 | PERMIT |",
    "| 2218022039 | 2006 | PROXY |",
    "",
    "Parcel 2218099999 was mentioned in an earlier answer.",
  ].join("\n"),
  reasoning:
    "Resolved 'Van Nuys' (postal city) to the median center 34.20155, -118.45361 of 456 parcels; searched parcels within 5 mi built before 2011.",
  assumptions: [
    "Roof age counts from the effective roof year: a finaled roofing permit's year where the basis is PERMIT, else the assessor year-built proxy.",
  ],
  records: [
    {
      kind: "parcel",
      id: "2218022020",
      source_name: ROLL,
      collected_at: "2026-11-12T00:26:18.151Z",
    },
    {
      kind: "permit",
      id: "01016-10000-01043",
      source_name: LADBS,
      license: LADBS_LICENSE,
      attribution: LADBS_ATTRIBUTION,
      collected_at: "2026-11-12T13:10:47.174Z to 2026-11-12T13:14:48.715Z",
    },
    {
      kind: "contractor",
      id: "01016-10000-01043",
      source_name: CONTRACTORS,
      license: "CC BY 4.0",
      attribution: LADBS_ATTRIBUTION,
      collected_at: "2026-11-12T13:20:00.000Z",
    },
  ],
  gaps: [
    ...STANDING_GAPS,
    "Results truncated: search_aged_roofs returned 10 of 115373 matching parcels (nearest first).",
    "Unverified ID in the answer: 2218099999 was not returned by any tool in this answer; treat it as unconfirmed.",
  ],
  unverified_ids: ["2218099999"],
  usage,
  elapsed_ms: 18_000,
  markdown: "(not used by the CRM)",
  history: [
    { role: "user", content: QUESTION_1 },
    { role: "assistant", content: "Answer 1 (test history)." },
  ],
  session: {
    area: {
      label: "Van Nuys",
      lat: 34.20155,
      lon: -118.45361,
      radius_miles: 5,
      basis: "postal_city",
    },
  },
  signature: DUMMY_SIGNATURE_1,
};

export const FOLLOW_UP: AnswerResponse = {
  ...ANSWERED,
  text: "**2 of them have long-open roofing permits.**",
  records: [ANSWERED.records[1]!],
  gaps: [...STANDING_GAPS],
  unverified_ids: [],
  history: [
    ...ANSWERED.history,
    { role: "user", content: QUESTION_2 },
    { role: "assistant", content: "Answer 2 (test history)." },
  ],
  signature: DUMMY_SIGNATURE_2,
};

export const REFUSED: AnswerResponse = {
  status: "refused",
  refused_by: "people_guard",
  text: "I can't help with information about people: owner names, residents and contact details are neither collected nor served.",
  reasoning:
    "Refused before any model call: the question asks about people, and owner or resident data is neither collected nor served.",
  assumptions: [],
  records: [],
  gaps: [...STANDING_GAPS],
  unverified_ids: [],
  usage: { input_tokens: 0, output_tokens: 0, model_calls: 0, tool_calls: 0 },
  elapsed_ms: 2,
  markdown: "(not used by the CRM)",
  history: [],
  session: {},
  signature: DUMMY_SIGNATURE_1,
};

export const STOPPED: AnswerResponse = {
  status: "stopped",
  stopped_by: "time_budget",
  text: "The time budget ran out before the answer was complete.",
  reasoning: "No tool was called. The answer stopped early (time_budget).",
  assumptions: [],
  records: [],
  gaps: [...STANDING_GAPS],
  unverified_ids: [],
  usage: { ...usage, tool_calls: 0 },
  elapsed_ms: 25_000,
  markdown: "(not used by the CRM)",
  history: [{ role: "user", content: QUESTION_1 }],
  session: {},
  signature: DUMMY_SIGNATURE_2,
};
