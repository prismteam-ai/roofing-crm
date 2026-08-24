/**
 * Normalizes natural-language agent questions for retrieval.
 */
export function normalizeRoofingAgentQuestion(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extracts a property id alias when the user mentions lee-prop-* or a Chester UPI.
 */
export function extractPropertyIdAliasFromQuestion(question: string): string | null {
  const leeMatch = /lee-prop-[a-z0-9-]+/i.exec(question);
  if (leeMatch !== null) {
    return leeMatch[0];
  }
  const chesterMatch = /\b\d+-\d+(?:\.\d+)?-\d+(?:\.\d+)?\b/.exec(question);
  return chesterMatch?.[0] ?? null;
}

/**
 * Whether the question looks like a structured geo/age/permit search.
 */
export function isStructuredRoofingSearchQuestion(question: string): boolean {
  const normalized = normalizeRoofingAgentQuestion(question);
  return (
    /\b(within|miles?|radius|near|around)\b/.test(normalized) ||
    /\bbuilt\b/.test(normalized) ||
    /\b(before|older than|over)\s+\d{4}\b/.test(normalized) ||
    /\bopen\b.*\bpermit/.test(normalized) ||
    /\broof(ing)?\b/.test(normalized)
  );
}

/**
 * Whether the user is asking about Chester / West Chester geography.
 */
export function mentionsWestChesterOrChesterCounty(question: string): boolean {
  const normalized = normalizeRoofingAgentQuestion(question);
  return (
    /\bwest chester\b/.test(normalized) ||
    /\bchester county\b/.test(normalized) ||
    /\bcoatesville\b/.test(normalized) ||
    (/\bchester\b/.test(normalized) && !/\bchester,?\s*fl\b/.test(normalized))
  );
}
