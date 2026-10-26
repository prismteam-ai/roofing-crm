// B-09 review (CR-B-09 findings 16 and 20): every sentence the Ask screen shows about an answer, derived
// from the answer itself — `plan` (place, radius, filters), `counts`, `missing[]`,
// `retryAfterSec`, `resetsAt`, `candidates` — never a hard-coded place, limit or reset time.
// Wording follows the Ask boards: design/prototype/CrmAskNoResults390, CrmAskOutside390,
// CrmAskNotFound390, CrmAskLowConf390, CrmAskThrottled390, CrmAskPaused390 / CrmAgentPaused390,
// CrmAskSlow390 / CrmAgentSlow390/1440, CrmAskCreateFailed390 (all `dc-import` the shared
// Explore1440 board with a `crmask*` / `ai*` preset).
import { DAYS_PER_YEAR } from "@crm/domain";
import { AGENT_TURN_LIMIT_MS, isOutboundConstraint, type AgentAnswer } from "@crm/shared";
import { missingLabel, type MissingReason } from "@crm/oracle-contract";
import { formatUtc, type MissingListGroup } from "@crm/ui";
import {
  fieldLabel,
  permitStatusLabel,
  roofAgeBasisLabel,
  roofAgeConfidenceLabel,
} from "../../format/index.js";

type Plan = AgentAnswer["plan"];
type Outcome = AgentAnswer["outcome"];
type Missing = AgentAnswer["missing"][number];

/** The agent turn's hard stop in whole seconds. The wire does not carry it: it is derived from
 *  `@crm/shared`'s `AGENT_TURN_LIMIT_MS`, the same constant the server's abort timer
 *  (`RUN_AGENT_TIMEOUT_MS`, apps/api/src/agent/runAgent.ts; contracts/agent-api.md step 9)
 *  uses. The only place the web app states the limit. */
export const AGENT_TURN_LIMIT_SEC = AGENT_TURN_LIMIT_MS / 1000;

/** Outcomes whose `plan` came from the model's plan step (and survived the scope gate).
 *  `rate_limited` / `paused` / `timed_out` carry a server placeholder plan (no model call, or an
 *  aborted one), so "How I read this" would describe something the agent never read. */
const PLANNED_OUTCOMES: ReadonlySet<Outcome> = new Set<Outcome>([
  "answered",
  "empty_in_scope",
  "field_not_published",
  "needs_clarification",
  "not_found",
  "out_of_scope",
]);

/** True when `answer.plan` is a real model plan. A `needs_clarification` after an unreadable
 *  plan (the repair call also failed) has no `candidates` field at all; the scope gate's
 *  clarification always sends one (possibly empty) — contracts/agent-api.md step 3/4. */
export function hasModelPlan(answer: AgentAnswer): boolean {
  if (!PLANNED_OUTCOMES.has(answer.outcome)) return false;
  if (answer.outcome === "needs_clarification") return answer.candidates !== undefined;
  return true;
}

/** True for the refusal of a request to message owners: `out_of_scope` with the outbound marker the
 *  server's scope gate writes into `plan.unsupported`. No place is involved, so the screen says
 *  why instead of the place-based "outside the area" message. */
export function isOutboundRefusal(answer: AgentAnswer): boolean {
  return (
    answer.outcome === "out_of_scope" &&
    answer.plan.unsupported.some(
      (u) => u.reason === "out_of_scope" && isOutboundConstraint(u.constraint),
    )
  );
}

/** The place the plan searched: the gazetteer name when resolved, else what the rep typed. */
export function placeOf(plan: Plan): string {
  return plan.area.resolved?.name ?? plan.area.query;
}

function isPermitPlan(plan: Plan): boolean {
  return plan.intent === "find_permits" || plan.intent === "lookup_permit";
}

function joinOr(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

function subjectOf(plan: Plan): string {
  if (isPermitPlan(plan)) {
    const status = plan.filters.statusClass;
    return status !== undefined && status.length > 0
      ? `${joinOr(status)} roofing permits`
      : "roofing permits";
  }
  return plan.filters.kind === undefined ? "properties" : `${plan.filters.kind} properties`;
}

function qualifiersOf(plan: Plan): string[] {
  const f = plan.filters;
  const parts: string[] = [];
  if (f.permitNumber !== undefined) parts.push(`permit # ${f.permitNumber}`);
  // A property question narrowed by a permit condition says so (a permit question already names
  // its status in the subject). "Open" includes stalled, as everywhere else in the product.
  const permitCondition =
    !isPermitPlan(plan) && f.statusClass !== undefined && f.statusClass.length > 0;
  if (permitCondition) {
    const word = f.statusClass?.includes("open")
      ? "an open or stalled permit"
      : `a ${joinOr(f.statusClass ?? [])} permit`;
    parts.push(
      `with ${word}${f.openYearsMin === undefined ? "" : ` open ${f.openYearsMin}+ years`}`,
    );
  } else if (f.openYearsMin !== undefined) {
    parts.push(`open ${f.openYearsMin}+ years`);
  }
  if (f.roofAgeMinYears !== undefined) parts.push(`roof ${f.roofAgeMinYears}+ years old`);
  if (f.roofConfidenceMin !== undefined) parts.push(`roof confidence ${f.roofConfidenceMin}+`);
  if (f.tenureYearsMin !== undefined) parts.push(`same owner ${f.tenureYearsMin}+ years`);
  if (f.ownerAreaClass !== undefined && f.ownerAreaClass.length > 0) {
    parts.push(`owner ${joinOr(f.ownerAreaClass.map((c) => c.replace(/_/g, " ")))}`);
  }
  return parts;
}

function areaOf(plan: Plan): string {
  return plan.area.kind === "county"
    ? `in ${placeOf(plan)}`
    : `within ${plan.area.radiusMi} mi of ${placeOf(plan)}`;
}

/** "How I read this": subject, filters, area — every part from the plan. */
export function planSummary(plan: Plan): string {
  return [subjectOf(plan), ...qualifiersOf(plan), areaOf(plan)].join(", ");
}

/** The empty_in_scope headline: what was searched and found empty. */
export function emptyExplanation(answer: AgentAnswer): string {
  const plan = answer.plan;
  const head = [subjectOf(plan), ...qualifiersOf(plan)].join(", ");
  return `No ${head}, ${areaOf(plan)}.`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Server-counted exclusions (`counts`), each as a sentence with its number. */
export function exclusionNotes(answer: AgentAnswer): string[] {
  const { excludedNoRoofDate, excludedNoCoordinates } = answer.counts;
  const notes: string[] = [];
  if (excludedNoRoofDate > 0) {
    notes.push(
      `${plural(excludedNoRoofDate, "property", "properties")} in the area ` +
        `${excludedNoRoofDate === 1 ? "has" : "have"} no roof date, so the roof-age filter ` +
        `left ${excludedNoRoofDate === 1 ? "it" : "them"} out.`,
    );
  }
  if (excludedNoCoordinates > 0) {
    notes.push(
      `${plural(excludedNoCoordinates, "indexed property", "indexed properties")} ` +
        `${excludedNoCoordinates === 1 ? "has" : "have"} no coordinates, so a radius search ` +
        `can't place ${excludedNoCoordinates === 1 ? "it" : "them"}.`,
    );
  }
  return notes;
}

/** Plan-level `unsupported` reasons that are not in the contract's row-reason list. */
const PLAN_REASON_LABELS: Readonly<Record<string, string>> = {
  no_free_text: "Free text is not published",
};

/** The contract's own label (`missingLabel`, the only source of that wording); a plan-level or
 *  unknown reason never throws or renders blank. */
function reasonLabel(field: string, reason: string): string {
  const planLabel = PLAN_REASON_LABELS[reason];
  if (planLabel !== undefined) return planLabel;
  try {
    return missingLabel(field, reason as MissingReason);
  } catch {
    return `Not available (${reason})`;
  }
}

/** One `missing[]` entry: the field's plain name (never the raw column), the reason's label, and
 *  how many evidence rows carried it. */
export function missingText(missing: Missing): string {
  const count = missing.count === undefined ? "" : ` (${plural(missing.count, "row", "rows")})`;
  return `${fieldLabel(missing.field)}: ${reasonLabel(missing.field, missing.reason)}${count}`;
}

/** `missing[]` as bullets for the shared Missing list: one per distinct reason (and per-row total),
 *  with its fields joined in plain language. Reason wording is the contract's, verbatim; a count
 *  ("25 rows") is kept because here it is a per-row total. */
export function missingGroups(missing: readonly Missing[]): MissingListGroup[] {
  const groups = new Map<
    string,
    { reason: string; code: string; count: string | undefined; fields: string[]; raw: string[] }
  >();
  for (const m of missing) {
    const reason = reasonLabel(m.field, m.reason);
    const count = m.count === undefined ? undefined : plural(m.count, "row", "rows");
    const key = `${m.reason}|${reason}|${count ?? ""}`;
    const group = groups.get(key) ?? { reason, code: m.reason, count, fields: [], raw: [] };
    const label = fieldLabel(m.field);
    const second = label.charAt(1);
    const inline =
      second !== "" && second === second.toUpperCase() && /[A-Z]/.test(second)
        ? label
        : label.charAt(0).toLowerCase() + label.slice(1);
    group.fields.push(inline);
    group.raw.push(m.field);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, g]) => ({
    key,
    reason: g.reason,
    fields: g.fields.join(", "),
    count: g.count,
    data: { reason: g.code, fields: g.raw.join(",") },
  }));
}

type AnswerRowOf = NonNullable<AgentAnswer["rows"]>[number];

/** An answer can carry a property row and a permit row for the same property. The list shows the
 *  permit under its property: a row with no permit is dropped when another row for the same
 *  property carries one (its citation moves to the kept row). Rows for different permits stay. */
export function distinctAnswerRows(rows: readonly AnswerRowOf[] | undefined): AnswerRowOf[] {
  const list = rows ?? [];
  const withPermit = new Set(list.filter((r) => r.permit !== undefined).map((r) => r.propertyCid));
  const bare = new Map(list.filter((r) => r.permit === undefined).map((r) => [r.propertyCid, r]));
  return list
    .filter((r) => r.permit !== undefined || !withPermit.has(r.propertyCid))
    .map((r) => {
      const dropped = r.permit === undefined ? undefined : bare.get(r.propertyCid);
      return dropped === undefined
        ? r
        : {
            ...r,
            ...(r.citationId === undefined && dropped.citationId !== undefined
              ? { citationId: dropped.citationId }
              : {}),
            ...(r.address === undefined && dropped.address !== undefined
              ? { address: dropped.address }
              : {}),
          };
    });
}

/** How many distinct properties the rows stand for (a property row plus its permit row is one). */
export function distinctPropertyCount(rows: readonly AnswerRowOf[] | undefined): number {
  return new Set((rows ?? []).map((r) => r.propertyCid)).size;
}

/** A "near X, N mi" distance is measured from the nearest place, not from a search centre, so a
 *  property lookup (no search centre) never prints it. */
export function answerShowsDistance(answer: AgentAnswer): boolean {
  // `plan` is always on the wire; a partial answer in a test or a stale cache is not fatal.
  return (answer.plan as { intent?: string } | undefined)?.intent !== "lookup_property";
}

/** The real number of matches an answer stands for: the server's total, never fewer than the
 *  distinct properties in the rows. */
export function answerMatchTotal(answer: AgentAnswer): number {
  // `counts` is always present on the wire; a partial answer in a test or a stale cache is not fatal.
  const matched = (answer.counts as { matched?: number } | undefined)?.matched ?? 0;
  return Math.max(matched, distinctPropertyCount(answer.rows));
}

/** "Showing the top 25 of 28,062 matching properties" when the rows are only part of the total. */
export function answerRowsNote(answer: AgentAnswer): string | undefined {
  const shown = distinctAnswerRows(answer.rows).length;
  const total = answerMatchTotal(answer);
  return shown > 0 && total > shown
    ? `Showing the top ${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} matching properties.`
    : undefined;
}

const UNPUBLISHED_REASONS: ReadonlySet<string> = new Set([
  "not_in_export",
  "no_lexicon_carrier",
  "no_free_text",
]);

/** field_not_published: name each field and that Task A does not publish it. */
export function fieldNotPublishedText(answer: AgentAnswer): string {
  const fromMissing = answer.missing
    .filter((m) => UNPUBLISHED_REASONS.has(m.reason))
    .map((m) => m.field);
  const fields = [
    ...new Set(
      fromMissing.length > 0 ? fromMissing : answer.plan.unsupported.map((u) => u.constraint),
    ),
  ];
  if (fields.length === 0) {
    return "Task A's published data (CountyLens) doesn't include what this question filters on. Nothing was searched.";
  }
  return (
    `Task A's published data (CountyLens) doesn't include ${joinOr(fields)}, so I can't filter on ` +
    `${fields.length === 1 ? "it" : "them"}. Nothing was searched.`
  );
}

/** rate_limited: the live countdown from `retryAfterSec`. "Your last answer" is named only when the
 *  screen still shows one under the banner (CrmAskThrottled390: "The answer above … keep working"). */
export function throttleText(secondsLeft: number | undefined, keptAnswer = false): string {
  if (secondsLeft === undefined) {
    return "Wait a moment, then ask again. This answer didn't include the wait time.";
  }
  if (secondsLeft <= 0) return "You can ask again now.";
  const kept = keptAnswer ? "Your last answer, the map" : "The map";
  return `Ask again in ${secondsLeft} s. ${kept} and your leads keep working.`;
}

/** The composer's provenance line (CrmAsk1440 "Signed in · answers cite CountyLens Run 3"): the
 *  run comes from the same promoted-run pointer as the top bar's data chip, never a constant. */
export function composerNote(runId: string | null | undefined): string {
  return runId === null || runId === undefined || runId === ""
    ? "Signed in · answers cite the published CountyLens run"
    : `Signed in · answers cite CountyLens run ${runId}`;
}

/** One example question. `golden` is the id in tests/agent/golden.json whose `prompt` it repeats
 *  verbatim, so every suggestion is wording already run against the live agent. */
export interface AskSuggestion {
  readonly golden: string;
  readonly text: string;
}

export interface AskSuggestionGroup {
  readonly label: string;
  readonly items: readonly AskSuggestion[];
}

/** The composer's "Try one of these" examples (CrmAsk1440 "Suggestions"; the PO's CountyLens Ask
 *  tab reference). Choosing one fills the box, it never asks by itself (every ask spends the cap).
 *
 *  Provenance: all six are the `prompt` of a tested golden query, copied verbatim and only ones that
 *  are single-turn (no "that area"), so they read on their own: G1 and A1 (roofs), A2 (permits),
 *  G4 and A4 (owners), A3 (what is not published: the contractor and BBB rating are honestly
 *  unavailable in this run). test/ask/askSuggestions.test.ts keeps them equal to golden.json. */
export const SUGGESTION_GROUPS: readonly AskSuggestionGroup[] = [
  {
    label: "Roofs",
    items: [
      {
        golden: "G1",
        text: "Which properties in Travis County within five miles of Pflugerville have roofs older than 15 years?",
      },
      {
        golden: "A1",
        text: "Which properties within 3 miles of Austin have roofs older than 20 years?",
      },
    ],
  },
  {
    label: "Permits",
    items: [
      {
        golden: "A2",
        text: "Show me open or stalled roofing permits older than five years within five miles of Austin, sorted by open duration",
      },
    ],
  },
  {
    label: "Owners",
    items: [
      {
        golden: "G4",
        text: "Which homes near Lakeway haven't changed owners in 10+ years and have owners outside the area?",
      },
      {
        golden: "A4",
        text: "Which properties within 2 miles of Austin haven't changed owners in 10 years or more?",
      },
    ],
  },
  {
    label: "What is not published",
    items: [
      {
        golden: "A3",
        text: "Who is the listed contractor on the oldest stalled roofing permit within 2 miles of Austin, and what is their BBB rating?",
      },
    ],
  },
];

/** The same questions as a flat list (the first-visit card and tests read it). */
export const SUGGESTIONS: readonly string[] = SUGGESTION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.text),
);

export interface TimeFormat {
  readonly locale?: string;
  readonly timeZone?: string;
}

/** paused: the reset time from `resetsAt`, in the viewer's local time and in UTC. */
export function pausedText(resetsAt: string | undefined, format: TimeFormat = {}): string {
  const head = "Today's question budget is used up.";
  const tail = "Map, filters and leads keep working.";
  const date = resetsAt === undefined ? undefined : new Date(resetsAt);
  if (resetsAt === undefined || date === undefined || Number.isNaN(date.getTime())) {
    return `${head} This answer didn't include the reset time. ${tail}`;
  }
  const local = date
    .toLocaleString(format.locale, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(format.timeZone === undefined ? {} : { timeZone: format.timeZone }),
    })
    .replace(/\u202f/g, " ");
  const utc = formatUtc(resetsAt).slice(0, 16);
  return `${head} Asking resumes ${local} your time (${utc} UTC). ${tail}`;
}

/** timed_out: the limit from AGENT_TURN_LIMIT_SEC. No claim that "nothing was counted": the
 *  per-minute window is taken before the model is called. */
export function timedOutText(): string {
  return `The answer stopped at the ${AGENT_TURN_LIMIT_SEC} s limit. Your question is kept: try again, or ask something narrower.`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MAX_QUESTION = 500;

/** The follow-up question after the rep picks a candidate place: the typed place replaced by
 *  the chosen name (so the rest of the question, and the thread's plan, carry over). */
export function clarifyQuestion(original: string, plan: Plan, placeName: string): string {
  const typed = plan.area.query.trim();
  const base = original.trim();
  if (typed !== "") {
    const pattern = new RegExp(escapeRegExp(typed), "i");
    if (pattern.test(base)) return base.replace(pattern, placeName).slice(0, MAX_QUESTION);
  }
  return `${base} (place: ${placeName})`.slice(0, MAX_QUESTION);
}

export interface ConfirmErrorCopy {
  readonly text: string;
  readonly status: "error" | "warning" | "info";
  /** False when trying the same click again cannot succeed. */
  readonly retryable: boolean;
}

function errorData(error: unknown): { appCode?: unknown; code?: unknown } {
  if (typeof error !== "object" || error === null) return {};
  const data = (error as { data?: unknown }).data;
  return typeof data === "object" && data !== null ? (data as { appCode?: unknown }) : {};
}

/** `agent.confirmLead`'s typed failures (`data.appCode`, set by the API's errorFormatter). */
export function confirmErrorCopy(error: unknown): ConfirmErrorCopy {
  const { appCode, code } = errorData(error);
  switch (appCode) {
    case "ALREADY_EXISTS":
      return { text: "Already a lead", status: "info", retryable: false };
    case "NOT_PROPOSED":
      return {
        text: "This property wasn't proposed in this conversation, so I can't make it a lead from here. Ask again to get a fresh proposal.",
        status: "error",
        retryable: false,
      };
    case "NO_COORDINATES":
      return {
        text: "This property has no published coordinates, so it can't be made a lead (a lead needs a map location).",
        status: "warning",
        retryable: false,
      };
    case "RATE_LIMITED":
      return {
        text: "Too many lead requests in a short time. Wait a moment, then try again.",
        status: "warning",
        retryable: true,
      };
    default:
      if (code === "NOT_FOUND") {
        return {
          text: "This property isn't in the current run, so nothing was saved.",
          status: "error",
          retryable: false,
        };
      }
      return {
        text: "Couldn't create the lead. Nothing was saved. Try again.",
        status: "error",
        retryable: true,
      };
  }
}

type Row = NonNullable<AgentAnswer["rows"]>[number];
type Citation = AgentAnswer["citations"][number];

const NO_SIGNAL = "No roof or permit signal published";

/** "near Pflugerville · 1.3 mi", only when the server sent the row's nearest place. */
export function rowNearText(row: Row): string | undefined {
  return row.nearPlace === undefined
    ? undefined
    : `near ${row.nearPlace.name} · ${row.nearPlace.distanceMi.toFixed(1)} mi`;
}

/** "Roof 24 yrs · Last reroof permit": the age and its basis, both from the row. */
export function rowRoofText(row: Row): string | undefined {
  if (row.roofAgeYears === undefined) return undefined;
  const age = `Roof ${String(Math.round(row.roofAgeYears))} yrs`;
  return [
    age,
    row.roofAgeBasis === undefined ? null : roofAgeBasisLabel(row.roofAgeBasis),
    row.roofAgeConfidence === undefined
      ? null
      : `${roofAgeConfidenceLabel(row.roofAgeConfidence)} confidence`,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");
}

/** "Stalled · derived: no status in source · open 6.4 yrs", from the row's permit. */
export function rowPermitText(row: Row): string | undefined {
  if (row.permit === undefined) return undefined;
  const status = permitStatusLabel(row.permit.statusClass);
  return row.permit.openDays === undefined
    ? status
    : `${status} · open ${(row.permit.openDays / DAYS_PER_YEAR).toFixed(1)} yrs`;
}

/** The confirmation sheet's "Main signal": the permit when there is one, else the roof. */
export function rowSignal(row: Row | undefined): string {
  if (row === undefined) return NO_SIGNAL;
  if (row.permit !== undefined) {
    const status = row.permit.statusClass === null ? "Status not published" : null;
    const label = status ?? permitStatusLabel(row.permit.statusClass).replace(/ · derived.*$/, "");
    return row.permit.openDays === undefined
      ? label
      : `${label} · open ${(row.permit.openDays / DAYS_PER_YEAR).toFixed(1)} yrs`;
  }
  return rowRoofText(row)?.replace(/ · .*$/, "") ?? NO_SIGNAL;
}

/** Why the Matches tab is empty: the answer had no `rows` at all, or none matched. */
export function matchesEmptyText(rows: readonly Row[] | undefined): string {
  return rows === undefined
    ? "This answer did not include a list of matches. The cited sources are in the Answer tab."
    : "No matches to list for this question.";
}

/** Why some or all cited properties have no map pin; undefined when every one has a pin. */
export function pinsNote(citations: readonly Citation[], pinCount: number): string | undefined {
  // A cited permit stands for its property (it pins at the property's point).
  const cited = new Set(
    citations
      .filter((c) => c.kind === "property" || (c.kind === "permit" && c.propertyCid !== undefined))
      .map((c) => c.propertyCid ?? `citation-${String(c.id)}`),
  );
  const properties = [...cited];
  if (properties.length === 0) return "No map pins: this answer cites no property.";
  const without = properties.length - pinCount;
  if (without <= 0) return undefined;
  if (pinCount === 0) {
    return "No map pins: none of the cited properties has published coordinates.";
  }
  return `${String(without)} of ${String(properties.length)} cited properties ${
    without === 1 ? "has" : "have"
  } no published coordinates, so ${without === 1 ? "it has" : "they have"} no pin.`;
}

// ---- Widen chip (CrmAsk768 "Widen to 10 mi") ----------------------------------------------------

/** The radii a rep can widen through; the last is the plan's 25 mi cap (queryPlan `radiusMi`). */
const RADIUS_STEPS_MI: readonly number[] = [1, 2, 5, 10, 25];

/** "Few" matches: at or below this the chip is offered next to an answer (the board shows it at 4). */
const WIDEN_FEW_MATCHES = 5;

/** The next radius step above `radiusMi`, or undefined at the 25 mi cap. */
export function nextRadius(radiusMi: number): number | undefined {
  return RADIUS_STEPS_MI.find((step) => step > radiusMi);
}

/** The chip is offered only for a radius search (not a county) that found nothing or few, while a
 *  wider radius still exists. */
export function offersWiden(answer: AgentAnswer): boolean {
  if (answer.outcome !== "answered" && answer.outcome !== "empty_in_scope") return false;
  const { area, intent } = answer.plan;
  if (area.kind === "county" || intent === "lookup_permit" || intent === "lookup_property") {
    return false;
  }
  return nextRadius(area.radiusMi) !== undefined && answer.counts.matched <= WIDEN_FEW_MATCHES;
}

/** The follow-up question for "Widen to {n} mi". `agent.ask` takes text only; a structured plan
 *  edit (set `area.radiusMi`) is a deferred API change, so this reruns the model on new text. */
export function widenQuestion(original: string, miles: number): string {
  const suffix = ` (use a radius of ${String(miles)} miles instead)`;
  return `${original.trim().slice(0, MAX_QUESTION - suffix.length)}${suffix}`;
}

// ---- Coverage note (CrmAsk768 yellow note, weaker: no jurisdiction is on the wire) ---------------

/** A note under an answer that carries permits. The answer has no jurisdiction or area list (rows and
 *  citations carry a source URL and CIDs only), so it states what is true: where the permits come
 *  from and that the answer cannot say what they cover. Never names an area. */
export function coverageNote(
  answer: AgentAnswer,
  runId: string | null | undefined,
): string | undefined {
  const hasPermits =
    (answer.rows ?? []).some((r) => r.permit !== undefined) ||
    answer.citations.some((c) => c.kind === "permit");
  if (!hasPermits) return undefined;
  const run =
    runId === null || runId === undefined || runId === ""
      ? "the published CountyLens run"
      : `CountyLens run ${runId}`;
  return (
    `Permits here come only from ${run}, as published. This answer has no jurisdiction list, ` +
    "so it can't say which areas those permits cover."
  );
}
