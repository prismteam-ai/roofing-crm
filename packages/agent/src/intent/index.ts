import type { Span, Field, Primitive, RuleContext } from "./rules";
import { sourceOwnerMeaning } from "./syntax";
import { evidenceRules } from "./evidenceRules";
import { ownerRules } from "./ownerRules";
import { numericRules } from "./numericRules";
import { presentationRules } from "./presentationRules";
import { placeRules } from "./placeRules";
import { projectionRules } from "./projectionRules";
import { officialPlaceResolver } from "../../../places/src/index";
import {
  QuerySchema,
  type QueryInput,
  type PlaceReference,
} from "../../../contracts/src/index";
import { cardinal } from "./numbers";
import {
  IntentPlanSchema,
  IntentRejection,
  type IntentPlan,
  type IntentOptions,
  type ConstraintLedgerEntry,
} from "./types";
export * from "./types";
export function interpretIntent(
  prompt: string,
  input: QueryInput,
  options: IntentOptions = {},
): IntentPlan {
  const ledger: ConstraintLedgerEntry[] = [];
  const base = QuerySchema.safeParse(input);
  if (!base.success || !prompt.trim() || prompt.length > 2000) {
    return IntentPlanSchema.parse({
      version: "compositional-intent-v1",
      accepted: false,
      ledger: [
        {
          rawSpan: prompt.slice(0, 2000),
          start: 0,
          end: Math.min(prompt.length, 2000),
          origin: "prompt",
          normalizedMeaning: "invalid_request",
          classification: "unsupported",
          material: true,
          typedField: "expression",
          reason:
            "Use a valid typed current query and an evidence question of1–2000characters.",
          evidence: [],
        },
      ],
    });
  }
  const draft: Record<string, string | number | boolean | undefined> = {
    ...base.data,
    cursor: undefined,
  };
  const text = prompt
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, "-");
  const used = new Array<boolean>(text.length).fill(false);
  const assignments = new Map<
    string,
    { value: Primitive; entries: number[] }
  >();
  const maxRows = Math.min(options.maxRows ?? 50, 50);
  let placeResolution: PlaceReference | undefined;
  const note = (
    span: Span,
    field: Field,
    classification: ConstraintLedgerEntry["classification"],
    meaning: string,
    reason: string,
    value?: ConstraintLedgerEntry["typedValue"],
    evidence: string[] = [],
    material = classification !== "descriptive",
  ) => {
    if (ledger.length >= 117) {
      if (!ledger.some((x) => x.normalizedMeaning === "ledger_bound"))
        ledger.push({
          rawSpan: prompt.slice(span.start, span.end),
          start: span.start,
          end: span.end,
          origin: "prompt",
          normalizedMeaning: "ledger_bound",
          classification: "unsupported",
          material: true,
          typedField: "expression",
          reason:
            "This request exceeds the bounded constraint-ledger size. Split it into smaller questions.",
          evidence: [],
        });
      return;
    }
    ledger.push({
      rawSpan: prompt.slice(span.start, span.end),
      start: span.start,
      end: span.end,
      origin: span.start === span.end ? "context" : "prompt",
      normalizedMeaning: meaning,
      classification,
      material,
      typedField: field,
      ...(value === undefined ? {} : { typedValue: value }),
      reason,
      evidence,
    });
  };
  const context = (
    field: Field,
    value: ConstraintLedgerEntry["typedValue"],
    reason: string,
  ) =>
    ledger.push({
      rawSpan: "",
      start: 0,
      end: 0,
      origin: "context",
      normalizedMeaning: "active_" + field,
      classification: "applied",
      material: false,
      typedField: field,
      typedValue: value,
      reason,
      evidence: [],
    });
  context(
    "center",
    { lat: base.data.lat, lng: base.data.lng },
    "Current map center; an explicit resolved place can replace this context.",
  );
  context(
    "radiusMeters",
    base.data.radiusMeters,
    "Current radius is used only when no explicit radius is requested.",
  );
  context(
    "limit",
    base.data.limit,
    "Current page limit is used only when no explicit limit is requested.",
  );
  if (base.data.ownerRegion && base.data.ownerRegion !== "any")
    context("ownerRegion", base.data.ownerRegion, sourceOwnerMeaning);
  const free = () =>
    text
      .split("")
      .map((c, i) => (used[i] ? "\0" : c))
      .join("");
  const mark = (span: Span) => {
    for (let i = span.start; i < span.end; i++) used[i] = true;
  };
  const take = (
    pattern: RegExp,
    callback: (span: Span, match: RegExpMatchArray) => void,
  ) => {
    for (const match of free().matchAll(
      new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
      ),
    )) {
      const span = {
        start: match.index!,
        end: match.index! + match[0].length,
        text: match[0],
      };
      if (used.slice(span.start, span.end).some(Boolean)) continue;
      callback(span, match);
      mark(span);
    }
  };
  const apply = (
    span: Span,
    field: Exclude<
      Field,
      "center" | "countyScope" | "display" | "safety" | "expression"
    >,
    value: Primitive,
    reason: string,
    evidence: string[] = [],
  ) => {
    if (
      field === "ownerRegion" &&
      base.data.ownerRegion &&
      base.data.ownerRegion !== "any" &&
      value !== base.data.ownerRegion
    ) {
      note(
        span,
        field,
        "conflicting",
        "owner_filter_conflict",
        "The requested owner class conflicts with the active owner filter. Change that filter explicitly.",
        value,
      );
      return false;
    }
    const previous = assignments.get(field);
    if (previous && previous.value !== value) {
      for (const i of previous.entries) {
        ledger[i].classification = "conflicting";
        ledger[i].reason =
          "Incompatible explicit constraints target the same typed field.";
      }
      note(
        span,
        field,
        "conflicting",
        "conflicting_" + field,
        "Incompatible explicit constraints target the same typed field.",
        value,
      );
      return false;
    }
    note(span, field, "applied", field, reason, value, evidence);
    const entry = ledger.length - 1;
    assignments.set(field, {
      value,
      entries: [...(previous?.entries ?? []), entry],
    });
    draft[field] = value;
    return true;
  };
  const amount = (
    span: Span,
    field: Parameters<typeof apply>[1],
    raw: string,
    min: number,
    max: number,
    scale = 1,
    integer = true,
    reason = "The explicit numeric constraint is represented by this typed field.",
  ) => {
    const n = cardinal(raw),
      value = n === undefined ? undefined : n * scale;
    if (
      value === undefined ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(n))
    ) {
      note(
        span,
        field,
        "unsupported",
        "invalid_" + field,
        "The explicit value is outside the supported range or is not an unambiguous number.",
        raw,
      );
      return;
    }
    apply(
      span,
      field,
      field === "minOpenDays" ? Math.ceil(value) : value,
      reason,
    );
  };
  const rules: RuleContext = {
    prompt,
    text,
    base: base.data,
    draft,
    ledger,
    maxRows,
    options,
    take,
    note,
    apply,
    amount,
    setPlaceResolution: (place) => {
      placeResolution = place;
    },
  };
  evidenceRules(rules);
  ownerRules(rules);
  numericRules(rules);
  presentationRules(rules);
  placeRules(rules);
  projectionRules(rules);
  const residual = free().replaceAll("\0", " ");
  for (const m of residual.matchAll(
    /[^\s,;.!?:()[\]{}]+(?:\s+[^\s,;.!?:()[\]{}]+)*/g,
  )) {
    if (!/[\p{L}\p{N}<>]/u.test(m[0])) continue;
    note(
      { start: m.index!, end: m.index! + m[0].length, text: m[0] },
      "expression",
      "ambiguous",
      "unconsumed_constraint",
      "This span has no validated typed interpretation. Clarify it; it will not be silently discarded.",
    );
  }
  if (draft.roofMinAgeYears !== undefined && !assignments.has("includeUnknown"))
    draft.includeUnknown = false;
  if (
    draft.permitStatus === "closed" &&
    !assignments.has("minOpenDays") &&
    (draft.minOpenDays as number) > 0
  ) {
    const entry = ledger.find(
      (x) =>
        x.origin === "prompt" &&
        x.typedField === "permitStatus" &&
        x.typedValue === "closed",
    );
    if (entry)
      apply(
        { start: entry.start, end: entry.end, text: entry.rawSpan },
        "minOpenDays",
        0,
        "Closed status clears only the inherited open-duration context; no closed-permit age is inferred.",
      );
  }
  if ((draft.minOpenDays as number) > 0 && draft.permitStatus !== "open")
    note(
      { start: 0, end: 0, text: "" },
      "minOpenDays",
      "conflicting",
      "duration_status_conflict",
      "Minimum open duration requires an explicit open-status predicate.",
    );
  if (
    draft.sort === "permit_open_days_desc" &&
    (draft.permitStatus === "closed" || draft.permitStatus === "unknown")
  )
    note(
      { start: 0, end: 0, text: "" },
      "sort",
      "conflicting",
      "duration_sort_status_conflict",
      "Open-duration ordering cannot infer an open date or duration for closed or unknown-status permits.",
    );
  if ((draft.limit as number) > maxRows)
    note(
      { start: 0, end: 0, text: "" },
      "limit",
      "unsupported",
      "context_page_bound",
      "The active page limit exceeds the bounded model page; reduce it explicitly.",
      draft.limit,
    );
  const parsed = QuerySchema.safeParse(draft);
  if (!parsed.success)
    note(
      { start: 0, end: 0, text: "" },
      "expression",
      "unsupported",
      "invalid_composed_query",
      "The composed intent does not satisfy the shared typed query contract.",
    );
  if (parsed.success && (parsed.data.placeId || parsed.data.placeIndexDigest)) {
    const resolver = options.placeResolver ?? officialPlaceResolver;
    const reference =
      placeResolution ?? resolver.get?.(parsed.data.placeId ?? "");
    if (
      !reference ||
      !reference.resolutionEligible ||
      !parsed.data.placeId ||
      !parsed.data.placeIndexDigest ||
      reference.placeId !== parsed.data.placeId ||
      reference.indexDigest !== parsed.data.placeIndexDigest ||
      Math.abs(reference.center.lat - parsed.data.lat) > 1e-8 ||
      Math.abs(reference.center.lng - parsed.data.lng) > 1e-8
    )
      note(
        { start: 0, end: 0, text: "" },
        "placeId",
        "unsupported",
        "stale_place_binding",
        "The active place ID, digest and official center must agree. Resolve the place again or choose a manual map pin.",
      );
  }
  const accepted =
    parsed.success &&
    ledger.every((x) => !x.material || x.classification === "applied");
  return IntentPlanSchema.parse({
    version: "compositional-intent-v1",
    accepted,
    ...(accepted ? { query: parsed.data } : {}),
    ledger,
    ...(placeResolution ? { placeResolution } : {}),
  });
}
export function requireIntent(
  prompt: string,
  base: QueryInput,
  options: IntentOptions = {},
) {
  const plan = interpretIntent(prompt, base, options);
  if (!plan.accepted) throw new IntentRejection(plan);
  return plan as IntentPlan & { query: ReturnType<typeof QuerySchema.parse> };
}
