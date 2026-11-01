import type { RuleContext } from "./rules";
export function projectionRules(context: RuleContext) {
  const { text, ledger, take, note, apply } = context;
  const inPresenceScope = (position: number) => {
    const previous =
      text
        .slice(0, position)
        .split(/[;.!?]/)
        .at(-1) ?? "";
    return /\b(?:with|having|requires?)\b/.test(previous);
  };
  const displayRequested =
    /\b(?:details|information|where\s+(?:observed|available))\b/.test(text);
  take(/\bavailable\s+(?:business\s+)?licen[cs]e\s+evidence\b/gi, (s) => {
    const required = inPresenceScope(s.start);
    note(
      s,
      required ? "requiresVerifiedLicense" : "display",
      required ? "unsupported" : "descriptive",
      required ? "untyped_license_presence" : "available_license_projection",
      required
        ? "Presence of any available license observation has no typed filter. A verified high-confidence observation is a different requirement; ask to show details where available for a non-filtering projection."
        : "Display available source observations without requiring a high-confidence license match.",
      undefined,
      [],
      required,
    );
  });
  take(
    /\b(?<quality>reported|verified|listed)?\s*contractors?(?:\s+(?<projection>details|information))?\b/gi,
    (s, m) => {
      if (
        m.groups!.quality === "listed" &&
        inPresenceScope(s.start) &&
        !m.groups!.projection
      )
        note(
          s,
          "requiresContractor",
          "unsupported",
          "untyped_listed_contractor_presence",
          "A listed or reported party is not a verified contractor. Presence of a listed name has no typed filter; ask to display listed details where available instead.",
        );
      else if (
        m.groups!.quality === "listed" ||
        m.groups!.projection ||
        (displayRequested && !inPresenceScope(s.start))
      )
        note(
          s,
          "display",
          "descriptive",
          "contractor_projection",
          "Display available source-reported names and unresolved identity without requiring a company match.",
          undefined,
          [],
          false,
        );
      else if (inPresenceScope(s.start) && m.groups!.quality !== "reported")
        apply(
          s,
          "requiresContractor",
          true,
          "A verified company edge is required; reported applicant names alone do not qualify.",
        );
      else
        note(
          s,
          "requiresContractor",
          inPresenceScope(s.start) ? "unsupported" : "ambiguous",
          "contractor_request_scope",
          "Specify a verified contractor requirement, or ask to show contractor details where available. A reported name is not a verified contractor.",
        );
    },
  );
  take(
    /\b(?<quality>verified|official\s+high[- ]confidence|official)?\s*licen[cs]e(?:\s+(?<projection>details|information|evidence|observations))?\b/gi,
    (s, m) => {
      if (
        inPresenceScope(s.start) &&
        /^(?:verified|official\s+high[- ]confidence)$/.test(
          m.groups!.quality ?? "",
        ) &&
        !/^(?:details|information)$/.test(m.groups!.projection ?? "")
      )
        apply(
          s,
          "requiresVerifiedLicense",
          true,
          "A high-confidence official observation is required; current eligibility is not inferred.",
        );
      else if (
        m.groups!.projection ||
        (displayRequested && !inPresenceScope(s.start))
      )
        note(
          s,
          "display",
          "descriptive",
          "license_projection",
          "Display actual license observations where available; missing and current eligibility remain explicit.",
          undefined,
          [],
          false,
        );
      else
        note(
          s,
          "requiresVerifiedLicense",
          "ambiguous",
          "license_request_scope",
          "Clarify whether to display observations or require high-confidence official license evidence. Active eligibility cannot be inferred.",
        );
    },
  );
  take(
    /\b(?:observed\s+)?bbb\s+(?:ratings?|grades?)(?:\s+(?<projection>details|information))?\b/gi,
    (s, m) => {
      if (m.groups!.projection || !inPresenceScope(s.start))
        note(
          s,
          "display",
          "descriptive",
          "bbb_projection",
          "Display actual BBB observations where available, keeping missing ratings explicit.",
          undefined,
          [],
          false,
        );
      else
        apply(
          s,
          "requiresBbbRating",
          true,
          "An acquired BBB observation is required. A numeric rating threshold is not supported.",
        );
    },
  );
  // Recognized descriptive projections are non-filtering only when no must-have
  // clause consumed them. Unknown residual clauses are never called filler.
  take(
    /\b(?:reported\s+)?(?:contractor|contractors|business|license|bbb)(?:\s+(?:and\s+)?(?:contractor|business|license|bbb))*\s+(?:details|information|evidence|observations|records|ratings?)\b|\b(?:reported\s+)?contractor\b|\blicense\b|\bbbb\s+details\b/gi,
    (s) =>
      note(
        s,
        "display",
        "descriptive",
        "evidence_projection",
        "Show observed details and unknowns without discarding rows merely because these details are absent.",
        undefined,
        [],
        false,
      ),
  );
  take(
    /\b(?:where\s+(?:observed|available)|available\s+evidence|same\s+prior\s+area|source[- ]backed\s+evidence|partial\s+ownership\s+records|roofing\s+opportunities|roof\s+and\s+permit\s+evidence|roofing\s+evidence|permit\s+evidence|unknown\s+evidence|properties|property|roofs?|roofing\s+permits?|permits?|evidence)\b/gi,
    (s) =>
      note(
        s,
        "display",
        "descriptive",
        "query_subject",
        "This names the result/evidence subject without adding a predicate.",
        undefined,
        [],
        false,
      ),
  );
  take(/\bonly\b/gi, (s) => {
    const boundary = /[;!?]|\.(?=\s|$)|\band\b/.exec(text.slice(s.end));
    const end = boundary ? s.end + boundary.index : text.length;
    const target = ledger
      .filter(
        (entry) =>
          entry.origin === "prompt" &&
          entry.start >= s.end &&
          entry.start < end &&
          !(
            entry.normalizedMeaning === "query_subject" &&
            /^(?:properties?|roofs?|roofing permits?|permits?)$/.test(
              entry.rawSpan.trim(),
            )
          ),
      )
      .sort((a, b) => a.start - b.start)[0];
    if (target?.material && target.classification === "applied")
      note(
        s,
        target.typedField,
        "applied",
        "only_bound_restriction",
        "Only restricts results to the following applied typed predicate; it is not discarded as request scaffolding.",
        target.typedValue,
      );
    else
      note(
        s,
        "expression",
        "unsupported",
        "unbound_only_restriction",
        "Only requires an explicit supported typed restriction. An unknown-only category or a descriptive business projection cannot silently become an unrestricted search.",
      );
  });
  take(
    /\b(?:please|find|show|list|return|display|get|give\s+me|which|what|who|use|me|with|having|that|have|has|and|but|for|the|a|an|are|is|available|observed|older|years?|ago)\b/gi,
    (s) => {
      if (/^(?:older|years?|ago)$/.test(s.text))
        note(
          s,
          "expression",
          "ambiguous",
          "unbound_age_word",
          "An age phrase was not bound to a supported subject and comparison.",
        );
      else
        note(
          s,
          "display",
          "descriptive",
          "query_scaffolding",
          "This is grammatical request scaffolding, not a filter.",
          undefined,
          [],
          false,
        );
    },
  );
}
