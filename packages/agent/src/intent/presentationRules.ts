import type { RuleContext } from "./rules";
export function presentationRules(context: RuleContext) {
  const { take, apply, note } = context;
  // A complete conditional projection is bound before optional presence suffixes
  // can backtrack into a shorter must-have match.
  take(
    /\b(?:(?<binder>with|having|requires?)\s+)?(?:(?:reported|verified|listed|observed|available|official\s+high[- ]confidence)\s+)?(?:business\s+)?(?:contractors?|licen[cs]e(?:\s+(?:observations?|evidence|records?))?|bbb\s+(?:ratings?|grades?))(?:\s+(?:details|information))?\s+where\s+(?:available|observed)\b/gi,
    (s, m) =>
      note(
        s,
        "display",
        m.groups!.binder?.startsWith("require") ? "conflicting" : "descriptive",
        "conditional_business_projection",
        m.groups!.binder?.startsWith("require")
          ? "A must-have requirement conflicts with a conditional where-available projection. Clarify whether missing observations should exclude properties."
          : "Show available business observations without adding a presence filter; missing company, license and rating evidence remains explicit.",
        undefined,
        [],
        Boolean(m.groups!.binder?.startsWith("require")),
      ),
  );
  take(
    /\b(?:sort(?:ed)?\s+by\s+|order(?:ed)?\s+by\s+)?(?<sort>distance|nearest|closest|oldest\s+roofs?|roof\s+age\s+descending|longest[- ]open\s+permits?|permit\s+open\s+days\s+descending)\b/gi,
    (s, m) =>
      apply(
        s,
        "sort",
        /roof|age/.test(m.groups!.sort)
          ? "roof_age_desc"
          : /permit|open/.test(m.groups!.sort)
            ? "permit_open_days_desc"
            : "distance",
        "The authoritative source order is retained by the selected model ordinal subset.",
      ),
  );
  take(
    /\b(?:with|having|requires?)\s+(?:an?\s+)?(?:verified\s+)?contractors?\b(?!\s+(?:details|information|where\s+(?:available|observed)))|\bcontractor\s+required\b/gi,
    (s) =>
      apply(
        s,
        "requiresContractor",
        true,
        "A verifiedCompanyId edge is required; reported business-applicant names alone do not qualify.",
      ),
  );
  take(
    /\b(?:with|having|requires?)\s+(?:an?\s+)?(?:verified|official\s+high[- ]confidence)\s+licen[cs]e(?:\s+(?:observations?|evidence|records?))?\b(?!\s+(?:details|information|where\s+(?:available|observed)))/gi,
    (s) =>
      apply(
        s,
        "requiresVerifiedLicense",
        true,
        "Requires a high-confidence official license observation; it does not establish current active eligibility.",
      ),
  );
  take(
    /\b(?:with|having|requires?)\s+(?:an?\s+)?(?:observed\s+)?bbb\s+(?:ratings?|grades?)(?:\s+evidence)?\b(?!\s+(?:details|information|where\s+(?:available|observed)))/gi,
    (s) =>
      apply(
        s,
        "requiresBbbRating",
        true,
        "An acquired BBB rating observation is required; no numeric threshold or current identity is inferred.",
      ),
  );
  take(
    /\b(?<level>high|medium|low)\s+confidence\s+roofs?\b|\broof\s+confidence\s+(?<after>high|medium|low)\b/gi,
    (s, m) =>
      apply(
        s,
        "minConfidence",
        m.groups!.level ?? m.groups!.after,
        "Minimum confidence applies to the recorded roof-age evidence.",
      ),
  );
}
