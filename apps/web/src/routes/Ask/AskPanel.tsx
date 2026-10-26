// B-09 T039/T040 + review fixes (CR-B-09 finding 16/finding 20) + Ask in the map: the Ask panel, the map's AI mode
// (CRM-HANDOFF 4.7; a pane at 1280 px and up, the results sheet below), also the old Ask screen (contracts/agent-api.md;
// agent-design.md smeargle §1/§4). A rep types a plain-language question; `agent.ask` returns a
// grounded, cited `AgentAnswer` (packages/shared/src/agent/answer.ts) rendered claim-by-claim with
// its own citations — never a result the API didn't actually return. Creating a lead from a
// proposal calls `agent.confirmLead` only after an explicit "Create lead" click, never
// automatically (ADR §6.2 G7; the model's own tool set has no path to `LeadService.create`).
//
// Design: the Ask boards design/prototype/CrmAsk390/768/1440 (answer), CrmAskWorking390 +
// CrmAgentWorking390/1440 (working), CrmAskNoResults390, CrmAskLowConf390, CrmAskOutside390,
// CrmAskNotFound390, CrmAskThrottled390, CrmAskPaused390 / CrmAgentPaused390, CrmAskSlow390 /
// CrmAgentSlow390/1440, CrmAskConfirm*/CrmAskCreated390/CrmAskCreateFailed390 (create lead). All of
// them `dc-import` the shared Explore1440 board with a `crmask*` / `ai*` preset.
//
// `data-state` mapping (T040, agent-design.md smeargle §4) — a closed set the Playwright suite
// (tests/e2e/responsive/ask.spec.ts) asserts against verbatim. `OUTCOME_STATE` is the single
// source of truth:
//   idle            nothing asked yet this screen load
//   working         the `agent.ask` mutation is in flight, no response yet
//   answer          outcome === "answered"
//   no_results      outcome === "empty_in_scope" | "field_not_published"
//   low_confidence  outcome === "needs_clarification" (candidate places as buttons)
//   out_of_scope    outcome === "out_of_scope"
//   not_found       outcome === "not_found"
//   throttled       outcome === "rate_limited"  (countdown from `retryAfterSec`)
//   paused          outcome === "paused"        (reset time from `resetsAt`)
//   timed_out       outcome === "timed_out"
//   error           the `agent.ask` call itself failed (no answer)
//
// Accessibility: one polite live region (`role="status"`) announces "working" and then the result
// heading; focus moves to that heading when the result arrives. Limit banners are `role="alert"`.
import { answerPins, OUTBOUND_REFUSAL_TEXT, type AgentAnswer } from "@crm/shared";
import { missingReasonLabel } from "@crm/oracle-contract";
import {
  CidDisplay,
  formatUtc,
  Icon,
  MissingList as SharedMissingList,
  Provenance,
  StatusPill,
} from "@crm/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import {
  useAskAgent,
  useConfirmLead,
  useConfirmLeads,
  useRunInfo,
  useUndoCreate,
  useUndoCreatedLeads,
} from "./askApi.js";
import { bulkSummary } from "../Map/Candidates/bulkCreate.js";
import { Snackbar, snackbarActionClass } from "../Map/Candidates/Snackbar.js";
import { AnswerMatches } from "../Map/AnswerMatches.js";
import { safeSourceHref, SourceLink } from "../Map/SourceLink.js";
import { UndoStatusRow } from "../Map/Candidates/UndoStatusRow.js";
import { undoOneText, undoSummary } from "../Map/Candidates/undoCopy.js";
import { AskConfirmSheet, type AskConfirmRow } from "./AskConfirmSheet.js";
import {
  AGENT_TURN_LIMIT_SEC,
  clarifyQuestion,
  composerNote,
  confirmErrorCopy,
  coverageNote,
  emptyExplanation,
  exclusionNotes,
  fieldNotPublishedText,
  hasModelPlan,
  isOutboundRefusal,
  answerMatchTotal,
  missingGroups,
  nextRadius,
  offersWiden,
  pausedText,
  pinsNote,
  placeOf,
  planSummary,
  rowSignal,
  SUGGESTION_GROUPS,
  throttleText,
  timedOutText,
  widenQuestion,
} from "./askCopy.js";
import styles from "./Ask.module.css";

type AskState =
  | "idle"
  | "working"
  | "answer"
  | "no_results"
  | "low_confidence"
  | "out_of_scope"
  | "not_found"
  | "throttled"
  | "paused"
  | "timed_out"
  | "error";

/** The one source of truth for outcome -> UI state (see header comment). */
export const OUTCOME_STATE: Readonly<Record<AgentAnswer["outcome"], AskState>> = {
  answered: "answer",
  empty_in_scope: "no_results",
  field_not_published: "no_results",
  needs_clarification: "low_confidence",
  out_of_scope: "out_of_scope",
  not_found: "not_found",
  rate_limited: "throttled",
  paused: "paused",
  timed_out: "timed_out",
};

/** The result heading per outcome (focused and announced when the result arrives). */
function headingOf(answer: AgentAnswer): string {
  switch (answer.outcome) {
    case "answered":
      return "Answer";
    case "empty_in_scope":
      return "No matches";
    case "field_not_published":
      return "Not in the published data";
    case "needs_clarification":
      return answer.candidates === undefined
        ? "I couldn't read that question"
        : "Which place did you mean?";
    case "out_of_scope":
      return isOutboundRefusal(answer)
        ? "Messaging owners is not available"
        : missingReasonLabel("out_of_scope");
    case "not_found":
      return "Place not found";
    case "rate_limited":
      return "Too many questions in a short time";
    case "paused":
      return "Asking is paused for today";
    case "timed_out":
      return "Took too long";
  }
}

const ERROR_HEADING = "The agent could not answer";

/** The longest question the box (and `agent.ask`'s input) accepts. */
const MAX_QUESTION_LENGTH = 500;

/** The `?q=` text the first-visit card's example links carry: trimmed, and ignored when empty or
 *  longer than the box allows (never silently cut into a different question). */
export function prefillFrom(param: string | null): string {
  const text = (param ?? "").trim();
  return text === "" || text.length > MAX_QUESTION_LENGTH ? "" : text;
}

/** Whole seconds since `active` turned on (the Working… timer); 0 while inactive. */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return active ? seconds : 0;
}

/** Counts `from` down to 0, once per second, restarting whenever `key` changes. */
function useCountdown(from: number | undefined, key: unknown): number | undefined {
  const [left, setLeft] = useState(from);
  useEffect(() => {
    setLeft(from);
    if (from === undefined || from <= 0) return undefined;
    const id = setInterval(() => {
      setLeft((s) => {
        const next = (s ?? 0) - 1;
        if (next <= 0) clearInterval(id);
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [from, key]);
  return left;
}

type Citation = AgentAnswer["citations"][number];
type Claim = AgentAnswer["claims"][number];
type Proposal = NonNullable<AgentAnswer["proposals"]>[number];

/** Claims carry no id on the wire: key by their citations plus text, plus the position only to
 *  break an exact duplicate — stable for a given answer, unlike a bare array index. */
function claimIds(claims: readonly Claim[]): string[] {
  const seen = new Map<string, number>();
  return claims.map((claim) => {
    const base = `${claim.citationIds.join(".")}|${claim.text}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

/** The citations the claims actually use, numbered 1..n in first-cited order (CrmAsk390/768/1440:
 *  "[1–3]" in the text ↔ the numbered rows below). Uncited citations are not listed. */
function numberSources(
  claims: readonly Claim[],
  citations: readonly Citation[],
): { readonly sources: readonly Citation[]; readonly numberOf: ReadonlyMap<number, number> } {
  const byId = new Map(citations.map((c) => [c.id, c]));
  const numberOf = new Map<number, number>();
  const sources: Citation[] = [];
  for (const claim of claims) {
    for (const id of claim.citationIds) {
      const citation = byId.get(id);
      if (citation === undefined || numberOf.has(id)) continue;
      numberOf.set(id, id); // the pin on the map carries the same number (answerPins: n = citation id)
      sources.push(citation);
    }
  }
  return { sources, numberOf };
}

function kindLabel(kind: Citation["kind"]): string {
  return kind === "property"
    ? "Property"
    : kind === "permit"
      ? "Permit"
      : kind === "place"
        ? "Place"
        : "Run";
}

/** A source row's title: the TCAD account id when the citation carries one (the contract publishes
 *  no street address — CRM-HANDOFF § 9 "the property title is the TCAD account id"), else its kind. */
function sourceTitle(citation: Citation): string {
  if (citation.tcadId === undefined) return kindLabel(citation.kind);
  return citation.kind === "property"
    ? `TCAD ${citation.tcadId}`
    : `${kindLabel(citation.kind)} · TCAD ${citation.tcadId}`;
}

/** What every row needs from the panel: the thread, the focused citation, and the leads the bulk
 *  create already made (so a row says "Lead created" instead of offering Create lead again). */
interface PanelCtx {
  readonly threadId: string;
  readonly focused: number | null;
  readonly onFocus: (n: number | null) => void;
  readonly bulkCreated: ReadonlySet<string>;
  /** Three-pane widths: the Matches rows render into this element (the results pane) instead of
   *  a tab, so the left pane shows the answer and the right pane shows the matches. */
  readonly matchesHost?: HTMLElement | null | undefined;
  /** Opens a matched property's details (the card's "Open details"). */
  readonly onOpen: (propertyCid: string) => void;
}

/** Creating a lead from a proposal is a separate, explicit click — never automatic on receiving
 *  the proposal (ADR §6.2 G7). Typed failures get their own message (CrmAskCreateFailed390). */
function ProposalAction({
  proposal,
  ctx,
}: {
  readonly proposal: Proposal;
  readonly ctx: PanelCtx;
}): ReactElement {
  const { threadId } = ctx;
  const confirmLead = useConfirmLead();
  const undo = useUndoCreate();

  if (proposal.alreadyLead) {
    return <StatusPill status="info" icon="contact_page" text="Already a lead" />;
  }
  if (ctx.bulkCreated.has(proposal.tcadId)) {
    return <StatusPill status="verified" text="Lead created" />;
  }

  const failure = confirmLead.isError ? confirmErrorCopy(confirmLead.error) : undefined;
  const done = confirmLead.isSuccess || failure?.status === "info";
  return (
    <div className={styles.proposalAction}>
      <div className={styles.actionRow}>
        {confirmLead.isSuccess ? (
          <>
            {undo.isSuccess && undo.data.deleted ? (
              <StatusPill status="info" text={undoOneText(undo.data)} />
            ) : (
              <StatusPill status="verified" text="Lead created" />
            )}
            {undo.isSuccess && undo.data.deleted ? null : (
              <Link className={styles.textButton} to="/leads">
                Open Leads
              </Link>
            )}
            {undo.isSuccess && undo.data.deleted ? null : (
              <button
                type="button"
                className={styles.textButton}
                disabled={undo.isPending}
                onClick={() =>
                  undo.mutate({
                    leadKey: confirmLead.data.leadKey,
                    leadId: confirmLead.data.leadId,
                  })
                }
              >
                {undo.isPending ? "Undoing…" : "Undo"}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className={styles.tonalButton}
            disabled={
              confirmLead.isPending || done || (failure !== undefined && !failure.retryable)
            }
            onClick={() => confirmLead.mutate({ threadId, tcadId: proposal.tcadId })}
          >
            <Icon name="person_add" size="medium" />
            {confirmLead.isPending ? "Creating…" : "Create lead"}
          </button>
        )}
      </div>
      {undo.isError || (undo.isSuccess && !undo.data.deleted) ? (
        <p role="status" className={styles.bannerBody}>
          {undoOneText(undo.isError ? "failed" : undo.data)}
        </p>
      ) : null}
      {failure === undefined ? null : failure.status === "info" ? (
        <StatusPill status="info" text={failure.text} />
      ) : (
        <div
          role="alert"
          className={`${styles.banner} ${failure.status === "error" ? styles.danger : styles.warning}`}
        >
          <Icon name={failure.status === "error" ? "error" : "warning"} size="medium" />
          <p className={styles.bannerBody}>{failure.text}</p>
        </div>
      )}
    </div>
  );
}

function SourceRow({
  number,
  citation,
  proposal,
  ctx,
}: {
  readonly number: number;
  readonly citation: Citation;
  readonly proposal: Proposal | undefined;
  readonly ctx: PanelCtx;
}): ReactElement {
  const cid = citation.propertyCid ?? citation.permitCid;
  const href = safeSourceHref(citation.sourceUrl);
  const sourceHref = href !== null && href.startsWith("https:") ? href : null;
  const focused = ctx.focused === number;
  return (
    <li
      id={`ask-source-${number}`}
      className={styles.source}
      data-focused={focused}
      data-citation-kind={citation.kind}
      {...(citation.tcadId === undefined ? {} : { "data-tcad-id": citation.tcadId })}
    >
      <span className={styles.sourceNumber} aria-hidden="true">
        {number}
      </span>
      <div className={styles.sourceBody}>
        <span className={styles.sourceTitle}>
          <span className={styles.srOnly}>{`Source ${number}: `}</span>
          {sourceTitle(citation)}
          {citation.nearPlace === undefined ? null : (
            <span className={styles.sourceNear}>
              {` · near ${citation.nearPlace.name} · ${citation.nearPlace.distanceMi.toFixed(1)} mi`}
            </span>
          )}
        </span>
        {cid === undefined ? null : (
          <span className={styles.sourceCid}>
            {`${kindLabel(citation.kind)} record `}
            <CidDisplay cid={cid} />
          </span>
        )}
        <Provenance>
          {sourceHref === null ? (
            "No source link published"
          ) : (
            <SourceLink url={sourceHref} label={sourceHref} />
          )}
          {` · collected ${formatUtc(citation.capturedAt)} UTC · record CID `}
          <CidDisplay cid={citation.tableCid} />
          {" · manifest "}
          <CidDisplay cid={citation.manifestCid} />
        </Provenance>
        <div className={styles.actionRow}>
          {citation.kind === "property" && citation.propertyCid !== undefined ? (
            <Link
              className={styles.textButton}
              to={`/?sel=${encodeURIComponent(citation.propertyCid)}`}
            >
              <Icon name="location_on" size="medium" />
              Open on map
            </Link>
          ) : null}
        </div>
        {proposal === undefined ? null : <ProposalAction proposal={proposal} ctx={ctx} />}
      </div>
    </li>
  );
}

function ClaimItem({
  id,
  claim,
  numberOf,
  ctx,
}: {
  readonly id: string;
  readonly claim: Claim;
  readonly numberOf: ReadonlyMap<number, number>;
  readonly ctx: PanelCtx;
}): ReactElement {
  const numbers = [
    ...new Set(
      claim.citationIds
        .map((citationId) => numberOf.get(citationId))
        .filter((n): n is number => n !== undefined),
    ),
  ];
  return (
    <li className={styles.claim} data-claim-id={id}>
      {claim.text}
      {numbers.map((n) => (
        <a
          key={n}
          className={styles.citeRef}
          href={`#ask-source-${n}`}
          aria-label={`Source ${n}`}
          data-focused={ctx.focused === n}
          onClick={(event) => {
            // Focus the source (and its pin) without changing the URL: the URL is the map's state.
            event.preventDefault();
            ctx.onFocus(n);
            document
              .getElementById(`ask-source-${String(n)}`)
              ?.scrollIntoView?.({ block: "nearest" });
          }}
        >
          {n}
        </a>
      ))}
    </li>
  );
}

/** The answer-level `missing[]` as the shared bullet list (one bullet per reason, fields joined). */
function MissingList({
  missing,
}: {
  readonly missing: AgentAnswer["missing"];
}): ReactElement | null {
  if (missing.length === 0) return null;
  return <SharedMissingList groups={missingGroups(missing)} />;
}

function Notes({ notes }: { readonly notes: readonly string[] }): ReactElement | null {
  if (notes.length === 0) return null;
  return (
    <ul className={styles.notes}>
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

type AnswerRowT = NonNullable<AgentAnswer["rows"]>[number];

interface PanelCtxFull extends PanelCtx {
  readonly addBulkCreated: (tcadIds: readonly string[]) => void;
}

/** "Widen to {n} mi" (CrmAsk768): re-asks the same question with the next radius step. The server's
 *  `agent.ask` takes text only (a structured plan edit, `area.radiusMi`, is a deferred API change),
 *  so this composes a follow-up question and reruns the model on that new text. */
function WidenChip({
  answer,
  onWiden,
  inline = false,
}: {
  readonly answer: AgentAnswer;
  readonly onWiden: ((miles: number) => void) | undefined;
  /** In the action row beside Create leads / Show on map, instead of a row of its own. */
  readonly inline?: boolean;
}): ReactElement | null {
  const miles = nextRadius(answer.plan.area.radiusMi);
  if (miles === undefined || !offersWiden(answer)) return null;
  const chip = (
    <button
      type="button"
      className={styles.chip}
      disabled={onWiden === undefined}
      onClick={() => onWiden?.(miles)}
    >
      <Icon name="zoom_out_map" size="medium" />
      {`Widen to ${String(miles)} mi`}
    </button>
  );
  return inline ? chip : <div className={styles.chips}>{chip}</div>;
}

/** The yellow coverage note (CrmAsk768), weaker than the board's: the answer carries no
 *  jurisdiction list, so it says where the permits come from and that coverage is not stated. */
function CoverageNote({ text }: { readonly text: string }): ReactElement {
  return (
    <div role="note" aria-label="Permit coverage" className={`${styles.banner} ${styles.warning}`}>
      <Icon name="info" size="medium" />
      <p className={styles.bannerBody}>{text}</p>
    </div>
  );
}

function AnsweredBody({
  answer,
  ctx,
  onShowOnMap,
  onWiden,
  runId,
}: {
  readonly answer: AgentAnswer;
  readonly ctx: PanelCtxFull;
  readonly onShowOnMap: () => void;
  readonly onWiden: ((miles: number) => void) | undefined;
  readonly runId: string | null | undefined;
}): ReactElement {
  const { threadId } = ctx;
  const ids = claimIds(answer.claims);
  const { sources, numberOf } = numberSources(answer.claims, answer.citations);
  const proposals = answer.proposals ?? [];
  const byTcad = new Map(proposals.map((p) => [p.tcadId, p]));
  const rows = answer.rows;
  const [tabState, setTab] = useState<"answer" | "matches">("answer");
  const matchesHost = ctx.matchesHost ?? null;
  const tab = matchesHost === null ? tabState : "answer";
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetError, setSheetError] = useState<string | undefined>(undefined);
  const [snack, setSnack] = useState<{ message: string } | undefined>(undefined);
  // The inline undo row outlives the 10 s snackbar: it stays for the server's undo window.
  const [undoRow, setUndoRow] = useState<{
    leads: readonly { leadKey: string; leadId: string }[];
    createdAt: number;
    summary?: string;
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const confirmLeads = useConfirmLeads();
  const undoCreated = useUndoCreatedLeads();
  const pins = answerPins(answer);
  const pinText = pinsNote(answer.citations, pins.length);
  const coverage = coverageNote(answer, runId);

  // A proposal shows its Create lead on the source row it was cited in (CrmAsk1440 rows; E-59);
  // a proposal no claim cites still gets its own row below. Never a Create lead on a cited row
  // the answer did not propose (design-review-log row 54).
  const onRow = new Set(
    sources
      .filter((c) => c.kind === "property" && c.tcadId !== undefined && byTcad.has(c.tcadId))
      .map((c) => c.tcadId),
  );
  const unplaced = proposals.filter((p) => !onRow.has(p.tcadId));

  const rowOf = (tcadId: string): AnswerRowT | undefined => rows?.find((r) => r.tcadId === tcadId);
  const sheetRows: AskConfirmRow[] = proposals.map((p) => {
    const row = rowOf(p.tcadId);
    const base = {
      id: p.tcadId,
      title: `TCAD ${p.tcadId}${row?.nearPlace === undefined ? "" : ` · near ${row.nearPlace.name}`}`,
      signal: rowSignal(row),
    };
    if (p.alreadyLead || ctx.bulkCreated.has(p.tcadId)) return { ...base, state: "already" };
    if (row !== undefined && (row.lat === undefined || row.lon === undefined)) {
      return { ...base, state: "blocked", reason: "No published coordinates" };
    }
    return { ...base, state: "create" };
  });

  const confirm = (): void => {
    const tcadIds = sheetRows.filter((r) => r.state === "create").map((r) => r.id);
    setSheetError(undefined);
    confirmLeads.mutate(
      { threadId, tcadIds },
      {
        onSuccess: (result) => {
          ctx.addBulkCreated(result.created.map((c) => c.tcadId));
          const skipped = sheetRows.filter((r) => r.state === "already").length;
          setSheetOpen(false);
          setUndoRow(
            result.created.length > 0
              ? {
                  leads: result.created.map((c) => ({ leadKey: c.leadKey, leadId: c.leadId })),
                  createdAt: Date.now(),
                }
              : null,
          );
          setSnack({
            message: bulkSummary(
              result.created.length,
              result.alreadyLeads.length + skipped,
              result.failed.length,
            ),
          });
        },
        onError: (error) => setSheetError(confirmErrorCopy(error).text),
      },
    );
  };

  const undo = async (): Promise<void> => {
    const row = undoRow;
    if (row === null || row.summary !== undefined || undoing) return;
    setUndoing(true);
    try {
      const summary = undoSummary(await undoCreated(row.leads));
      setUndoRow({ ...row, summary });
      setSnack(undefined);
    } finally {
      setUndoing(false);
    }
  };
  const dismissUndoRow = useCallback(() => setUndoRow(null), []);

  const matchCount = answerMatchTotal(answer);
  const matchesPanel = (
    <AnswerMatches
      answer={answer}
      focusedCitation={ctx.focused}
      onOpen={ctx.onOpen}
      extraFor={(row) => {
        const proposal = byTcad.get(row.tcadId);
        return proposal === undefined ? null : <ProposalAction proposal={proposal} ctx={ctx} />;
      }}
    />
  );
  return (
    <div className={styles.answer}>
      {matchesHost === null ? null : createPortal(matchesPanel, matchesHost)}
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Answer views"
        hidden={matchesHost !== null}
      >
        <button
          type="button"
          role="tab"
          id="ask-tab-answer"
          aria-selected={tab === "answer"}
          aria-controls="ask-tabpanel"
          className={styles.tab}
          onClick={() => setTab("answer")}
        >
          Answer
        </button>
        <button
          type="button"
          role="tab"
          id="ask-tab-matches"
          aria-selected={tab === "matches"}
          aria-controls="ask-tabpanel"
          className={styles.tab}
          onClick={() => setTab("matches")}
        >
          {`Matches ${String(matchCount)}`}
        </button>
      </div>
      <div
        role="tabpanel"
        id="ask-tabpanel"
        aria-labelledby={`ask-tab-${tab}`}
        className={styles.answer}
        data-tab={tab}
      >
        {tab === "matches" ? (
          matchesPanel
        ) : (
          <>
            <PlanBlock answer={answer} />
            {answer.claims.length === 0 ? (
              <p className={styles.notice}>
                {`${answer.counts.matched} match${answer.counts.matched === 1 ? "" : "es"}, but none ` +
                  "could be shown with a verified citation."}
              </p>
            ) : (
              <ul className={styles.claims} aria-label="Answer">
                {answer.claims.map((claim, index) => (
                  <ClaimItem
                    key={ids[index]}
                    id={ids[index] ?? ""}
                    claim={claim}
                    numberOf={numberOf}
                    ctx={ctx}
                  />
                ))}
              </ul>
            )}
            <Notes notes={exclusionNotes(answer)} />
            <MissingList missing={answer.missing} />
          </>
        )}
      </div>
      <div
        className={`${styles.actionRow} ${styles.answerActions}`}
        role="group"
        aria-label="Answer actions"
      >
        {proposals.length === 0 ? null : (
          <button
            type="button"
            className={styles.tonalButton}
            onClick={() => {
              setSheetError(undefined);
              setSheetOpen(true);
            }}
          >
            <Icon name="person_add" size="medium" />
            {`Create leads for all ${String(proposals.length)}`}
          </button>
        )}
        <button
          type="button"
          className={styles.outlineButton}
          disabled={pins.length === 0}
          onClick={onShowOnMap}
        >
          <Icon name="location_on" size="medium" />
          Show on map
        </button>
        <WidenChip answer={answer} onWiden={onWiden} inline />
      </div>
      {coverage === undefined || tab !== "answer" ? null : <CoverageNote text={coverage} />}
      {undoRow === null ? null : (
        <UndoStatusRow
          count={undoRow.leads.length}
          createdAt={undoRow.createdAt}
          undoing={undoing}
          summary={undoRow.summary}
          onUndo={() => void undo()}
          onDismiss={dismissUndoRow}
        />
      )}
      {pinText === undefined ? null : <p className={styles.pinNote}>{pinText}</p>}
      {tab === "answer" && sources.length > 0 ? (
        <ol className={styles.sources} aria-label="Sources">
          {sources.map((citation) => (
            <SourceRow
              key={citation.id}
              number={citation.id}
              citation={citation}
              proposal={
                citation.kind === "property" && citation.tcadId !== undefined
                  ? byTcad.get(citation.tcadId)
                  : undefined
              }
              ctx={ctx}
            />
          ))}
        </ol>
      ) : null}
      {tab === "answer" && unplaced.length > 0 ? (
        <ul className={styles.sources} aria-label="Create lead">
          {unplaced.map((proposal) => (
            <li key={proposal.tcadId} className={styles.source} data-tcad-id={proposal.tcadId}>
              <span className={styles.sourceNumber} aria-hidden="true">
                <Icon name="person_add" size="small" />
              </span>
              <div className={styles.sourceBody}>
                <span className={styles.sourceTitle}>{`TCAD ${proposal.tcadId}`}</span>
                <ProposalAction proposal={proposal} ctx={ctx} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {sheetOpen ? (
        <AskConfirmSheet
          rows={sheetRows}
          running={confirmLeads.isPending}
          error={sheetError}
          onCancel={() => setSheetOpen(false)}
          onConfirm={confirm}
        />
      ) : null}
      {snack === undefined ? null : (
        <Snackbar
          message={snack.message}
          onClose={() => setSnack(undefined)}
          actions={
            <Link to="/leads" className={snackbarActionClass}>
              Open Leads
            </Link>
          }
        />
      )}
    </div>
  );
}

function Banner({
  tone,
  icon,
  alert = true,
  children,
}: {
  readonly tone: "warning" | "info";
  readonly icon: string;
  /** Budget limits interrupt (`role="alert"`); scope outcomes are the result itself. */
  readonly alert?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div {...(alert ? { role: "alert" } : {})} className={`${styles.banner} ${styles[tone]}`}>
      <Icon name={icon} size="medium" />
      <p className={styles.bannerBody}>{children}</p>
    </div>
  );
}

interface BodyProps {
  readonly answer: AgentAnswer;
  readonly ctx: PanelCtxFull;
  readonly onShowOnMap: () => void;
  readonly secondsLeft: number | undefined;
  readonly keptAnswer: boolean;
  readonly onPickPlace: (name: string) => void;
  readonly onRetry: () => void;
  readonly onWiden: ((miles: number) => void) | undefined;
  readonly runId: string | null | undefined;
}

function AnswerBody({
  answer,
  ctx,
  onShowOnMap,
  secondsLeft,
  keptAnswer,
  onPickPlace,
  onRetry,
  onWiden,
  runId,
}: BodyProps): ReactElement {
  switch (answer.outcome) {
    case "answered":
      return (
        <AnsweredBody
          answer={answer}
          ctx={ctx}
          onShowOnMap={onShowOnMap}
          onWiden={onWiden}
          runId={runId}
        />
      );
    case "empty_in_scope":
      return (
        <div className={styles.answer}>
          <p className={styles.lead}>{emptyExplanation(answer)}</p>
          <WidenChip answer={answer} onWiden={onWiden} />
          <Notes notes={exclusionNotes(answer)} />
          <MissingList missing={answer.missing} />
        </div>
      );
    case "field_not_published":
      return (
        <div className={styles.answer}>
          <p className={styles.lead}>{fieldNotPublishedText(answer)}</p>
          <MissingList missing={answer.missing} />
        </div>
      );
    case "needs_clarification": {
      const candidates = answer.candidates;
      if (candidates === undefined) {
        return (
          <p className={styles.lead}>
            I couldn&apos;t read that question. Try rephrasing it with a place and what to look for.
          </p>
        );
      }
      if (candidates.length === 0) {
        return (
          <p className={styles.lead}>
            The question didn&apos;t name a place I could match. Add a town, ZIP or &quot;lat,
            lon&quot;.
          </p>
        );
      }
      return (
        <div className={styles.answer}>
          <Banner tone="warning" icon="help" alert={false}>
            {`I'm not sure which place “${answer.plan.area.query}” means. Pick one and I'll ask again with it.`}
          </Banner>
          <div className={styles.chips} role="group" aria-label="Places I know">
            {candidates.map((candidate) => (
              <button
                key={candidate.name}
                type="button"
                className={styles.chip}
                data-place={candidate.name}
                aria-label={`Use ${candidate.name} (${Math.round(candidate.score * 100)}% match)`}
                onClick={() => onPickPlace(candidate.name)}
              >
                <Icon name="location_on" size="medium" />
                {`Use ${candidate.name}`}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case "out_of_scope":
      if (isOutboundRefusal(answer)) {
        return (
          <Banner tone="info" icon="block" alert={false}>
            {OUTBOUND_REFUSAL_TEXT}
          </Banner>
        );
      }
      return (
        <Banner tone="warning" icon="wrong_location" alert={false}>
          {`“${answer.plan.area.query}” is outside the area this CRM covers, so I didn't search. Try a place inside it.`}
        </Banner>
      );
    case "not_found":
      return (
        <Banner tone="warning" icon="location_off" alert={false}>
          {`I couldn't find “${placeOf(answer.plan)}” among the places I know. Check the spelling, or name a nearby town.`}
        </Banner>
      );
    case "rate_limited":
      return (
        <Banner tone="warning" icon="hourglass_top">
          {throttleText(secondsLeft, keptAnswer)}
        </Banner>
      );
    case "paused":
      return (
        <Banner tone="info" icon="pause_circle">
          {pausedText(answer.resetsAt)}
        </Banner>
      );
    case "timed_out":
      return (
        <div className={styles.answer}>
          <Banner tone="warning" icon="timer_off">
            <b>Took too long.</b> {timedOutText()}
          </Banner>
          <div className={styles.actionRow}>
            <button type="button" className={styles.action} onClick={onRetry}>
              Try again
            </button>
          </div>
        </div>
      );
  }
}

function WorkingPanel({ seconds }: { readonly seconds: number }): ReactElement {
  return (
    <div className={styles.working} aria-busy="true">
      <div className={styles.workingRow}>
        <span className={styles.spin}>
          <Icon name="progress_activity" size="medium" />
        </span>
        <b className={styles.workingLabel}>Working…</b>
        <span
          className={styles.timer}
          role="timer"
          aria-live="off"
          aria-label={`${seconds} seconds elapsed`}
        >
          {`${seconds} s`}
        </span>
      </div>
      <div className={styles.progress} role="progressbar" aria-label="Working">
        <i />
      </div>
      <span className={styles.workingHint}>
        {`The answer and its citations arrive together. It stops at ${AGENT_TURN_LIMIT_SEC} s.`}
      </span>
      <div className={styles.skeleton} aria-hidden="true">
        <span className={styles.skeletonLine} />
        <span className={styles.skeletonLineShort} />
        <span className={styles.skeletonLine} />
      </div>
    </div>
  );
}

/** The question the answer is for, with the agent glyph (CrmAsk390: robot icon + the question). */
function AskedLine({ text }: { readonly text: string }): ReactElement {
  return (
    <p className={styles.asked}>
      <Icon name="smart_toy" size="medium" />
      <span>{text}</span>
    </p>
  );
}

/** "How I read this" plus the step count (CrmAsk390 "4 steps done") — both only for a real model
 *  plan; the steps line only when the server ran tools (`trace.toolSteps`). */
function PlanBlock({ answer }: { readonly answer: AgentAnswer }): ReactElement | null {
  if (!hasModelPlan(answer) || isOutboundRefusal(answer)) return null;
  const steps = answer.trace.toolSteps;
  return (
    <>
      {answer.plan.slotSources["area"] === "inherited" ? (
        <StatusPill status="info" icon="forum" text="Follow-up · area from your last question" />
      ) : null}
      <p className={styles.plan}>
        <b>How I read this:</b> {planSummary(answer.plan)}
      </p>
      {steps > 0 ? (
        <p className={styles.steps}>
          <Icon name="check_circle" size="medium" />
          {`${steps} step${steps === 1 ? "" : "s"} done`}
        </p>
      ) : null}
    </>
  );
}

/** Budget outcomes keep the last real answer on screen under their banner (CrmAskThrottled390:
 *  "The answer above, the map, Filters and your leads keep working"). */
const KEEPS_LAST: ReadonlySet<AgentAnswer["outcome"]> = new Set<AgentAnswer["outcome"]>([
  "rate_limited",
  "paused",
]);

/** The answer to draw on the map: this turn's, or the last real one while a budget banner shows. */
function showKeptEarly(data: AgentAnswer | undefined, kept: Kept | undefined): AgentAnswer | null {
  if (data === undefined) return null;
  return KEEPS_LAST.has(data.outcome) ? (kept?.answer ?? null) : data;
}

interface Kept {
  readonly answer: AgentAnswer;
  readonly asked: string;
}

export interface AskPanelProps {
  /** Stable for the map session; a new thread starts on "New question". */
  readonly threadId: string;
  /** From `?q=`: prefills and focuses the box, never asks (every ask costs model money). */
  readonly initialQuestion?: string | undefined;
  /** The citation number whose source row and pin are highlighted. */
  readonly focusedCitation: number | null;
  readonly onFocusCitation: (n: number | null) => void;
  /** Fires on each new or kept answer (null before the first), so the map can draw its pins. */
  readonly onAnswer: (answer: AgentAnswer | null, asked?: string) => void;
  /** Fit the map to the cited pins. */
  readonly onShowOnMap: () => void;
  /** A pane at 1280 px and up, the results sheet below. */
  readonly layout: "pane" | "sheet";
  /** Three-pane widths: where the Matches rows render (the results pane). Absent = a tab. */
  readonly matchesHost?: HTMLElement | null | undefined;
  /** Opens a matched property's details; left out, the panel goes to `/?sel=` itself. */
  readonly onOpenProperty?: ((propertyCid: string) => void) | undefined;
  /** A one-shot request to ask `text` now, set only by an explicit in-app click (a card question,
   *  "Ask about it"), never from the URL. Each `nonce` is acted on once. */
  readonly autoAsk?: AutoAsk | null | undefined;
  /** Told once a request was acted on (or ignored), so the owner can drop it. */
  readonly onAutoAskConsumed?: ((nonce: number) => void) | undefined;
}

export interface AutoAsk {
  readonly text: string;
  readonly nonce: number;
}

export function AskPanel({
  threadId,
  initialQuestion,
  focusedCitation,
  onFocusCitation,
  onAnswer,
  onShowOnMap,
  layout,
  matchesHost,
  autoAsk,
  onAutoAskConsumed,
  onOpenProperty,
}: AskPanelProps): ReactElement {
  const navigate = useNavigate();
  const [question, setQuestion] = useState(() => prefillFrom(initialQuestion ?? null));
  const [asked, setAsked] = useState("");
  // "Edit" on the one-line question header brings the composer back (K1).
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [kept, setKept] = useState<Kept | undefined>(undefined);
  const [bulkCreated, setBulkCreated] = useState<ReadonlySet<string>>(new Set());
  const ask = useAskAgent();
  const runInfo = useRunInfo();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A prefill from the URL (also when it changes while the panel is open): fill and focus the box,
  // never ask. An empty, blank or over-long value is ignored.
  useEffect(() => {
    const text = prefillFrom(initialQuestion ?? null);
    if (text === "") return;
    setQuestion(text);
    inputRef.current?.focus();
  }, [initialQuestion]);

  // A new thread is a new conversation: forget the last answer and its created leads.
  const threadRef = useRef(threadId);
  useEffect(() => {
    if (threadRef.current === threadId) return;
    threadRef.current = threadId;
    setKept(undefined);
    setAsked("");
    setQuestion("");
    setEditing(false);
    setBulkCreated(new Set());
    ask.reset();
  }, [threadId, ask]);

  const data = ask.data;
  const state: AskState = ask.isPending
    ? "working"
    : data !== undefined
      ? OUTCOME_STATE[data.outcome]
      : ask.isError
        ? "error"
        : "idle";

  const seconds = useElapsedSeconds(ask.isPending);
  const secondsLeft = useCountdown(
    data?.outcome === "rate_limited" ? data.retryAfterSec : undefined,
    data,
  );
  const pausedUntil =
    data?.outcome === "paused" && data.resetsAt !== undefined ? Date.parse(data.resetsAt) : NaN;
  const blocked =
    (data?.outcome === "rate_limited" && secondsLeft !== undefined && secondsLeft > 0) ||
    (!Number.isNaN(pausedUntil) && Date.now() < pausedUntil);

  const heading = ask.isPending
    ? undefined
    : data !== undefined
      ? headingOf(data)
      : ask.isError
        ? ERROR_HEADING
        : undefined;

  useEffect(() => {
    if (heading !== undefined) headingRef.current?.focus();
  }, [heading, data]);

  const send = (text: string): void => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    setAsked(trimmed);
    setEditing(false);
    ask.mutate(
      { question: trimmed, threadId },
      {
        // A budget outcome keeps the last real answer on screen, so remember each real one.
        onSuccess: (answer) => {
          if (!KEEPS_LAST.has(answer.outcome)) setKept({ answer, asked: trimmed });
        },
      },
    );
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (ask.isPending || blocked) return;
    send(question);
  };

  /** A click that asks at once (a suggestion, a card question): fills the box and sends, unless an
   *  ask is already running or the budget says wait, in which case it only fills. */
  const askNow = (text: string): void => {
    const trimmed = prefillFrom(text);
    if (trimmed === "") return;
    setQuestion(trimmed);
    if (ask.isPending || blocked) return;
    send(trimmed);
  };
  const askNowRef = useRef(askNow);
  askNowRef.current = askNow;
  const consumedRef = useRef(onAutoAskConsumed);
  consumedRef.current = onAutoAskConsumed;
  // The one-shot request is acted on once per nonce (a ref survives StrictMode's second effect run).
  const handledNonce = useRef<number | null>(null);
  useEffect(() => {
    if (autoAsk == null || handledNonce.current === autoAsk.nonce) return;
    handledNonce.current = autoAsk.nonce;
    askNowRef.current(autoAsk.text);
    inputRef.current?.focus();
    consumedRef.current?.(autoAsk.nonce);
  }, [autoAsk]);

  /** Enter asks (as the single-line box did); Shift+Enter keeps a new line. */
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const pickPlace = (name: string): void => {
    if (data === undefined) return;
    const next = clarifyQuestion(asked !== "" ? asked : question, data.plan, name);
    setQuestion(next);
    send(next);
  };

  // Widen to {n} mi: the same question plus the wider radius, asked through the existing path.
  const widen = (miles: number): void => {
    const next = widenQuestion(asked !== "" ? asked : question, miles);
    setQuestion(next);
    send(next);
  };

  const retry = (): void => send(asked !== "" ? asked : question);

  // The answer the map draws pins for: the current one, or the last real one under a budget banner.
  const shownAnswer = showKeptEarly(data, kept);
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;
  const pending = ask.isPending;
  const shownAsked = shownAnswer === data ? asked : kept?.asked;
  useEffect(() => {
    if (pending) return;
    onAnswerRef.current(shownAnswer, shownAsked);
  }, [shownAnswer, shownAsked, pending]);

  const ctx: PanelCtxFull = {
    threadId,
    focused: focusedCitation,
    onFocus: onFocusCitation,
    bulkCreated,
    matchesHost,
    onOpen: onOpenProperty ?? ((cid: string) => void navigate(`/?sel=${encodeURIComponent(cid)}`)),
    addBulkCreated: (ids) => setBulkCreated((prev) => new Set([...prev, ...ids])),
  };

  // Once there is an answer the composer folds into a one-line question header, so the tabs, the
  // answer and its actions start at the top of the panel (CrmAsk768). Any other state keeps the
  // full composer so the rep can rephrase.
  const collapsed = state === "answer" && !editing;
  const headerText = asked !== "" ? asked : question.trim();
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const announcement = ask.isPending ? "Working on your question…" : (heading ?? "");
  const showKept = !ask.isPending && data !== undefined && KEEPS_LAST.has(data.outcome);
  const keptAnswer = showKept && kept !== undefined;
  const onWiden = ask.isPending || blocked ? undefined : widen;
  const runId = runInfo.data?.runId;

  return (
    <section
      aria-label="Ask"
      data-panel="ask"
      data-layout={layout}
      data-state={state}
      data-composer={collapsed ? "collapsed" : "open"}
      className={styles.page}
    >
      <div className={styles.composerPane}>
        <h2 className={collapsed ? styles.srOnly : styles.title}>
          <Icon name="auto_awesome" size="large" />
          Ask the agent
        </h2>
        {collapsed ? (
          <div className={styles.questionHeader} data-testid="ask-question-header">
            <Icon name="smart_toy" size="medium" />
            <span className={styles.questionText} title={headerText}>
              {headerText}
            </span>
            <button type="button" className={styles.textButton} onClick={() => setEditing(true)}>
              <Icon name="edit" size="medium" />
              Edit
            </button>
          </div>
        ) : (
          <>
            <form className={styles.form} onSubmit={submit}>
              <label htmlFor="ask-question" className={styles.label}>
                Ask your question in plain English
              </label>
              <div className={styles.composer}>
                <textarea
                  id="ask-question"
                  ref={inputRef}
                  className={styles.input}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="e.g. open roofing permits older than five years within five miles of Pflugerville"
                  maxLength={500}
                  rows={3}
                  readOnly={ask.isPending}
                  aria-busy={ask.isPending}
                />
                <div className={styles.composerFooter}>
                  <span className={styles.composerNote}>{composerNote(runInfo.data?.runId)}</span>
                  <button
                    type="submit"
                    className={styles.action}
                    disabled={ask.isPending || blocked || question.trim() === ""}
                  >
                    <Icon name="auto_awesome" size="medium" />
                    Ask
                  </button>
                </div>
              </div>
            </form>
            {state !== "idle" ? null : (
              <div className={styles.suggestions}>
                <span className={styles.label} id="ask-suggestions">
                  Try one of these
                </span>
                <ul className={styles.suggestionList} aria-labelledby="ask-suggestions">
                  {SUGGESTION_GROUPS.map((group) => (
                    <li key={group.label} className={styles.suggestionGroup}>
                      <span className={styles.suggestionGroupLabel}>{group.label}</span>
                      <ul className={styles.suggestionList}>
                        {group.items.map(({ golden, text }) => (
                          <li key={golden}>
                            <button
                              type="button"
                              className={styles.suggestion}
                              disabled={ask.isPending}
                              data-golden={golden}
                              onClick={() => askNow(text)}
                            >
                              <Icon name="lightbulb" size="medium" />
                              <span className={styles.suggestionText}>{text}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.resultPane}>
        <p role="status" aria-live="polite" className={styles.srOnly}>
          {announcement}
        </p>

        {ask.isPending ? (
          <div className={styles.result}>
            {asked === "" ? null : <AskedLine text={asked} />}
            <WorkingPanel seconds={seconds} />
          </div>
        ) : null}

        {heading === undefined ? null : (
          <article className={styles.result} aria-labelledby="ask-result-heading">
            <h3
              id="ask-result-heading"
              ref={headingRef}
              tabIndex={-1}
              className={data?.outcome === "answered" ? styles.srOnly : styles.resultHeading}
            >
              {heading}
            </h3>
            {data === undefined ? (
              <>
                {asked === "" ? null : <AskedLine text={asked} />}
                <p role="alert" className={styles.notice}>
                  The agent could not answer. Nothing was created. Try again.
                </p>
              </>
            ) : (
              <>
                {showKept || data.outcome === "answered" || asked === "" ? null : (
                  <AskedLine text={asked} />
                )}
                {data.outcome === "answered" ? null : <PlanBlock answer={data} />}
                <AnswerBody
                  answer={data}
                  ctx={ctx}
                  onShowOnMap={onShowOnMap}
                  secondsLeft={secondsLeft}
                  keptAnswer={keptAnswer}
                  onPickPlace={pickPlace}
                  onRetry={retry}
                  onWiden={onWiden}
                  runId={runId}
                />
              </>
            )}
          </article>
        )}

        {showKept && kept !== undefined ? (
          <section className={styles.result} aria-label="Your last answer">
            <AskedLine text={kept.asked} />
            <AnswerBody
              answer={kept.answer}
              ctx={ctx}
              onShowOnMap={onShowOnMap}
              secondsLeft={undefined}
              keptAnswer={false}
              onPickPlace={pickPlace}
              onRetry={retry}
              onWiden={undefined}
              runId={runId}
            />
          </section>
        ) : null}
      </div>
    </section>
  );
}
