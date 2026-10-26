// T014 (B-09, Phase 2 Foundational): port interfaces only, no adapters (ADR-06 §10 pattern #1,
// docs/decisions/0000-agent-architecture.md; plan.md "Patterns the code must show" #1 — "Ports
// before adapters"). Adapters (gazetteer-backed PlaceResolver, AgentCore/DynamoDB
// ConversationEventStore, the review-record store, the OTel/X-Ray/LangSmith TraceSink) are built
// in later phases; this file fixes the shape every adapter and every unit test's fixture must
// satisfy, so a test can run a service against a `Fixture` adapter with no AWS involved
// (build-rag-systems skill, Phase 4 "Implement retrieval interfaces").

/** One candidate place the resolver considered, carrying enough to compute the ADR-06 §5
 *  confidence bands (score + the margin to the runner-up) without the caller re-deriving them. */
export interface PlaceCandidate {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly match: "exact" | "alias" | "fuzzy" | "zip" | "user_point";
  readonly score: number;
}

/** `status` reflects the ADR-06 §5 flow up to, but not including, the confidence-band decision
 *  itself (`thresholds.ts`'s `classifyPlaceConfidence` makes that call from `candidates`):
 *  `resolved` when the gazetteer found at least one in-scope candidate, `out_of_scope` for a
 *  known non-Travis place or a ZIP outside the Travis ZCTA list. */
export interface PlaceResolution {
  readonly status: "resolved" | "out_of_scope";
  /** Ordered best-first; at most 3 (ADR-06 §4/§6.2's `resolvePlace` tool contract). */
  readonly candidates: readonly PlaceCandidate[];
  /** The gazetteer package + version this resolution came from (ADR §4's `area.resolved.source`,
   *  e.g. `"travis-places@1.0.0"`), so every `QueryPlan.area.resolved.source` is provenance, not
   *  a guess. */
  readonly source: string;
}

/** Normalise -> exact-alias -> fuzzy -> filter -> rank (ADR §5/§10 pattern #3). One adapter wraps
 *  `packages/oracle-views/gazetteer/travis-places@1.0.0`; a test adapter returns fixed
 *  `PlaceResolution`s with no gazetteer involved. */
export interface PlaceResolver {
  resolve(text: string): Promise<PlaceResolution>;
}

export type ConversationEventType = "user_turn" | "plan" | "tool_call" | "answer";

/** One event in a thread's history (ADR §6.1: "the user turn, the QueryPlan, the tool calls with
 *  result-set ids — not the rows — and the answer"). `data` is intentionally untyped here: each
 *  event type's own shape (the `QueryPlan`, the `AgentAnswer`, a tool-call summary) is defined
 *  where that type lives, not duplicated in the port. */
export interface ConversationEvent {
  readonly type: ConversationEventType;
  readonly at: string;
  readonly data: unknown;
}

/** `sessionId = threadId`, `actorId = Cognito sub` (ADR §6.1) map 1:1 to AgentCore Memory's own
 *  field names, so a later swap from the DynamoDB fallback adapter to the AgentCore adapter needs
 *  no event-shape change (data-model.md "New this round: conversation memory"). `clientToken`
 *  (e.g. `${requestId}:${ordinal}`) makes `append` idempotent under a duplicate delivery. */
export interface ConversationEventStore {
  append(
    sessionId: string,
    actorId: string,
    event: ConversationEvent,
    clientToken: string,
  ): Promise<void>;
  /** Most recent events first, oldest-to-newest truncation at `limit` — enough for the "load the
   *  last QueryPlan for a follow-up" pattern (ADR §6.3) without loading the whole thread. */
  recent(sessionId: string, limit: number): Promise<readonly ConversationEvent[]>;
}

/** Written only when the user runs a plan after editing an assumption chip, or marks an answer
 *  helpful (ADR §4's `INTERP#{hash(normalisedQuestion)}`) — never written automatically from an
 *  unreviewed model output. */
export interface InterpretationRecord {
  readonly normalisedQuestion: string;
  /** The accepted `QueryPlan`, kept untyped here for the same reason as `ConversationEvent.data`
   *  — this port does not import `packages/shared/src/agent/queryPlan.ts` to avoid a cycle. */
  readonly acceptedPlan: unknown;
  readonly acceptedBy: string;
  readonly at: string;
  readonly manifestCid: string;
  readonly promptVersion: string;
}

/** A gazetteer alias learned from a review (ADR §4's `ALIAS#{normalisedText}`). Review-gated:
 *  written only after a human confirms the mapping, never auto-promoted from a single fuzzy hit. */
export interface AliasRecord {
  readonly normalisedText: string;
  readonly placeId: string;
  readonly reviewedBy: string;
  readonly at: string;
}

/** `note` is capped and never sent to the model (ADR §4: "free-text note (<=500 chars), never
 *  sent to the model"). */
export interface FeedbackRecord {
  readonly traceId: string;
  readonly vote: "up" | "down";
  readonly reason?: string;
  readonly note?: string;
}

/** The write path for review and correction records (ADR §7; data-model.md "New this round:
 *  review/learning records" — this round builds the write path only). `similarInterpretations`
 *  is the read side the planner's few-shot examples use (ADR §7's trigram-similarity lookup,
 *  capped and versioned by `promptVersion`), kept here rather than duplicated per adapter. */
export interface ReviewStore {
  recordInterpretation(record: InterpretationRecord): Promise<void>;
  recordAlias(record: AliasRecord): Promise<void>;
  recordFeedback(record: FeedbackRecord): Promise<void>;
  similarInterpretations(
    normalisedQuestion: string,
    limit: number,
  ): Promise<readonly InterpretationRecord[]>;
}

/** One telemetry event, keyed by the turn's `traceId` so every record (log, metric, trace) can
 *  be correlated after the fact. */
export interface TraceEvent {
  readonly traceId: string;
  readonly name: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** AI SDK `experimental_telemetry` -> OpenTelemetry -> X-Ray always, plus a LangSmith adapter
 *  when `LANGSMITH_API_KEY` is in Secrets Manager (ADR §6.1). `flush()` must run before the
 *  procedure returns — never fire-and-forget, or a short-lived Lambda can drop the last events. */
export interface TraceSink {
  record(event: TraceEvent): void;
  flush(): Promise<void>;
}
