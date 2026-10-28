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
  modelAudit?: {
    modelId: string;
    region: "us-east-1";
    promptRevision: "base" | "repair-1";
    promptDigest: string;
    architecture?: "one-call-tool-router-v1";
    inputTokens: number;
    outputTokens: number;
    converseCalls: number;
    reservedMicroUsd: number;
    measuredMicroUsd: number;
    failureCode?: string;
    unmeasuredCalls?: number;
  };
  mode:
    "deterministic-offline" | "deterministic-fallback" | "bedrock-tool-routed";
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
    totalMatched?: number;
    arguments?: QueryInput;
    contextRows?: number;
    contextTruncated?: boolean;
    modelSawRecords?: false;
    providerArgumentsDigest?: string;
    argumentsDigest?: string;
    resultDigest?: string;
    clampedFields?: string[];
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
  const distance = prompt
    .replace(/\bfive\b/gi, "5")
    .match(/(?:within|radius(?: of)?)\s*(\d+(?:\.\d+)?)\s*([a-z]+)?/i);
  if (distance && !/^(?:miles?|mi)$/i.test(distance[2] ?? ""))
    throw new DomainError(
      "UNSUPPORTED_TOOL",
      "Specify miles for the radius, or use the current map controls.",
    );
  if (
    /ignore\s+(?:all\s+)?(?:previous|prior|system)|system\s*prompt|developer\s*message|override\s+(?:limits|instructions)|exfiltrat|tool\s*instructions|invent\s+(?:results|properties)|jailbreak/i.test(
      prompt,
    )
  )
    throw new DomainError(
      "UNSUPPORTED_TOOL",
      "Evidence instructions cannot be overridden and records cannot be invented.",
    );
  const text = prompt
    .toLowerCase()
    .replace(/\bfive\b/g, "5")
    .replace(/\bfifteen\b/g, "15")
    .replace(/\bten\b/g, "10");
  if ((base.minOwnershipYears ?? 0) > 0)
    throw new DomainError(
      "UNSUPPORTED_TOOL",
      "Complete ownership tenure is not established by the available source. Use the distinct reported-sale observation filter instead.",
    );
  const query: QueryInput = { ...base, cursor: undefined };
  const reportedSaleYears = text.match(
    /(?:last\s+(?:observed\s+)?reported\s+sale|reported\s+sale(?:\s+observed)?)[^.]*?(?:older than|over|more than)\s+(\d+)\s*years?/,
  );
  if (reportedSaleYears)
    query.minReportedSaleAgeYears = Number(reportedSaleYears[1]);
  if (
    /\b(?:ownership|tenure|owned|ownership transfer|exchanged ownership)\b/.test(
      text,
    ) &&
    /\b(?:years?|decade)\b/.test(text) &&
    !reportedSaleYears
  )
    throw new DomainError(
      "UNSUPPORTED_TOOL",
      "Complete ownership tenure is not established. Ask for the last reported sale observed in the available partial source instead.",
    );
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
    /(?:within|radius(?: of)?)\s*(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/,
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
/** The model route and deterministic fallback share the same active-map/page bounds. */
export function boundedEvidenceQuery(
  prompt: string,
  base: QueryInput,
  maxRows = 50,
) {
  const current = QuerySchema.parse(base),
    requested = QuerySchema.parse(interpretPrompt(prompt, base));
  return QuerySchema.parse({
    ...requested,
    radiusMeters: Math.min(current.radiusMeters, requested.radiusMeters),
    limit: Math.min(current.limit, requested.limit, maxRows),
    cursor: undefined,
  });
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
  const query = boundedEvidenceQuery(prompt, base);
  const data = await reader.search(query);
  return answerFromEvidence(data, query);
}
/** Render only already retrieved server evidence; fallback needs no extra read when the model has exhausted its tool budget. */
export function answerFromEvidence(
  data: SearchResponse,
  query: QueryInput,
  mode: AgentAnswer["mode"] = "deterministic-offline",
): AgentAnswer {
  if (data.snapshotId !== query.snapshotId)
    throw new DomainError("SNAPSHOT_UNAVAILABLE", "Evidence snapshot mismatch");
  const citations = [
    ...new Set(
      data.rows.flatMap((p) =>
        propertyEvidence(p).map((s) => `${s.sourceId}:${s.recordId}`),
      ),
    ),
  ];
  const unknown = data.rows.filter((p) => p.roof.ageYears === null).length;
  return {
    mode,
    query,
    results: data.rows,
    citations,
    caveats: [
      ...data.limitations,
      mode === "bedrock-tool-routed"
        ? "One bounded model call routed the search. All displayed facts, counts and citations are rendered from server-retrieved records; source rows were not sent to the model."
        : mode === "deterministic-fallback"
          ? "The model did not produce an accepted route. This response uses deterministic evidence fallback; it is not a model success."
          : "This response uses deterministic retrieval, with no model inference. Snapshot coverage and unavailable evidence remain explicit.",
      ...(unknown
        ? [`${unknown} returned properties have unknown roof age.`]
        : []),
      "Building year is a low-confidence roof proxy, not a roof installation or replacement date. Issued alone is not open; duration requires explicit open status and a date.",
      "No contractor identity, license or rating is inferred from a reported name. Missing acquired permits do not prove no permit exists.",
    ],
    answer: `I found ${data.total} matching ${data.total === 1 ? "property" : "properties"} within ${(query.radiusMeters / 1609.344).toFixed(1)} miles. ${query.roofMinAgeYears !== undefined ? `Roof-age threshold: ${query.roofMinAgeYears} years. ` : ""}${query.permitStatus === "open" ? `Open permits${query.minOpenDays ? ` for at least ${query.minOpenDays} days` : ""}. ` : query.permitStatus === "closed" ? "Closed permits. " : ""}${query.minReportedSaleAgeYears !== undefined ? `Last reported sale observed more than ${query.minReportedSaleAgeYears} years ago; this is partial observed history, not uninterrupted ownership tenure. ` : ""}This bounded page contains ${data.rows.length} records. Snapshot ${data.snapshotId}; query ${data.queryHash}. Review each source and confidence before qualifying a lead.`,
    toolTrace: [
      {
        tool: "searchRoofingEvidence",
        queryHash: data.queryHash,
        snapshotId: data.snapshotId,
        resultCount: data.rows.length,
        totalMatched: data.total,
        arguments: query,
      },
    ],
  };
}
