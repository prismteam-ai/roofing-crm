import { numeric } from "./numbers";
import type { RuleContext } from "./rules";
import { rx } from "./syntax";
export function numericRules(context: RuleContext) {
  const { draft, ledger, maxRows, take, note, apply, amount } = context;
  take(/\bin\s+oakland\s+county(?:\s*,?\s*(?:michigan|mi))?\b/gi, (s) =>
    note(
      s,
      "countyScope",
      "applied",
      "oakland_source_scope",
      "The selected source jurisdiction is Oakland County, Michigan (26/125).",
      "26/125",
      ["Fixed source authority: Michigan26 /Oakland125."],
    ),
  );
  take(
    rx(
      "\\b(?:within|radius(?:\\s+of)?|(?:search\\s+)?radius\\s*[:=]?)\\s*" +
        numeric +
        "\\s*(?<unit>miles?|mi|kilometers?|km|feet|meters?|m)\\b|\\b" +
        numeric.replace("?<n>", "?<bare>") +
        "\\s*(?<bareUnit>miles?|mi)\\s+radius\\b",
    ),
    (s, m) => {
      const unit = m.groups!.unit ?? m.groups!.bareUnit,
        raw = m.groups!.n ?? m.groups!.bare;
      if (!/^mi(?:les?)?$/.test(unit))
        note(
          s,
          "radiusMeters",
          "unsupported",
          "unsupported_radius_unit",
          "State the radius in miles; other units are not silently converted.",
          unit,
        );
      else
        amount(
          s,
          "radiusMeters",
          raw,
          0.000001,
          20 * 1609.344,
          1609.344,
          false,
          "The explicit radius replaces the contextual radius without hidden clamping.",
        );
    },
  );
  take(
    rx(
      "\\b(?:within|radius(?:\\s+of)?)\\s*" +
        numeric +
        "(?![\\w.-])(?!(?:\\s+)(?:miles?|mi|kilometers?|km|meters?|feet)\\b)",
    ),
    (s) =>
      note(
        s,
        "radiusMeters",
        "ambiguous",
        "missing_radius_unit",
        "Specify miles for the radius. A number without a unit is ambiguous.",
      ),
  );
  take(
    rx(
      "\\b(?:roofs?\\s+(?:older than|over)|roof\\s+age\\s+(?:over|above))\\s+" +
        numeric +
        "(?:\\s*years?)?\\b",
    ),
    (s, m) => amount(s, "roofMinAgeYears", m.groups!.n, 0, 150),
  );
  take(
    /\b(?:(?<negative>do not include|don't include|never include|exclude|excluding|without|no)|(?<positive>include|including))\s+(?:properties\s+with\s+)?unknown\s+roof(?:\s+ages?|\s+evidence)?\b/gi,
    (s, m) => {
      const include = !m.groups!.negative;
      if (!include && draft.roofMinAgeYears === undefined)
        note(
          s,
          "includeUnknown",
          "unsupported",
          "exclude_unknown_roof",
          "Excluding unknown roof ages without a roof-age threshold has no typed predicate.",
        );
      else
        apply(
          s,
          "includeUnknown",
          include,
          "This controls inclusion of unknown roof age when applying a roof-age threshold.",
        );
    },
  );
  take(/\b(?:only\s+)?unknown\s+roof(?:\s+age|\s+ages|\s+evidence)?\b/gi, (s) =>
    note(
      s,
      "roofMinAgeYears",
      "unsupported",
      "only_unknown_roof",
      "Only-unknown roof age requires a separate typed predicate. includeUnknown is an inclusion flag, not an only-unknown filter.",
    ),
  );
  take(
    /\b(?:open\s+(?:roofing\s+)?permits?\s+)?(?:(?:that\s+)?(?:have\s+been|are|remain)\s+)?open\s+for\s+(?:many\s+years|several\s+years|a\s+long\s+time)\b|\blong[- ]open\s+(?:roofing\s+)?permits?\b/gi,
    (s) => {
      apply(
        s,
        "permitStatus",
        "open",
        "Only explicit source-open roofing permits qualify.",
      );
      apply(
        s,
        "sort",
        "permit_open_days_desc",
        "Long duration is an ordering priority, not a fabricated numeric minimum. No number of years was supplied.",
      );
      ledger[ledger.length - 1].normalizedMeaning = "long_duration_priority";
    },
  );
  take(
    /\b(?:all|any)\s+permit\s+statuses\b|\b(?<status>open|closed|unknown|stalled|long-open)\s+(?:roofing\s+)?permits?\b|\b(?:roofing\s+)?permits?\s+(?:with\s+)?(?<after>unknown|open|closed)\s+status\b/gi,
    (s, m) =>
      apply(
        s,
        "permitStatus",
        m.groups!.status
          ? /stalled|long-open/.test(m.groups!.status)
            ? "open"
            : m.groups!.status
          : (m.groups!.after ?? "any"),
        "Only the acquired explicit status is filtered; unknown is not inferred from issuance or absence.",
      ),
  );
  take(
    rx(
      "\\b(?:top|first|limit(?:\\s+to)?|return|show(?:\\s+me)?)\\s+" +
        numeric +
        "(?:\\s+(?:properties|results|rows|matches))?\\b",
    ),
    (s, m) =>
      amount(
        s,
        "limit",
        m.groups!.n,
        1,
        maxRows,
        1,
        true,
        "This explicit row limit is honored. A limit above the model page bound is refused, never truncated.",
      ),
  );
  take(/\ball\s+(?:properties|matches|results|rows)\b/gi, (s) =>
    note(
      s,
      "limit",
      "unsupported",
      "unbounded_rows",
      "An unbounded request cannot fit the bounded model page. Specify a limit of at most50.",
    ),
  );
}
