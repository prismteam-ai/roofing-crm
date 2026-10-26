// @crm/shared: UI wording and Zod schemas shared by apps/web and apps/api (plan.md § Project
// Structure). Browser-safe: no node: imports, no env reads.
//
// B-01 correction (run-log.md): the copied `labels.ts`/`urls.ts` (and their tests) depended on
// `@crm/contract`, a vendored copy of Task A's contract (architecture-constitution.md §9's
// `packages/oracle-contract`) that T001 never copies into this repo — B-01 reads no property,
// permit, contractor or BBB data at all (data-model.md, constitution Task-B addendum B1), so
// nothing in this story needs those provenance-label helpers. They are removed here, not ported,
// and return when the story that actually vendors `packages/oracle-contract` needs them.
export { SOURCE_LABELS, isSourceName, sourceLabel, type SourceName } from "./sources.js";
export { UNDO_WINDOW_MS } from "./leads/undoWindow.js";
export {
  contractorSnapshot,
  isFinaledPermit,
  isLivePermit,
  LIVE_PERMIT_STATUS_CLASSES,
  mainLeadPermit,
  permitStatusClassesFor,
  type ContractorSnapshot,
  type ContractorSnapshotSource,
  type LeadPermitLike,
} from "./leads/mainLeadPermit.js";
export { Session } from "./schemas/session.js";
export {
  ROADMAP_SECTIONS,
  RoadmapSection,
  type RoadmapSectionMeta,
} from "./schemas/roadmap-section.js";
export {
  LEAD_STATUSES,
  Lead,
  LeadEvent,
  LeadFilters,
  LeadLastActivity,
  LeadSignals,
  LeadStatus,
} from "./schemas/lead.js";
export { QueryPlan } from "./agent/queryPlan.js";
export {
  asksToContactOwners,
  isOutboundConstraint,
  OUTBOUND_CONSTRAINT,
  OUTBOUND_REFUSAL_TEXT,
} from "./agent/outbound.js";
export { AgentAnswer, AnswerRow, answerPins, type AnswerPin } from "./agent/answer.js";
export { AGENT_TURN_LIMIT_MS } from "./agent/limits.js";
export {
  classifyPlaceConfidence,
  PLACE_CONFIDENCE_BANDS,
  PLACE_CONFIDENCE_BANDS_VERSION,
  type PlaceConfidenceBand,
} from "./agent/thresholds.js";
export type {
  AliasRecord,
  ConversationEvent,
  ConversationEventStore,
  ConversationEventType,
  FeedbackRecord,
  InterpretationRecord,
  PlaceCandidate,
  PlaceResolution,
  PlaceResolver,
  ReviewStore,
  TraceEvent,
  TraceSink,
} from "./rag/ports.js";
