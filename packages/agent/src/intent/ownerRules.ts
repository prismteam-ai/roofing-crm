import type { RuleContext } from "./rules";
import { sourceOwnerMeaning } from "./syntax";
export function ownerRules(context: RuleContext) {
  const { take, note, apply } = context;
  take(
    /\b(?:not|no|non[- ]?|exclude|excluding|without|except|maybe|possibly|mostly)\s+(?:regional|local|out[- ]of[- ]area)\s+owners?\b|\bowners?\s+(?:(?:who|that)\s+are\s+|are\s+)?not\s+(?:regional|local|out[- ]of[- ]area)\b|\b(?:exclude|excluding|except|without|not|do not include|don't include)\s+(?:those|these|them|that group|the same)\b/gi,
    (s) =>
      note(
        s,
        "ownerRegion",
        "unsupported",
        "owner_exclusion",
        "Negated, uncertain or anaphoric owner-class exclusions cannot be represented by one ownerRegion value.",
      ),
  );
  take(
    /\bowners?\s+with\s+(?:mailing|postal)\s+addresses?\s+(?<relation>in|outside)\s+(?:michigan|mi)\b/gi,
    (s, m) =>
      apply(
        s,
        "ownerRegion",
        m.groups!.relation === "in" ? "regional" : "out_of_area",
        sourceOwnerMeaning,
      ),
  );
  take(
    /\b(?<region>regional|out[- ]of[- ]area)\s+(?:property\s+)?owners?\b|\bowners?\s+(?:(?:who|that)\s+are\s+|are\s+|classified\s+as\s+)?(?<after>regional|out[- ]of[- ]area)\b|\bowner\s+(?:location|region)\s*(?:(?:is|class|classification)\s*|[:=]\s*)?(?<field>regional|out[- ]of[- ]area|unknown)\b/gi,
    (s, m) => {
      const r = (
        m.groups!.region ??
        m.groups!.after ??
        m.groups!.field
      ).replace(/[- ]/g, "");
      apply(
        s,
        "ownerRegion",
        r === "regional"
          ? "regional"
          : r === "unknown"
            ? "unknown"
            : "out_of_area",
        sourceOwnerMeaning,
      );
    },
  );
  take(/\b(?:local|nearby|non[- ]local|unknown)\s+owners?\b/gi, (s) =>
    note(
      s,
      "ownerRegion",
      "ambiguous",
      "ambiguous_owner_class",
      "Local/nearby can mean city, county or state; unknown owner identity is not a mailing-state class. Specify regional or out-of-area mailing classification.",
    ),
  );
}
