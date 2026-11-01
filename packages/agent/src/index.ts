import type { ProviderFailureDiagnostic } from "./provider-failure";
import type { RoutingArchitecture } from "./architecture";
import {
  propertyMatchesQuery,
  permitMatchesQuery,
  compareQueryRows,
  qualifyingPermitSignals,
} from "../../contracts/src/query-predicates";
import { resolveQueryPlace } from "../../places/src/index";
import { requireIntent } from "./intent";
import type { IntentOptions, IntentPlan } from "./intent/types";
import type { GroundedFailureDetail } from "./failure-detail";
import { propertyEvidence } from "../../map-domain/src/signals";
import { tool } from "ai";
import {
  DomainError,
  QuerySchema,
  SearchResponseSchema,
  type QueryInput,
  type SearchResponse,
} from "../../contracts/src/index";
import type { OracleReader } from "../../oracle-client/src/index";
export interface PermitAnswerSection {
  kind: "confirmed_open" | "status_verification_needed";
  label: string;
  query: QueryInput;
  queryHash: string;
  total: number;
  returnedCount: number;
  truncated: boolean;
  nextCursor: string | null;
  results: SearchResponse["rows"];
  citations: string[];
  caveats: string[];
}
export interface AgentAnswer {
  intent?: IntentPlan;
  sourceQualifiedAlternativeSections?: true;
  permitSections?: PermitAnswerSection[];
  modelAudit?: {
    modelId: string;
    region: "us-east-2";
    promptRevision: "base" | "repair-1";
    promptDigest: string;
    architecture?: RoutingArchitecture;
    evidenceDigest?: string;
    minimizedRowCount?: number;
    inputTokens: number;
    outputTokens: number;
    converseCalls: number;
    reservedMicroUsd: number;
    measuredMicroUsd: number;
    failureCode?: string;
    failureDetail?: GroundedFailureDetail;
    providerFailure?: ProviderFailureDiagnostic;
    unmeasuredCalls?: number;
  };
  mode:
    | "deterministic-offline"
    | "deterministic-fallback"
    | "bedrock-grounded"
    | "evidence-empty";
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
    modelSawMinimizedFacts?: boolean;
    evidenceDigest?: string;
    minimizedRowCount?: number;
    retrievedRowCount?: number;
    selectedOrdinals?: number[];
    rationaleCategories?: string[];
    rationaleSource?: "server-minimized-facts";
    presentationProtocol?: RoutingArchitecture;
    presentationTool?: "retrieveProperties" | "selectGroundedEvidence";
    retrievalReads?: number;
    constraintDigest?: string;
    presentationArgumentsDigest?: string;
    providerArgumentsDigest?: string;
    argumentsDigest?: string;
    resultDigest?: string;
    clampedFields?: string[];
  }[];
}
export { interpretIntent, requireIntent, IntentRejection } from "./intent";
export type {
  IntentPlan,
  ConstraintLedgerEntry,
  PlaceResolver,
} from "./intent/types";
export function interpretPrompt(
  prompt: string,
  base: QueryInput,
  options: IntentOptions = {},
): QueryInput {
  return requireIntent(prompt, base, options).query;
}
/** Explicit constraints are honored or refused; no implicit radius/page min-clamping. */
export function boundedEvidenceQuery(
  prompt: string,
  base: QueryInput,
  maxRows = 50,
  options: IntentOptions = {},
) {
  return requireIntent(prompt, base, { ...options, maxRows }).query;
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
  options: IntentOptions = {},
): Promise<AgentAnswer> {
  const intent = requireIntent(prompt, base, options);
  const data = await reader.search(intent.query);
  assertIntentSourceAssessment(data, intent);
  const answer = answerFromEvidence(data, intent.query);
  const candidateQuery = verificationAlternativeQuery(intent);
  if (candidateQuery && data.rows.length === 0) assertCompleteStrictZero(data);
  if (data.total === 0 && candidateQuery) {
    assertCompleteStrictZero(data);
    const candidates = SearchResponseSchema.parse(
      await reader.search(candidateQuery),
    );
    return withIntent(
      withPermitAlternativeSections(answer, data, candidates, candidateQuery),
      intent,
    );
  }
  return withIntent(answer, intent);
}
/** Alternatives are server-derived only for the explicit calendar-age open request. */
export function verificationAlternativeQuery(
  intent: IntentPlan,
): QueryInput | undefined {
  const query = intent.query;
  if (
    !query ||
    query.permitOpportunityMode !== "confirmed_open" ||
    query.minPermitObservationAgeYears === undefined ||
    (query.minOpenDays ?? 0) > 0 ||
    intent.ledger.some(
      (entry) =>
        entry.origin === "prompt" &&
        entry.material &&
        entry.classification === "applied" &&
        entry.typedField === "minOpenDays",
    ) ||
    !intent.ledger.some(
      (entry) =>
        entry.origin === "prompt" &&
        entry.material &&
        entry.classification === "applied" &&
        entry.normalizedMeaning === "strict_open_with_verification_alternative",
    )
  )
    return undefined;
  const explicitSort = intent.ledger.some(
    (entry) =>
      entry.origin === "prompt" &&
      entry.material &&
      entry.classification === "applied" &&
      entry.typedField === "sort",
  );
  if (explicitSort && query.sort === "permit_open_days_desc") return undefined;
  return QuerySchema.parse({
    ...query,
    permitOpportunityMode: "status_verification_needed",
    permitStatus: "any",
    minOpenDays: 0,
    sort: explicitSort ? query.sort : "permit_issue_age_desc",
    cursor: undefined,
  });
}
export function assertCompleteStrictZero(data: SearchResponse): void {
  if (
    data.total !== 0 ||
    data.rows.length !== 0 ||
    data.truncated ||
    data.nextCursor
  )
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Verification alternatives require a complete strict zero-match response",
    );
}
function permitSection(
  data: SearchResponse,
  query: QueryInput,
  kind: PermitAnswerSection["kind"],
): PermitAnswerSection {
  assertEvidencePredicates(data, query);
  if (
    data.total < data.rows.length ||
    data.rows.length > (query.limit ?? 50) ||
    (!query.cursor &&
      data.rows.length !== Math.min(data.total, query.limit ?? 50))
  )
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Permit section did not retain its complete bounded page/count",
    );
  const signals = data.rows.flatMap((row) =>
    qualifyingPermitSignals(row, query),
  );
  return {
    kind,
    label:
      kind === "confirmed_open"
        ? "Confirmed open permits"
        : "Status verification needed",
    query,
    queryHash: data.queryHash,
    total: data.total,
    returnedCount: data.rows.length,
    truncated: data.truncated,
    nextCursor: data.nextCursor,
    results: data.rows,
    citations: [
      ...new Set(
        signals.map(
          (signal) =>
            `${signal.provenance.sourceId}:${signal.provenance.recordId}`,
        ),
      ),
    ],
    caveats: [
      ...new Set([
        ...data.limitations,
        ...signals.flatMap((signal) => signal.limitations),
        ...(kind === "status_verification_needed"
          ? [
              "These are not confirmed open permits; they are older permit records whose current lifecycle status requires municipal verification.",
              "Age since issue/filed/status uses the same observation's source assessment date, not continuous open duration. A listed party is not a verified contractor without explicit evidence.",
            ]
          : []),
      ]),
    ],
  };
}
/** Primary evidence stays strict; the second query and its rows are never substituted. */
export function withPermitAlternativeSections(
  answer: AgentAnswer,
  strict: SearchResponse,
  candidates: SearchResponse,
  candidateQuery: QueryInput,
): AgentAnswer {
  assertCompleteStrictZero(strict);
  const allowedSort =
    candidateQuery.sort === "permit_issue_age_desc" ||
    (candidateQuery.sort === answer.query.sort &&
      candidateQuery.sort !== "permit_open_days_desc");
  const expected = QuerySchema.parse({
    ...answer.query,
    permitOpportunityMode: "status_verification_needed",
    permitStatus: "any",
    minOpenDays: 0,
    sort: candidateQuery.sort,
    cursor: undefined,
  });
  if (
    answer.query.permitOpportunityMode !== "confirmed_open" ||
    answer.query.minPermitObservationAgeYears === undefined ||
    (answer.query.minOpenDays ?? 0) > 0 ||
    !allowedSort ||
    JSON.stringify(QuerySchema.parse(candidateQuery)) !==
      JSON.stringify(expected)
  )
    throw new DomainError(
      "INVALID_INPUT",
      "Verification query crossed the strict source/geography/age boundary",
    );
  assertEvidencePredicates(strict, answer.query);
  const confirmed = permitSection(strict, answer.query, "confirmed_open");
  const verification = permitSection(
    candidates,
    candidateQuery,
    "status_verification_needed",
  );
  const candidateAnswer = answerFromEvidence(candidates, candidateQuery);
  return {
    ...answer,
    mode: "deterministic-offline",
    sourceQualifiedAlternativeSections: true,
    permitSections: [confirmed, verification],
    answer: `Confirmed open permits: 0. Status verification needed: ${verification.total} matching properties; this page contains ${verification.returnedCount}. These are not confirmed open permits; their current lifecycle status requires municipal verification.`,
    caveats: [
      ...answer.caveats,
      "The separate verification query is deterministic server evidence; no model call was made for these alternatives.",
    ],
    toolTrace: [...answer.toolTrace, candidateAnswer.toolTrace[0]],
  };
}
/** One typed plan is attached to every success, empty result and deterministic fallback. */
export function withIntent(
  answer: AgentAnswer,
  intent: IntentPlan,
): AgentAnswer {
  return {
    ...answer,
    intent,
    caveats: [
      ...answer.caveats,
      ...(intent.ledger.some(
        (x) => x.normalizedMeaning === "long_duration_priority",
      )
        ? [
            "Long-open priority orders observed durations; no numeric minimum or stalled-work claim was requested or invented.",
          ]
        : []),
    ],
  };
}
/** Calendar issue-age and native-interval clauses bind both reads to the release's source assessment date. */
export function assertIntentSourceAssessment(
  data: SearchResponse,
  intent: IntentPlan,
): void {
  const anchor = intent.ledger.find(
    (entry) =>
      entry.typedField === "sourceAssessmentDate" &&
      entry.material &&
      entry.classification === "applied",
  )?.typedValue;
  if (typeof anchor !== "string") return;
  const query = intent.query;
  if (
    !query ||
    data.rows.some(
      (row) =>
        !row.permits.some((permit) =>
          (permit.sourceObservations ?? []).some(
            (observation) =>
              observation.assessmentAt.slice(0, 10) === anchor &&
              permitMatchesQuery(
                { ...permit, sourceObservations: [observation] },
                query,
                row.roof.asOf,
              ),
          ),
        ),
    )
  )
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Source assessment date does not match the pinned calendar query anchor",
    );
}
/** Business-predicate check independent of interpreting the same query; invalid backend rows cannot become model context or fallback matches. */
export function assertEvidencePredicates(
  data: SearchResponse,
  query: QueryInput,
) {
  if (data.snapshotId !== query.snapshotId)
    throw new DomainError("SNAPSHOT_UNAVAILABLE", "Evidence snapshot mismatch");
  const place = resolveQueryPlace(query);
  if (
    (place && JSON.stringify(data.placeResolution) !== JSON.stringify(place)) ||
    (!place && data.placeResolution)
  )
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Evidence did not retain the validated official place binding",
    );
  if (data.rows.some((row) => !propertyMatchesQuery(row, query)))
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Retrieved evidence violated a validated source predicate (radius, roof, owner, sale or qualifying permit evidence)",
    );
  if (
    data.rows.some(
      (row, i) => i > 0 && compareQueryRows(data.rows[i - 1], row, query) > 0,
    )
  )
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Retrieved evidence violated the authoritative result order",
    );
}
/** Render only already retrieved server evidence; fallback needs no extra read when the model has exhausted its tool budget. */
export function answerFromEvidence(
  data: SearchResponse,
  query: QueryInput,
  mode: AgentAnswer["mode"] = "deterministic-offline",
  selectedOrdinals?: number[],
): AgentAnswer {
  assertEvidencePredicates(data, query);
  if (
    selectedOrdinals &&
    (mode !== "bedrock-grounded" ||
      new Set(selectedOrdinals).size !== selectedOrdinals.length ||
      selectedOrdinals.some(
        (n) => !Number.isInteger(n) || n < 0 || n >= data.rows.length,
      ) ||
      (data.rows.length > 0 && selectedOrdinals.length === 0) ||
      (query.sort &&
        selectedOrdinals.some((n, i) => i > 0 && n <= selectedOrdinals[i - 1])))
  )
    throw new DomainError(
      "INVALID_INPUT",
      "Invalid selected source ordinals or result order",
    );
  const rows = selectedOrdinals
    ? selectedOrdinals.map((n) => data.rows[n])
    : data.rows;
  if (data.snapshotId !== query.snapshotId)
    throw new DomainError("SNAPSHOT_UNAVAILABLE", "Evidence snapshot mismatch");
  if (
    mode === "evidence-empty" &&
    (data.total !== 0 ||
      data.rows.length !== 0 ||
      data.truncated ||
      data.nextCursor)
  )
    throw new DomainError(
      "SNAPSHOT_UNAVAILABLE",
      "Empty evidence mode requires a complete zero-match response",
    );
  const citations = [
    ...new Set(
      rows.flatMap((p) =>
        propertyEvidence(p).map((s) => `${s.sourceId}:${s.recordId}`),
      ),
    ),
  ];
  const unknown = rows.filter((p) => p.roof.ageYears === null).length;
  return {
    mode,
    query,
    results: rows,
    citations,
    caveats: [
      ...data.limitations,
      mode === "bedrock-grounded"
        ? "One bounded model call requested the exact approved read-only retrieval. The model received no source rows; the server validates all constraints, preserves result order and renders authoritative facts and citations. Match and retrieved-page counts remain distinct."
        : mode === "evidence-empty"
          ? "No matching source records were returned by this bounded query. The model was not called; this is source evidence, not a model success or proof of permit absence."
          : mode === "deterministic-fallback"
            ? "The model did not produce an accepted typed retrieval. This response uses deterministic evidence fallback; it is not a model success."
            : "This response uses deterministic retrieval, with no model inference. Snapshot coverage and unavailable evidence remain explicit.",
      ...(unknown
        ? [`${unknown} returned properties have unknown roof age.`]
        : []),
      "Building year is a low-confidence roof proxy, not a roof installation or replacement date. Issued alone is not open; duration requires explicit open status and a date.",
      "No contractor identity, license or rating is inferred from a reported name. Missing acquired permits do not prove no permit exists.",
    ],
    answer: `I found ${data.total} matching ${data.total === 1 ? "property" : "properties"} within ${query.radiusMeters / 1609.344} miles. ${query.roofMinAgeYears !== undefined ? `Roof-age threshold: ${query.roofMinAgeYears} years. ` : ""}${query.permitStatus === "open" ? `Source-qualified open/currently active permit observations${query.minOpenDays ? ` with independently documented native open interval of at least ${query.minOpenDays} days` : ""}. ` : query.permitStatus === "closed" ? "Closed permits. " : query.permitStatus === "unknown" ? "Acquired permit status unknown. " : ""}${query.minPermitObservationAgeYears !== undefined ? `Permit observation age strictly exceeds ${query.minPermitObservationAgeYears} source-calendar years at its own assessment date; not continuous open duration. ` : ""}${query.minReportedSaleAgeYears !== undefined ? `Last reported sale observed more than ${query.minReportedSaleAgeYears} years ago; this is partial observed history, not uninterrupted ownership tenure. ` : ""}${query.providerPermitStatus !== undefined ? `Provider-normalized permit status: ${query.providerPermitStatus}; native status is independently qualified. ` : ""}${query.permitActivityClaim !== undefined ? `Activity evidence: ${query.permitActivityClaim.replaceAll("_", " ")}. ` : ""}${query.minPermitAgeSinceIssueDays !== undefined ? `Age since issue at least ${query.minPermitAgeSinceIssueDays} days at the source assessment date; not continuous open duration. ` : ""}${query.minRecordedDeedGapYears !== undefined ? `No observed recorded deed for more than ${query.minRecordedDeedGapYears} years within each documented current-PIN index window through its verified date; this does not establish legal ownership continuity. ` : ""}This bounded page contains ${rows.length} records. Snapshot ${data.snapshotId}; query ${data.queryHash}. Review each source and confidence before qualifying a lead.`,
    toolTrace: [
      {
        tool: "searchRoofingEvidence",
        queryHash: data.queryHash,
        snapshotId: data.snapshotId,
        resultCount: rows.length,
        totalMatched: data.total,
        arguments: query,
      },
    ],
  };
}
