import { propertyEvidence } from "../../map-domain/src/signals";
import { tool } from "ai";
import {
  DomainError,
  QuerySchema,
  type QueryInput,
  type SearchResponse,
} from "../../contracts/src/index";
import type { OracleReader } from "../../oracle-client/src/index";
export interface AgentAnswer {
  mode: "deterministic-offline" | "bedrock-converse";
  answer: string;
  query: QueryInput;
  results: SearchResponse["rows"];
  citations: string[];
  caveats: string[];
  toolTrace: {
    tool: "searchRoofingEvidence";
    queryHash: string;
    snapshotId: string;
    resultCount: number;
  }[];
}
export function interpretPrompt(prompt: string, base: QueryInput): QueryInput {
  if (!prompt.trim() || prompt.length > 2000)
    throw new DomainError(
      "INVALID_INPUT",
      "Ask a roofing evidence question of at most 2,000 characters",
    );
  if (
    /\b(sql|select|pragma|attach|extension|filesystem|shell|secrets?|tokens?|credentials?|passwords?|browse|scrape|http|https|email|outreach|send|delete|drop)\b/i.test(
      prompt,
    )
  )
    throw new DomainError(
      "UNSUPPORTED_TOOL",
      "This assistant only retrieves available roofing evidence. SQL, browsing, secrets and outreach are unavailable.",
    );
  const text = prompt
    .toLowerCase()
    .replace(/\bfive\b/g, "5")
    .replace(/\bfifteen\b/g, "15")
    .replace(/\bten\b/g, "10");
  const query: QueryInput = { ...base, cursor: undefined };
  const open = /\b(?:open|stalled|long-open)\b/.test(text);
  const closed = /\bclosed\b/.test(text);
  if ((open && closed) || /\bnot\s+(?:open|closed)\b/.test(text)) {
    throw new DomainError(
      "UNSUPPORTED_TOOL",
      "Ask for either open or closed permits with an explicit status; mixed or negated status wording is unsupported.",
    );
  }
  if (closed) {
    query.permitStatus = "closed";
    query.minOpenDays = 0;
  } else if (open) query.permitStatus = "open";
  const miles = text.match(
    /(?:within|radius(?: of)?)\s+(\d+(?:\.\d+)?)\s*miles?/,
  );
  if (miles) query.radiusMeters = Number(miles[1]) * 1609.344;
  const permitYears = text.match(
    /permits?[^.]*?(?:older than|over|more than)\s+(\d+)\s*years?/,
  );
  if (permitYears) {
    if (query.permitStatus === "closed")
      throw new DomainError(
        "UNSUPPORTED_TOOL",
        "Closed-permit age is unsupported; minimum open duration applies only to open permits.",
      );
    query.minOpenDays = Math.ceil(Number(permitYears[1]) * 365.25);
  }
  const roofYears = text.match(
    /(?:roofs? (?:older than|over)|roof age (?:over|above))\s+(\d+)/,
  );
  if (roofYears) query.roofMinAgeYears = Number(roofYears[1]);
  return QuerySchema.parse(query);
}
/** AI SDK tool schema is shared with the deterministic offline provider. No inference occurs. */
export function createEvidenceTool(reader: OracleReader) {
  return tool({
    description:
      "Read snapshot-bound roofing opportunities and their evidence only.",
    inputSchema: QuerySchema,
    execute: async (input) => reader.search(input),
  });
}
export async function answerQuestion(
  reader: OracleReader,
  prompt: string,
  base: QueryInput,
): Promise<AgentAnswer> {
  const query = interpretPrompt(prompt, base);
  const data = await reader.search(query);
  const citations = [
    ...new Set(
      data.rows.flatMap((p) =>
        propertyEvidence(p).map((s) => `${s.sourceId}:${s.recordId}`),
      ),
    ),
  ];
  const unknown = data.rows.filter((p) => p.roof.ageYears === null).length;
  return {
    mode: "deterministic-offline",
    query,
    results: data.rows,
    citations,
    caveats: [
      ...data.limitations,
      "This response uses deterministic retrieval, with no model inference. Snapshot coverage and unavailable evidence remain explicit.",
      ...(unknown
        ? [`${unknown} returned properties have unknown roof age.`]
        : []),
      "No contractor identity, license or rating is inferred from a reported name.",
    ],
    answer: `I found ${data.total} matching ${data.total === 1 ? "property" : "properties"} within ${(query.radiusMeters / 1609.344).toFixed(1)} miles. ${query.roofMinAgeYears !== undefined ? `Roof-age threshold: ${query.roofMinAgeYears} years. ` : ""}${query.permitStatus === "open" ? `Open permits${query.minOpenDays ? ` for at least ${query.minOpenDays} days` : ""}. ` : query.permitStatus === "closed" ? "Closed permits. " : ""}Results are bound to ${data.snapshotId}; review each source and confidence before qualifying a lead.`,
    toolTrace: [
      {
        tool: "searchRoofingEvidence",
        queryHash: data.queryHash,
        snapshotId: data.snapshotId,
        resultCount: data.rows.length,
      },
    ],
  };
}
