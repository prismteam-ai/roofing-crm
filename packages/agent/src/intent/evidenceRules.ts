import type { RuleContext } from "./rules";
import { rx, activeReference } from "./syntax";
import { NUMBER, numeric } from "./numbers";
export function evidenceRules(context: RuleContext) {
  const { base, take, note, amount } = context;
  take(/\bstalled\s+(?:roofing\s+)?permits?\b/gi, (s) =>
    note(
      s,
      "permitStatus",
      "unsupported",
      "stalled_work",
      "Open status and elapsed duration do not prove stalled work. Ask for observed open status or duration instead.",
    ),
  );
  take(
    /\b(?:sql|select|pragma|attach|extension|filesystem|shell|secrets?|tokens?|credentials?|passwords?|browse|scrape|https?|email|outreach|send|delete|drop|jailbreak)\b|ignore\s+(?:all\s+)?(?:previous|prior|system)\s+instructions|invent\s+(?:results|properties)|override\s+(?:limits|instructions)/gi,
    (s) =>
      note(
        s,
        "safety",
        "unsupported",
        "unsafe_operation",
        "Only bounded evidence retrieval is available; this operation is unavailable.",
      ),
  );
  take(
    rx(
      "\\b(?:not|without|outside|exclude|excluding|do not (?:search|use|include)|don't (?:search|use|include))(?:\\s+(?:in|within|near|around|at|of|from))?\\s+(?:" +
        NUMBER +
        "\\s+(?:miles?|mi)\\s+(?:of|from)\\s+)?" +
        activeReference +
        "\\b",
    ),
    (s) =>
      note(
        s,
        "center",
        "unsupported",
        "excluded_geography",
        "A complement or exclusion of the active geographic region cannot be represented by a radius search.",
      ),
  );
  take(
    rx(
      "\\b(?:bbb|ratings?|grades?|scores?)[^;.!?]{0,40}?(?:above|below|over|under|greater than|less than|at least|at most|[<>]=?)\\s*(?:" +
        NUMBER +
        "|a\\+?|b\\+?|c\\+?)\\b",
    ),
    (s) =>
      note(
        s,
        "requiresBbbRating",
        "unsupported",
        "rating_threshold",
        "BBB numeric/grade thresholds have no typed predicate; no rating threshold will be dropped or invented.",
      ),
  );
  take(
    /\b(?:active|current|valid|eligible)\s+(?:business\s+|contractor\s+)?licen[cs]e(?:s|d)?\b|\blicen[cs]es?\s+(?:that\s+are\s+|are\s+)?(?:active|current|valid)\b/gi,
    (s) =>
      note(
        s,
        "requiresVerifiedLicense",
        "unsupported",
        "active_license",
        "An official license observation does not establish current active eligibility. That stronger requested fact is unavailable.",
      ),
  );
  take(
    rx(
      "\\b(?:unchanged\\s+ownership|ownership\\s+tenure|ownership|owned|ownership\\s+transfer|exchanged\\s+ownership|not\\s+sold|no\\s+ownership\\s+changes)\\s+(?:(?:for|in)\\s+)?(?:(?:over|more than|at least)\\s+)?" +
        numeric +
        "\\s*years?\\b",
    ),
    (s) =>
      note(
        s,
        "minOwnershipYears",
        "unsupported",
        "true_tenure",
        "Uninterrupted ownership tenure requires complete transfer evidence. A reported-sale proxy or bounded current-PIN deed index gap cannot be substituted. Ask explicitly for no observed recorded deed for more than ten years to query the narrower documented index observation.",
      ),
  );
  if ((base.minOwnershipYears ?? 0) > 0)
    note(
      { start: 0, end: 0, text: "" },
      "minOwnershipYears",
      "unsupported",
      "active_true_tenure",
      "The active tenure predicate is unsupported by the available evidence. Clear it explicitly before choosing the separate recorded-deed-index-gap predicate; this does not prove legal ownership continuity.",
      base.minOwnershipYears,
    );
  take(
    rx(
      "\\b(?:last|latest)\\s+(?:observed\\s+)?reported\\s+sale\\s+(?:(?:was|is|observed)\\s+)?(?:older than|over|more than)\\s+" +
        numeric +
        "\\s*years?(?:\\s+ago)?\\b",
    ),
    (s, m) =>
      amount(
        s,
        "minReportedSaleAgeYears",
        m.groups!.n,
        0,
        200,
        1,
        true,
        "This is age of the last observed reported sale in partial history; it does not establish uninterrupted tenure.",
      ),
  );
}
