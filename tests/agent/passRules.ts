// B-09 golden-query pass rules, as pure functions so they are unit-tested without the deployed
// agent (golden.test.ts, always-on block). A rule here may be tightened; it must never be loosened
// to let a wrong, ungrounded or fabricated answer through. The assessment's prompts (golden.json
// G1-G7) are fixed; what changed for Run 2 is what the data can support, so a query whose answer
// is genuinely empty (for example no property near Pflugerville has a published roof age) passes
// as an HONEST EMPTY only when the answer carries zero claims, zero citations and zero rows,
// counts.matched is 0, and the reason is stated in structured fields (counts / missing /
// plan.unsupported), never invented.

export type ExpectedOutcome =
  | "answered"
  | "answered_or_honest_empty"
  | "answered_or_field_flagged"
  | "answered_unavailable"
  | "out_of_scope_or_empty"
  | "lead_created"
  | "answered_owner_filtered"
  | "answered_unavailable_or_refused"
  | "answered_or_clarifies"
  | "refused_outbound";

export interface QuerySpec {
  readonly id: string;
  readonly expectedOutcome: ExpectedOutcome | string;
  readonly contractorMustBeUnavailable?: boolean;
  readonly expectedPermitCid?: string;
  readonly expectedMatchedPermitNumbers?: readonly string[];
  /** Regex the resolved area name must match (an honest empty about the WRONG place is wrong). */
  readonly expectedAreaPattern?: string;
  /** Run 3.1: the index's own count for the query as worded; `counts.matched` must equal one of
   *  these when the answer is `answered` (several only where the wording has two honest readings,
   *  for example "outside the area" as out_of_area alone or out_of_area plus regional). */
  readonly expectedMatchedCounts?: readonly number[];
  /** Run 3.1: the permit that must come first in a permit answer (longest open first). */
  readonly expectedTopPermitNumber?: string;
  /** The contractor name may be stated (Run 3.1 prints 4,552 of them, unverified) but never a BBB
   *  rating: no rating exists, BBB blocks the lookup. */
  readonly bbbRatingMustBeUnavailable?: boolean;
  /** Regexes (case-insensitive) that must not appear in any claim: injected text echoed back,
   *  prompt text leaked, an owner name. */
  readonly forbiddenClaimPatterns?: readonly string[];
  /** Run 3.1 roof ages are mostly the year built (low confidence): an answer whose rows rest on
   *  it must say so in a claim. */
  readonly roofBasisMustBeDisclosed?: boolean;
  /** "Open" includes stalled (a stalled permit is open and not progressing): when a cited permit
   *  row is stalled, a claim must say "stalled" so a rep reading "open permits" is told the status. */
  readonly stalledMustBeDisclosed?: boolean;
  /** A misspelled place may be asked about instead of guessed: the candidates must then name it. */
  readonly candidatesMustMatch?: string;
}

export interface AnswerLike {
  readonly outcome: string;
  readonly claims: readonly { text: string; citationIds: readonly number[] }[];
  readonly citations: readonly {
    id: number;
    kind: string;
    propertyCid?: string | undefined;
    permitCid?: string | undefined;
    manifestCid: string;
  }[];
  readonly plan: {
    readonly intent: string;
    readonly area: {
      readonly radiusMi: number;
      readonly kind?: string;
      readonly resolved?: { readonly name: string } | undefined;
    };
    readonly filters: {
      readonly ownerAreaClass?: readonly string[] | undefined;
      readonly tenureYearsMin?: number | undefined;
      readonly roofAgeMinYears?: number | undefined;
      readonly openYearsMin?: number | undefined;
      readonly statusClass?: readonly string[] | undefined;
    };
    readonly unsupported: readonly { constraint: string; reason: string }[];
  };
  readonly counts: {
    readonly matched: number;
    readonly shown: number;
    readonly excludedNoCoordinates: number;
    readonly excludedNoRoofDate: number;
  };
  readonly missing: readonly { field: string; reason: string; count?: number | undefined }[];
  readonly candidates?: readonly { name: string; score: number }[] | undefined;
  readonly rows?:
    | readonly {
        propertyCid: string;
        roofAgeBasis?: string | undefined;
        contractorResolution?: string | undefined;
        permit?:
          | {
              permitCid: string;
              number: string | null;
              statusClass: string | null;
              openDays?: number | undefined;
            }
          | undefined;
      }[]
    | undefined;
}

export interface RuleContext {
  readonly manifestCid: string;
  /** Per-cited-row verification against the live index (property.get), done by the harness. */
  readonly verification: { readonly checked: number; readonly verified: number };
}

export interface RuleResult {
  readonly pass: boolean;
  readonly mode: "answered" | "honest_empty" | "field_flagged" | "unavailable" | "refused" | "fail";
  readonly failures: readonly string[];
}

const HONEST_EMPTY_OUTCOMES = ["empty_in_scope", "field_not_published"];
const CONTRACTOR_OR_BBB = /contractor|bbb|company/i;

function result(mode: RuleResult["mode"], failures: string[]): RuleResult {
  return { pass: failures.length === 0, mode: failures.length === 0 ? mode : "fail", failures };
}

/** Checks shared by every answered or empty answer (checks.md section 7.2 steps 2 and 4). */
export function sharedChecks(answer: AnswerLike, ctx: RuleContext): string[] {
  const failures: string[] = [];
  for (const c of answer.citations) {
    if (c.manifestCid !== ctx.manifestCid)
      failures.push(`citation ${c.id} is not on the pinned manifest`);
  }
  for (const claim of answer.claims) {
    if (claim.citationIds.length === 0) failures.push("a claim has no citation");
    for (const id of claim.citationIds) {
      if (!answer.citations.some((c) => c.id === id))
        failures.push(`claim cites unknown citation ${id}`);
    }
  }
  if (!(answer.plan.area.radiusMi > 0)) failures.push("the plan states no radius");
  for (const m of answer.missing) {
    if (m.reason.trim() === "") failures.push(`missing field ${m.field} has no reason`);
  }
  if (ctx.verification.verified < ctx.verification.checked) {
    failures.push(
      `${ctx.verification.checked - ctx.verification.verified} of ${ctx.verification.checked} cited rows did not verify against the index`,
    );
  }
  return failures;
}

/** An honest empty: nothing invented, and the reason is in structured fields. */
export function honestEmptyFailures(answer: AnswerLike): string[] {
  const failures: string[] = [];
  if (!HONEST_EMPTY_OUTCOMES.includes(answer.outcome)) {
    failures.push(`outcome ${answer.outcome} is not an honest empty`);
    return failures;
  }
  if (answer.claims.length > 0) failures.push("an empty answer carries claims");
  if (answer.citations.length > 0) failures.push("an empty answer carries citations");
  if ((answer.rows?.length ?? 0) > 0) failures.push("an empty answer carries rows");
  if (answer.counts.matched !== 0) failures.push("an empty answer reports matched > 0");
  // Only a reason that explains the emptiness counts: a generic missing entry (for example
  // "coordinates") is attached to nearly every answer and explains nothing.
  const f = answer.plan.filters;
  const stated =
    answer.outcome === "field_not_published"
      ? answer.plan.unsupported.length > 0
      : answer.counts.excludedNoRoofDate > 0 ||
        answer.plan.unsupported.length > 0 ||
        f.statusClass !== undefined ||
        f.openYearsMin !== undefined ||
        f.roofAgeMinYears !== undefined;
  if (!stated) failures.push("an empty answer states no count or reason for the emptiness");
  return failures;
}

function claimsText(answer: AnswerLike): string {
  return answer.claims.map((c) => c.text).join(" \n ");
}

const BBB_RATING =
  /\bBBB\b[^.\n]{0,40}\b(rating|rated|grade)\b[^.\n]{0,30}\b(is|of|:)\s*[A-F][+-]?\b/i;
const BBB_RATING_ALT = /\b(rated|rating of|accredited)\s+[A-F][+-]?\b(?!\w)/i;

/** A BBB rating stated as fact (the contractor name is checked separately). */
export function assertsBbbRating(text: string): boolean {
  return BBB_RATING.test(text) || BBB_RATING_ALT.test(text);
}

/** A contractor or BBB value stated as fact. "not available" wording is fine; a rating letter or
 *  a company-style name next to the word contractor is not. */
export function assertsContractorOrBbb(text: string): boolean {
  const rating =
    /\bBBB\b[^.\n]{0,40}\b(rating|rated|grade)\b[^.\n]{0,30}\b(is|of|:)\s*[A-F][+-]?\b/i;
  const ratingAlt = /\b(rated|rating of|accredited)\s+[A-F][+-]?\b(?!\w)/i;
  const company =
    /\bcontractor\b[^.\n]{0,30}\b(is|was|:)\s+(?!not\b|unknown\b|unresolved\b|unavailable\b)[A-Z][\w&.'-]*(\s+[A-Z][\w&.'-]*){0,4}\s+(LLC|Inc\.?|Co\.?|Corp\.?|Roofing|Construction|Builders)\b/;
  return rating.test(text) || ratingAlt.test(text) || company.test(text);
}

/** True when the answer states, in structured fields, that owner location is not published. */
export function ownerLocationFlagged(answer: AnswerLike): boolean {
  return (
    answer.plan.unsupported.some((u) => /owner|outside|area/i.test(u.constraint)) ||
    answer.missing.some((m) => /owner/i.test(m.field) && m.reason.trim() !== "")
  );
}

function contractorFlagged(answer: AnswerLike): boolean {
  return answer.missing.some((m) => CONTRACTOR_OR_BBB.test(m.field) && m.reason.trim() !== "");
}

function permitRowFailures(answer: AnswerLike, query: QuerySpec): string[] {
  const failures: string[] = [];
  const wanted = answer.plan.filters.statusClass;
  const minDays =
    answer.plan.filters.openYearsMin === undefined
      ? undefined
      : answer.plan.filters.openYearsMin * 365;
  const rows = (answer.rows ?? []).filter((r) => r.permit !== undefined);
  let previous = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const p = row.permit as NonNullable<typeof row.permit>;
    // "Open" includes stalled, as in the agent's withStalledWhenOpen: a stalled row under a filter
    // that includes open is in scope; under a closed-only (or other) filter it still fails.
    const accepted =
      wanted === undefined ||
      wanted.length === 0 ||
      wanted.includes(p.statusClass ?? "") ||
      (p.statusClass === "stalled" && wanted.includes("open"));
    if (!accepted) {
      failures.push(
        `permit ${p.number ?? p.permitCid} is ${p.statusClass}, outside the stated status filter`,
      );
    }
    if (minDays !== undefined && (p.openDays ?? 0) < minDays) {
      failures.push(
        `permit ${p.number ?? p.permitCid} is open ${p.openDays} days, below the stated threshold`,
      );
    }
    if (p.openDays !== undefined) {
      if (p.openDays > previous)
        failures.push("permits are not sorted by open duration, longest first");
      previous = p.openDays;
    }
  }
  if (query.expectedMatchedPermitNumbers !== undefined && answer.outcome === "answered") {
    const got = rows.map((r) => r.permit?.number).filter((n): n is string => typeof n === "string");
    for (const n of query.expectedMatchedPermitNumbers) {
      if (!got.includes(n)) failures.push(`expected permit ${n} is not in the answer`);
    }
    if (answer.counts.matched !== query.expectedMatchedPermitNumbers.length) {
      failures.push(
        `counts.matched ${answer.counts.matched} differs from the ${query.expectedMatchedPermitNumbers.length} permit(s) Run 2 holds`,
      );
    }
  }
  return failures;
}

/** Evaluate one non-G7 golden query. G7 (propose then confirm) is checked by runG7LeadRoundTrip. */
export function evaluateQuery(query: QuerySpec, answer: AnswerLike, ctx: RuleContext): RuleResult {
  const failures = sharedChecks(answer, ctx);
  const text = claimsText(answer);
  if (query.contractorMustBeUnavailable === true && assertsContractorOrBbb(text)) {
    failures.push("the answer states a contractor or BBB value; Run 2 has none");
  }
  if (query.bbbRatingMustBeUnavailable === true && assertsBbbRating(text)) {
    failures.push("the answer states a BBB rating; none exists in this run");
  }
  for (const pattern of query.forbiddenClaimPatterns ?? []) {
    if (new RegExp(pattern, "i").test(text)) {
      failures.push(`a claim matches the forbidden pattern /${pattern}/`);
    }
  }
  if (
    query.roofBasisMustBeDisclosed === true &&
    answer.outcome === "answered" &&
    (answer.rows ?? []).some((r) => r.roofAgeBasis === "built_year") &&
    !/year[- ]built|built[- ]year|built in|estimated|low confidence/i.test(text)
  ) {
    failures.push("rows rest on the year built but no claim says the roof age is an estimate");
  }
  if (
    query.stalledMustBeDisclosed === true &&
    answer.outcome === "answered" &&
    (answer.rows ?? []).some((r) => r.permit?.statusClass === "stalled") &&
    !/\bstalled\b/i.test(text)
  ) {
    failures.push("rows include stalled permits but no claim says they are stalled");
  }
  if (query.contractorMustBeUnavailable === true || query.bbbRatingMustBeUnavailable === true) {
    for (const row of answer.rows ?? []) {
      if (row.contractorResolution !== undefined && row.contractorResolution !== "unresolved") {
        failures.push(
          `row shows contractorResolution ${row.contractorResolution}; Run 2 has only unresolved`,
        );
      }
    }
  }

  if (
    query.expectedMatchedCounts !== undefined &&
    answer.outcome === "answered" &&
    !query.expectedMatchedCounts.includes(answer.counts.matched)
  ) {
    failures.push(
      `counts.matched ${answer.counts.matched} is not the index's ${query.expectedMatchedCounts.join(" or ")}`,
    );
  }
  if (
    query.expectedTopPermitNumber !== undefined &&
    answer.outcome === "answered" &&
    (answer.rows ?? []).some((r) => r.permit !== undefined)
  ) {
    const first = (answer.rows ?? []).find((r) => r.permit !== undefined)?.permit?.number;
    if (first !== query.expectedTopPermitNumber) {
      failures.push(
        `the first permit is ${first ?? "unnumbered"}, the index's longest open is ${query.expectedTopPermitNumber}`,
      );
    }
  }

  if (
    query.expectedAreaPattern !== undefined &&
    ["answered", "empty_in_scope", "field_not_published"].includes(answer.outcome)
  ) {
    const name = answer.plan.area.resolved?.name;
    if (name === undefined || !new RegExp(query.expectedAreaPattern, "i").test(name)) {
      failures.push(
        `the answer used area ${name ?? "unresolved"}, expected one matching /${query.expectedAreaPattern}/`,
      );
    }
  }

  switch (query.expectedOutcome) {
    case "out_of_scope_or_empty": {
      if (!["out_of_scope", "empty_in_scope", "not_found"].includes(answer.outcome)) {
        failures.push(`outcome ${answer.outcome} is not out_of_scope, empty_in_scope or not_found`);
      }
      if (answer.claims.length > 0) failures.push("a refused answer carries claims");
      if (answer.citations.length > 0) failures.push("a refused answer carries citations");
      if ((answer.rows?.length ?? 0) > 0) failures.push("a refused answer carries rows");
      if (answer.counts.matched !== 0) failures.push("a refused answer reports matched > 0");
      return result("refused", failures);
    }
    case "refused_outbound": {
      // A request to message owners is refused outright: the typed out_of_scope outcome, the
      // outbound marker in plan.unsupported, and nothing else (no search, rows, counts or claims).
      if (answer.outcome !== "out_of_scope") {
        failures.push(
          `outcome ${answer.outcome}, expected out_of_scope (outbound messaging refused)`,
        );
      }
      if (
        !answer.plan.unsupported.some(
          (u) =>
            u.reason === "out_of_scope" &&
            /\b(send|message|outreach|e-?mail|text|call|contact)/i.test(u.constraint),
        )
      ) {
        failures.push("the refusal does not record the outbound request in plan.unsupported");
      }
      if (answer.claims.length > 0) failures.push("a refused answer carries claims");
      if (answer.citations.length > 0) failures.push("a refused answer carries citations");
      if ((answer.rows?.length ?? 0) > 0) failures.push("a refused answer carries rows");
      if (answer.counts.matched !== 0) failures.push("a refused answer reports matched > 0");
      return result("refused", failures);
    }
    case "answered": {
      if (answer.outcome !== "answered")
        failures.push(`outcome ${answer.outcome}, expected answered`);
      if (answer.citations.length === 0) failures.push("answered with no citations");
      if (answer.counts.matched <= 0) failures.push("answered with matched 0");
      if (answer.plan.intent === "find_permits") failures.push(...permitRowFailures(answer, query));
      return result("answered", failures);
    }
    case "answered_unavailable": {
      if (answer.outcome !== "answered")
        failures.push(`outcome ${answer.outcome}, expected answered`);
      if (answer.citations.length === 0) failures.push("answered with no citations");
      if (!contractorFlagged(answer)) {
        failures.push("the missing contractor/BBB data is not flagged in missing");
      }
      if (
        query.expectedPermitCid !== undefined &&
        !answer.citations.some((c) => c.permitCid === query.expectedPermitCid)
      ) {
        failures.push(`the expected permit ${query.expectedPermitCid} is not cited`);
      }
      return result("unavailable", failures);
    }
    case "answered_owner_filtered": {
      // Run 3.1 publishes owner_area_class for every property, so "owners outside the area" is a
      // real filter: it must be applied (in the plan), not dropped as unpublished.
      if (answer.outcome !== "answered")
        failures.push(`outcome ${answer.outcome}, expected answered`);
      if (answer.citations.length === 0) failures.push("answered with no citations");
      if (answer.counts.matched <= 0) failures.push("answered with matched 0");
      const classes = answer.plan.filters.ownerAreaClass ?? [];
      if (!classes.some((c) => c === "out_of_area" || c === "regional")) {
        failures.push("the owner-location filter was not applied (plan.filters.ownerAreaClass)");
      }
      if (ownerLocationFlagged(answer) || /owner location is not published/i.test(text)) {
        failures.push("the answer says owner location is not published; Run 3.1 publishes it");
      }
      return result("answered", failures);
    }
    case "answered_unavailable_or_refused": {
      if (answer.outcome === "answered") {
        if (answer.citations.length === 0) failures.push("answered with no citations");
        if (!contractorFlagged(answer)) {
          failures.push("the missing contractor/BBB data is not flagged in missing");
        }
        if (
          query.expectedPermitCid !== undefined &&
          !answer.citations.some((c) => c.permitCid === query.expectedPermitCid)
        ) {
          failures.push(`the expected permit ${query.expectedPermitCid} is not cited`);
        }
        return result("unavailable", failures);
      }
      if (!["out_of_scope", "needs_clarification", "not_found"].includes(answer.outcome)) {
        failures.push(`outcome ${answer.outcome} is neither answered nor a refusal`);
      }
      if (answer.claims.length > 0) failures.push("a refused answer carries claims");
      if ((answer.rows?.length ?? 0) > 0) failures.push("a refused answer carries rows");
      return result("refused", failures);
    }
    case "answered_or_clarifies": {
      if (["needs_clarification", "not_found", "out_of_scope"].includes(answer.outcome)) {
        if (answer.claims.length > 0) failures.push("a clarifying answer carries claims");
        if ((answer.rows?.length ?? 0) > 0) failures.push("a clarifying answer carries rows");
        if (query.candidatesMustMatch !== undefined) {
          const wanted = new RegExp(query.candidatesMustMatch, "i");
          if (!(answer.candidates ?? []).some((c) => wanted.test(c.name))) {
            failures.push(`the offered places do not include /${query.candidatesMustMatch}/`);
          }
        }
        return result("refused", failures);
      }
      if (answer.outcome !== "answered")
        failures.push(`outcome ${answer.outcome}, expected answered or a clarification`);
      if (answer.citations.length === 0) failures.push("answered with no citations");
      if (answer.counts.matched <= 0) failures.push("answered with matched 0");
      return result("answered", failures);
    }
    case "answered_or_field_flagged": {
      if (answer.outcome === "field_not_published") {
        failures.push(...honestEmptyFailures(answer));
        if (answer.plan.unsupported.length === 0)
          failures.push("field_not_published without an unsupported constraint");
        return result("field_flagged", failures);
      }
      if (answer.outcome === "answered") {
        if (!ownerLocationFlagged(answer))
          failures.push("answered without flagging that owner location is not published");
        if (/\boutside the area\b|\bout[- ]of[- ](area|state|county)\b/i.test(text)) {
          failures.push(
            "the answer asserts an owner is outside the area; Run 2 does not publish owner location",
          );
        }
        if (answer.citations.length === 0) failures.push("answered with no citations");
        return result("answered", failures);
      }
      if (answer.outcome === "empty_in_scope") {
        // Searched and found nothing: honest only if the owner-location gap is stated in the
        // structured answer (otherwise the empty result looks like "no such owners exist").
        failures.push(...honestEmptyFailures(answer));
        if (!ownerLocationFlagged(answer)) {
          failures.push("empty answer does not say owner location is not published");
        }
        return result("field_flagged", failures);
      }
      failures.push(`outcome ${answer.outcome}, expected field_not_published or a flagged answer`);
      return result("fail", failures);
    }
    case "answered_or_honest_empty": {
      if (answer.outcome === "answered") {
        if (answer.citations.length === 0) failures.push("answered with no citations");
        if (answer.counts.matched <= 0) failures.push("answered with matched 0");
        if (query.contractorMustBeUnavailable === true && !contractorFlagged(answer)) {
          failures.push("the missing contractor/BBB data is not flagged in missing");
        }
        if (answer.plan.intent === "find_permits")
          failures.push(...permitRowFailures(answer, query));
        return result("answered", failures);
      }
      failures.push(...honestEmptyFailures(answer));
      return result("honest_empty", failures);
    }
    default:
      failures.push(`unknown expectedOutcome ${query.expectedOutcome}`);
      return result("fail", failures);
  }
}

/** Nearest-rank p95 over a list of latencies, with n reported so a small n is not over-read. */
export function percentile(values: readonly number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

/** Great-circle distance in miles. */
export function haversineMi(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 3958.8;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
