import type { RuleContext } from "./rules";
import { rx } from "./syntax";
import { numeric, cardinal } from "./numbers";
import {
  calendarAgeThresholdDays,
  SOURCE_ASSESSMENT_DATE,
} from "./source-calendar";
/** Source-qualified clauses never become a stronger native/open or ownership claim. */
export function sourceEvidenceRules({
  take,
  amount,
  apply,
  note,
  options,
}: RuleContext) {
  const assessmentDate = options.sourceAssessmentDate ?? SOURCE_ASSESSMENT_DATE;
  const calendarBound = (
    span: Parameters<RuleContext["note"]>[0],
    raw: string,
    unit: string,
    strict: boolean,
    field: "minPermitAgeSinceIssueDays" | "minOpenDays",
  ) => {
    const number = cardinal(raw);
    let days: number;
    try {
      if (number === undefined || !Number.isSafeInteger(number) || number < 0)
        throw new Error("Invalid duration");
      days = /^year/.test(unit)
        ? calendarAgeThresholdDays(assessmentDate, number, strict)
        : number + (strict ? 1 : 0);
      if (days > 50000) throw new Error("Duration exceeds bound");
      // Also validate a day-based clause's source anchor without using the wall clock.
      calendarAgeThresholdDays(assessmentDate, 0);
    } catch {
      note(
        span,
        field,
        "unsupported",
        "invalid_source_calendar_threshold",
        "A valid pinned source assessment date and bounded nonnegative integer calendar threshold are required.",
      );
      return;
    }
    apply(
      span,
      "permitStatus",
      "open",
      "Current activity/open status must be explicitly source-qualified; an ISSUED-only observation cannot qualify.",
    );
    if (field === "minOpenDays")
      apply(
        span,
        "permitActivityClaim",
        "native_reported_open",
        "This explicit open-for/continuous duration requires independently documented native interval history, not issue age or a provider activity label.",
      );
    apply(
      span,
      field,
      days,
      field === "minOpenDays"
        ? "Minimum independently documented native open interval; issue age cannot substitute."
        : "Permit age means age since issue at the source assessment date, conjoined with current source-qualified activity. It does not imply uninterrupted open history.",
    );
    note(
      span,
      "sourceAssessmentDate",
      "applied",
      field === "minOpenDays"
        ? "native_interval_calendar_basis"
        : "issue_age_calendar_basis",
      `Calendar threshold anchored to source assessment ${assessmentDate}; matching observations must carry that exact assessment date.`,
      assessmentDate,
    );
  };
  const explicitOpenDuration =
    "(?:(?:open\\s+)?(?:roofing\\s+)?permits?\\s+(?:that\\s+)?(?:have\\s+been|are|remain|were)\\s+(?:(?:continuously|uninterrupted(?:ly)?)\\s+)?open\\s+(?:for\\s+)?" +
    "|(?:(?:continuously|uninterrupted(?:ly)?)\\s+)?open\\s+(?:(?:roofing\\s+)?permits?\\s+)?for\\s+" +
    "|(?:continuously|uninterrupted(?:ly)?)\\s+open\\s+(?:(?:roofing\\s+)?permits?\\s+)?(?:for\\s+)?" +
    "|open\\s+(?:for\\s+)?)";
  take(
    rx(
      "\\b" +
        explicitOpenDuration +
        "(?:(?<comparison>more\\s+than|over|at\\s+least)\\s+)?" +
        numeric +
        "\\s*(?<unit>years?|days?)\\b",
    ),
    (span, match) =>
      calendarBound(
        span,
        match.groups!.n,
        match.groups!.unit,
        /^(?:more|over)/.test(match.groups!.comparison ?? ""),
        "minOpenDays",
      ),
  );
  take(rx("\\bminimum\\s+open\\s+days\\s+" + numeric + "\\b"), (span, match) =>
    calendarBound(span, match.groups!.n, "days", false, "minOpenDays"),
  );
  take(
    rx(
      "\\b(?:open|active)\\s+(?:roofing\\s+)?permits?\\s+(?:older\\s+than|over|more\\s+than)\\s+" +
        numeric +
        "\\s*(?<unit>years?|days?)\\b",
    ),
    (span, match) => {
      if (/^year/.test(match.groups!.unit)) {
        const years = cardinal(match.groups!.n);
        if (
          years === undefined ||
          !Number.isSafeInteger(years) ||
          years < 0 ||
          years > 200
        ) {
          note(
            span,
            "minPermitObservationAgeYears",
            "unsupported",
            "invalid_permit_calendar_years",
            "Permit observation age requires a bounded nonnegative integer calendar-year threshold.",
          );
          return;
        }
        apply(
          span,
          "permitStatus",
          "open",
          "The primary retrieval remains strict source-confirmed open; ISSUED alone is not open.",
        );
        apply(
          span,
          "permitOpportunityMode",
          "confirmed_open",
          "Run the source-confirmed open roofing-permit query first.",
        );
        apply(
          span,
          "minPermitObservationAgeYears",
          years,
          "Strict calendar age uses each qualifying observation's own issue/filed/status date and source assessment anchor, not continuous open duration.",
        );
        note(
          span,
          "minPermitObservationAgeYears",
          "applied",
          "strict_open_with_verification_alternative",
          "Only an actual complete strict zero may produce a separately labeled status-verification query at the same calendar threshold; those records are not confirmed open.",
          years,
        );
        return;
      }
      calendarBound(
        span,
        match.groups!.n,
        match.groups!.unit,
        true,
        "minPermitAgeSinceIssueDays",
      );
    },
  );
  take(
    /\b(?:provider(?:[- ]reported)?\s+(?:permit\s+)?status\s+(?:is\s+)?)(?<status>filed|issued|in[ _-]progress|final|expired|cancelled|revoked|unknown|interconnected)\b/gi,
    (span, match) => {
      apply(
        span,
        "providerPermitStatus",
        match.groups!.status.toUpperCase().replace(/[ -]/g, "_"),
        "Exact provider-normalized status, independent of municipal native status; ISSUED alone establishes no active/open work.",
      );
    },
  );
  take(
    /\bprovider[- ]reported\s+active(?:\s+(?:roofing\s+)?permits?)?\b/gi,
    (span) => {
      apply(
        span,
        "permitActivityClaim",
        "provider_reported_active",
        "An explicit provider-reported activity observation is required; this is not independently documented continuous open history.",
      );
    },
  );
  take(
    /\bnative[- ]reported\s+open(?:\s+(?:roofing\s+)?permits?)?\b/gi,
    (span) => {
      apply(
        span,
        "permitActivityClaim",
        "native_reported_open",
        "Independent native evidence must explicitly support open status; an issue date or provider ISSUED label cannot substitute.",
      );
    },
  );
  take(
    /\b(?:permit\s+)?activity\s+(?:claim\s+)?(?:is\s+)?not\s+established\b/gi,
    (span) => {
      apply(
        span,
        "permitActivityClaim",
        "not_established",
        "The source observation does not establish active/open work; this is not evidence that no work exists.",
      );
    },
  );
  take(
    rx(
      "\\b(?:permit\\s+)?age\\s+since\\s+(?:permit\\s+)?issu(?:e|ance)\\s+(?:is\\s+)?at\\s+least\\s+" +
        numeric +
        "\\s*days?\\b",
    ),
    (span, match) => {
      amount(
        span,
        "minPermitAgeSinceIssueDays",
        match.groups!.n,
        0,
        50000,
        1,
        true,
        "Minimum integer days since the source issue date at its assessment date; not continuous open duration, roof age or proof of active work.",
      );
    },
  );
  take(
    rx(
      "\\b(?:no\\s+observed\\s+recorded\\s+deeds?\\s+(?:for|in)|recorded\\s+deed\\s+(?:index\\s+)?gap(?:\\s+(?:is|of))?)\\s+(?:more\\s+than|over)\\s+" +
        numeric +
        "\\s*years?\\b",
    ),
    (span, match) => {
      amount(
        span,
        "minRecordedDeedGapYears",
        match.groups!.n,
        0,
        200,
        1,
        true,
        "Strict calendar-year recorded-deed gap within the documented current-PIN index window through each observation's verified-through date. Prior parcel lineage and continuous legal ownership are not established.",
      );
    },
  );
  take(
    /\b(?:provider|native)[- ]reported\s+continuous\s+(?:open|active)\s+history\b/gi,
    (span) => {
      note(
        span,
        "minOpenDays",
        "unsupported",
        "unquantified_source_continuity",
        "State an explicit supported duration and evidence basis. A provider activity label or issue-age observation is not continuous open history.",
      );
    },
  );
}
