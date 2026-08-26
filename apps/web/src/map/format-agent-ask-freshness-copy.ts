/**
 * User-facing freshness line for a RoofRadar AI answer.
 */
export function formatAgentAskFreshnessCopy(arguments_: {
  indexedAt: string | null;
  corpusSource: string;
  documentCount: number | null;
}): string {
  const sourceLabel = formatCorpusSourceLabel(arguments_.corpusSource);
  const parts = [sourceLabel];
  if (arguments_.documentCount !== null) {
    parts.push(
      arguments_.documentCount === 1
        ? "1 record"
        : `${String(arguments_.documentCount)} records`,
    );
  }
  if (arguments_.indexedAt !== null && arguments_.indexedAt.length > 0) {
    parts.push(`as of ${arguments_.indexedAt.slice(0, 10)}`);
  }
  return parts.join(" · ");
}

function formatCorpusSourceLabel(corpusSource: string): string {
  if (corpusSource === "lee_fixture_corpus") {
    return "Lee County samples";
  }
  if (corpusSource === "published_elephant_mcp") {
    return "Published county records";
  }
  if (corpusSource === "chester_demo_published_corpus") {
    return "Chester demo synthetic corpus";
  }
  const trimmed = corpusSource.trim();
  if (trimmed.length === 0) {
    return "Published records";
  }
  return trimmed.replaceAll("_", " ");
}
