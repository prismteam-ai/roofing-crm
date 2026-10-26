// AgentAnswer: the agent's response shape (ADR-06 §4, docs/decisions/0000-agent-architecture.md;
// data-model.md "AgentAnswer (existing ADR shape)" — used verbatim, not the shorter outcome enum
// an earlier design consult sketched). Every claim must carry at least one citationId, and every
// citationId must resolve against this turn's own tool-call results before the answer leaves the
// server (services/agent/verifyCitations.ts, Phase 4) — a claim whose citation doesn't resolve is
// dropped before the answer is returned, never shown unverified. `counts` fields are always
// server-computed, never copied from model text.
import { z } from "zod";
import { QueryPlan } from "./queryPlan.js";

const NearPlace = z.object({ name: z.string(), distanceMi: z.number().nonnegative() });
const MissingEntry = z.object({
  field: z.string(),
  reason: z.string(),
  count: z.number().int().nonnegative().optional(),
});

// Ask in the map (AI mode): one row the compose step saw, built server-side from the dispatch row
// (never from model text). `lat`/`lon` are absent when the row has no coordinates, and the reason
// is then in `missing`. `citationId` is set when a kept claim cites this row.
export const AnswerRow = z.object({
  propertyCid: z.string(),
  tcadId: z.string(),
  // The situs as TCAD prints it, when the index carries it (additive; never the owner).
  address: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  nearPlace: NearPlace.optional(),
  citationId: z.number().int().optional(),
  roofAgeYears: z.number().optional(),
  roofAgeBasis: z.enum(["permit", "new_construction", "built_year", "unknown"]).optional(),
  roofAgeConfidence: z.enum(["high", "medium", "low", "none"]).optional(),
  permit: z
    .object({
      permitCid: z.string(),
      number: z.string().nullable(),
      statusClass: z.string().nullable(),
      openDays: z.number().optional(),
    })
    .optional(),
  contractorResolution: z.string().optional(),
  missing: z.array(MissingEntry),
});
export type AnswerRow = z.infer<typeof AnswerRow>;

/** A numbered pin on the map: `n` is the citation number the answer shows. */
export type AnswerPin = { n: number; propertyCid: string; lat: number; lon: number };

export const AgentAnswer = z.object({
  outcome: z.enum([
    "answered",
    "empty_in_scope",
    "out_of_scope",
    "not_found",
    "needs_clarification",
    "field_not_published",
    "timed_out",
    "rate_limited",
    "paused",
  ]),
  claims: z.array(
    z.object({
      text: z.string().max(400),
      citationIds: z.array(z.number().int()).min(1),
    }),
  ),
  citations: z.array(
    z.object({
      id: z.number().int(),
      kind: z.enum(["property", "permit", "run", "place"]),
      tcadId: z.string().optional(),
      propertyCid: z.string().optional(),
      permitCid: z.string().optional(),
      sourceUrl: z.string().nullable(),
      capturedAt: z.string(),
      tableCid: z.string(),
      manifestCid: z.string(),
      asOf: z.string(),
      // Built server-side from the dispatch rows, never from model text: a property citation
      // carries the cited row's point, a permit citation its property's, a place citation the
      // resolved point. `nearPlace` is the nearest gazetteer place ("near Pflugerville").
      lat: z.number().optional(),
      lon: z.number().optional(),
      nearPlace: NearPlace.optional(),
    }),
  ),
  plan: QueryPlan, // "How I read this"
  resultSetId: z.string(), // the UI pages the full rows from here, never from model text
  counts: z.object({
    matched: z.number(),
    shown: z.number(),
    excludedNoCoordinates: z.number(),
    excludedNoRoofDate: z.number(),
    truncated: z.boolean(),
  }),
  // `reason` is one of the contract's closed lists: `@crm/oracle-contract`'s MISSING_REASONS for a
  // row's own missing field, or `QueryPlan.unsupported[].reason` for a constraint the question
  // asked for. B-09 review (CR finding 10): `count` (optional, additive) is how many evidence rows
  // this turn carried that reason for that field; absent for a plan-level `unsupported` entry.
  missing: z.array(MissingEntry),
  // Up to 25 rows, the same ones the compose step saw (Matches tab). Optional and additive.
  rows: z.array(AnswerRow).max(25).optional(),
  // B-09 review (CR finding 7): set on `needs_clarification` (and on a `not_found` place, as the
  // closest known places to offer) — the resolver's top places
  // (best first, at most 3) so the Ask screen can offer them as choices. `match` is the
  // `QueryPlan.area.resolved.match` kind. Optional and additive.
  candidates: z
    .array(
      z.object({
        name: z.string(),
        score: z.number().min(0).max(1),
        match: z.enum(["exact", "alias", "fuzzy", "zip", "user_point"]),
      }),
    )
    .optional(),
  // B-09 review (CR finding 3): budget outcomes are typed answers the Ask screen keys on, with the
  // hint it needs. Optional and additive: set only on `rate_limited` (whole seconds until the
  // next per-minute window) and `paused` (ISO time the daily cap resets, next 00:00 UTC).
  retryAfterSec: z.number().int().nonnegative().optional(),
  resetsAt: z.string().optional(),
  proposals: z
    .array(
      z.object({
        tcadId: z.string(),
        alreadyLead: z.boolean(),
        leadId: z.string().optional(),
      }),
    )
    .optional(),
  trace: z.object({
    traceId: z.string(),
    modelId: z.string(),
    promptVersion: z.string(),
    rankVersion: z.string(),
    toolSteps: z.number(),
    modelCalls: z.number(),
    // T045 (B-09, Phase 5/US2; ADR-06 §6.1: "Put `cacheStrategy` in the trace metadata. Log
    // cache read/write tokens."). Optional and additive — a deploy/build predating this story's
    // prompt-caching work, or an answer built on the Gateway path (no cache-point control there),
    // simply omits these rather than failing validation.
    cacheStrategy: z.string().optional(),
    cacheReadTokens: z.number().optional(),
    cacheWriteTokens: z.number().optional(),
    // GAP-2: what the server repaired in the model's plan from the question text (a place or ZIP
    // taken from the gazetteer scan, a stated radius). Absent when nothing was repaired.
    planRepairs: z.array(z.string()).optional(),
  }),
});
export type AgentAnswer = z.infer<typeof AgentAnswer>;

/** One pin per cited property that has coordinates; `n` is the citation number. A permit
 *  citation pins at its property's point when it carries one (a permit-only answer still shows
 *  where its permits are); a property already pinned by an earlier citation gets no second pin.
 *  Sorted by `n`. */
export function answerPins(answer: Pick<AgentAnswer, "citations">): AnswerPin[] {
  const pins: AnswerPin[] = [];
  const seen = new Set<number>();
  const pinned = new Set<string>();
  const ordered = [...answer.citations].sort((a, b) => a.id - b.id);
  for (const c of ordered) {
    if ((c.kind !== "property" && c.kind !== "permit") || c.propertyCid === undefined) continue;
    if (c.lat === undefined || c.lon === undefined || seen.has(c.id)) continue;
    if (pinned.has(c.propertyCid)) continue;
    seen.add(c.id);
    pinned.add(c.propertyCid);
    pins.push({ n: c.id, propertyCid: c.propertyCid, lat: c.lat, lon: c.lon });
  }
  return pins;
}
