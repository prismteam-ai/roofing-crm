// Candidate list: the List view of the CRM map (`/map?view=list`, CRM-HANDOFF §4.3; boards
// CrmCandidates1440/768/390, Confirm1440/390, Created390, Hide1440, Loading/Empty/Error/Partial/
// NoAddress390, CrmCandidatesStates). Same matches and filters as the map: it reads the map's
// own `search.properties` + `search.permits` cache entries (candidatesApi). CRM additions: a
// checkbox per row and the selection bar "Create {n} leads" (E-54) with a confirmation sheet
// (E-75), the "Lead · {status}" mark (E-52), the "Hide existing leads" toggle (E-74) and "Why is
// this a lead?". Bulk create calls `leads.createMany` (25 per call); duplicates come back as
// `already` and are counted, never failed. The result snackbar's Undo calls `leads.undoCreate` for
// exactly the leads that create made and reports, honestly, any the server kept and why.
import { MAX_RADIUS_MI, WIDEN_STEP_MI } from "@crm/domain";
import { Icon, Popover } from "@crm/ui";
import { useCallback, useEffect, useId, useMemo, useState, type ReactElement } from "react";
import { useNavigate } from "react-router";
import { Skeleton } from "../../../components/Skeleton.js";
import { bulkSummary } from "./bulkCreate.js";
import { undoSummary } from "./undoCopy.js";
import { CandidateRow } from "./CandidateRow.js";
import {
  candidateCreateInput,
  useBulkCreateLeads,
  useUndoCreatedLeads,
  useCandidates,
  type LeadCreateInput,
} from "./candidatesApi.js";
import {
  candidateTitle,
  defaultSort,
  lowerRoofPreset,
  emptyStateCopy,
  leadsNote,
  listedCount,
  mainSignalText,
  permitNote,
  SORT_LABEL,
  sortCandidates,
  whyChips,
  type Candidate,
  type CandidateFilters,
  type CandidateSort,
} from "./candidates.js";
import { ConfirmSheet, type ConfirmRow } from "./ConfirmSheet.js";
import { Snackbar, SnackbarAction } from "./Snackbar.js";
import { UndoStatusRow } from "./UndoStatusRow.js";
import { PERMIT_OVERVIEW_NOTE } from "../ExploreFilters.state.js";
import styles from "./CandidateList.module.css";

export const DEFAULT_PAGE_SIZE = 20;

/** CRM-HANDOFF §4.2 coverage note (same words as the map's results header). */
export const COVERAGE_NOTE =
  "Permits are shown only where CountyLens publishes them. Part of this area may have no permit data.";

export interface CandidateListProps {
  /** The map's filters (centre, radius, roof, permit status, permit open years). */
  readonly filters: CandidateFilters;
  /** The map's sort; defaults to "Permit open (longest)" with a permit filter, else roof age. */
  readonly sort?: CandidateSort | undefined;
  /** Where the ring is centred, for the header: "Dropped pin", "you", an Area name. */
  readonly originLabel?: string | undefined;
  /** The property whose drawer is open (`sel`), marked in the table. */
  readonly selectedCid?: string | null | undefined;
  /** Opens the property drawer (the map's `sel`). */
  readonly onSelect?: ((propertyCid: string) => void) | undefined;
  /** Back to the map, centred on this property. */
  readonly onShowOnMap?: ((propertyCid: string) => void) | undefined;
  /** Empty state "Widen to N mi". */
  readonly onRadiusChange?: ((radiusMi: number) => void) | undefined;
  /** Empty state "Roof ≥ M yrs". */
  readonly onRoofChange?: ((years: number) => void) | undefined;
  /** Empty state "Any permit status": relaxes the permit status filter. */
  readonly onPermitStatusChange?: ((status: "any") => void) | undefined;
  /** Empty state "Any open time": clears the permit open-years filter. */
  readonly onPermitOpenYrsChange?: ((years: undefined) => void) | undefined;
  readonly pageSize?: number | undefined;
}

interface Result {
  readonly message: string;
}

function headerSummary(
  count: number,
  filters: CandidateFilters,
  originLabel: string,
  hasCentre = true,
): string {
  // With no centre nothing was searched: no "0 within 5 mi of the county", just the filters.
  const parts = [
    hasCentre
      ? `${String(count)} within ${String(filters.radiusMi)} mi of ${originLabel}`
      : "No centre chosen",
  ];
  if (filters.roofAgeMinYears !== undefined)
    parts.push(`roof ≥ ${String(filters.roofAgeMinYears)} yrs`);
  if (filters.tenureYearsMin !== undefined)
    parts.push(`tenure ≥ ${String(filters.tenureYearsMin)} yrs`);
  if (filters.outOfArea === true) parts.push("out-of-area owner");
  const status = filters.permitStatus ?? "any";
  if (status !== "any") parts.push(`${status} permit`);
  if (filters.permitOpenYrs !== undefined)
    parts.push(`permit open ≥ ${String(filters.permitOpenYrs)} yrs`);
  return parts.join(" · ");
}

export function CandidateList({
  filters,
  sort,
  originLabel = "the pin",
  selectedCid = null,
  onSelect,
  onShowOnMap,
  onRadiusChange,
  onRoofChange,
  onPermitStatusChange,
  onPermitOpenYrsChange,
  pageSize = DEFAULT_PAGE_SIZE,
}: CandidateListProps): ReactElement {
  const data = useCandidates(filters);
  const bulk = useBulkCreateLeads();
  const undoCreated = useUndoCreatedLeads();
  const [undoing, setUndoing] = useState(false);
  const navigate = useNavigate();
  const noteId = useId();
  const [hideLeads, setHideLeads] = useState(false);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const closeResult = useCallback(() => setResult(null), []);
  const [undoRow, setUndoRow] = useState<{
    leads: readonly { leadKey: string; leadId: string }[];
    createdAt: number;
    summary?: string;
  } | null>(null);

  const effectiveSort = sort ?? defaultSort(filters);
  const sorted = useMemo(
    () => sortCandidates(data.candidates, effectiveSort),
    [data.candidates, effectiveSort],
  );
  const leadCount = sorted.filter((c) => c.lead !== null).length;
  const visible = hideLeads ? sorted.filter((c) => c.lead === null) : sorted;
  const byCid = useMemo(() => new Map(sorted.map((c) => [c.property.propertyCid, c])), [sorted]);

  // A new question (ring, roof, permit filters) starts on page 1 with nothing selected.
  const filterKey = JSON.stringify([
    filters.center,
    filters.radiusMi,
    filters.roofAgeMinYears,
    filters.tenureYearsMin,
    filters.outOfArea,
    filters.permitStatus,
    filters.permitOpenYrs,
  ]);
  useEffect(() => {
    setPage(1);
    setSelection([]);
  }, [filterKey]);

  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const pageRows = visible.slice(start, start + pageSize);
  const selected = selection.filter((cid) => byCid.has(cid));

  const toggle = (cid: string): void =>
    setSelection((s) => (s.includes(cid) ? s.filter((x) => x !== cid) : [...s, cid]));
  const pageCids = pageRows.map((c) => c.property.propertyCid);
  const allOnPage = pageCids.length > 0 && pageCids.every((cid) => selected.includes(cid));
  const toggleAll = (): void =>
    setSelection((s) =>
      allOnPage
        ? s.filter((cid) => !pageCids.includes(cid))
        : [...s, ...pageCids.filter((cid) => !s.includes(cid))],
    );

  const confirmRows: ConfirmRow[] = selected.map((cid) => {
    const c = byCid.get(cid) as Candidate;
    return {
      id: cid,
      title: candidateTitle(c.property),
      signal: mainSignalText(c),
      lead: c.lead,
      blockedReason: candidateCreateInput(c, "list") === null ? "No published location" : undefined,
    };
  });

  const confirm = async (): Promise<void> => {
    const items: { id: string; input: LeadCreateInput }[] = [];
    for (const row of confirmRows) {
      const c = byCid.get(row.id);
      if (c === undefined || c.lead !== null) continue;
      const input = candidateCreateInput(c, "list");
      if (input !== null) items.push({ id: row.id, input });
    }
    const knownLeads = confirmRows.filter((r) => r.lead !== null).length;
    const outcome = await bulk.run(items);
    setConfirming(false);
    setSelection(outcome.failed);
    // The snackbar stays short; Undo lives on the inline row for the server's whole undo window.
    setUndoRow(
      outcome.created.length > 0
        ? { leads: outcome.created.map((c) => c.result), createdAt: Date.now() }
        : null,
    );
    setResult({
      message: bulkSummary(
        outcome.created.length,
        knownLeads + outcome.already.length,
        outcome.failed.length,
      ),
    });
  };

  const undo = async (): Promise<void> => {
    const row = undoRow;
    if (row === null || row.summary !== undefined || undoing) return;
    setUndoing(true);
    try {
      const summary = undoSummary(await undoCreated(row.leads));
      setUndoRow({ ...row, summary });
      setResult(null);
    } finally {
      setUndoing(false);
    }
  };
  const dismissUndoRow = useCallback(() => setUndoRow(null), []);

  const widenTo =
    filters.radiusMi + WIDEN_STEP_MI <= MAX_RADIUS_MI ? filters.radiusMi + WIDEN_STEP_MI : null;
  const lowerRoof = lowerRoofPreset(filters.roofAgeMinYears);
  const countText = data.status === "loading" ? "…" : String(visible.length);
  // The header's number is the rows listed (the server's total when the page is clipped).
  const headerCount = listedCount(filters, data.totalInRing, sorted.length);

  let body: ReactElement;
  if (data.status === "idle") {
    const permitFilter =
      (filters.permitStatus ?? "any") !== "any" || filters.permitOpenYrs !== undefined;
    body = (
      <p className={styles.state} data-state="CrmCandidatesIdle">
        {permitFilter
          ? `${PERMIT_OVERVIEW_NOTE}, so no candidates are listed yet. Drop a pin on the map or use your location to search permits within a radius.`
          : "No centre chosen yet, so no candidates. Drop a pin on the map or use your location to list properties within a radius."}
      </p>
    );
  } else if (data.status === "loading") {
    body = (
      <div className={styles.state} data-state="CrmCandidatesLoading390">
        <div className={styles.progress} role="progressbar" aria-label="Loading candidates" />
        <p className={styles.stateText}>Loading candidates from the lead index…</p>
        <Skeleton variant="rows" count={3} />
      </div>
    );
  } else if (data.status === "error") {
    body = (
      <div className={styles.state} role="alert" data-state="CrmCandidatesError390">
        <p className={styles.stateTitle}>Results unavailable.</p>
        <p className={styles.stateText}>
          The lead index didn’t answer. Your leads and notes still open.
        </p>
        <button type="button" className={styles.outlined} onClick={data.refetch}>
          <Icon name="refresh" size="medium" />
          Retry
        </button>
      </div>
    );
  } else if (sorted.length === 0) {
    const copy = emptyStateCopy(filters);
    body = (
      <div className={styles.state} data-state="CrmCandidatesEmpty390">
        <p className={styles.stateTitle}>{copy.title}</p>
        <p className={styles.stateText}>{copy.text}</p>
        <div className={styles.chips}>
          {widenTo === null || onRadiusChange === undefined ? null : (
            <button type="button" className={styles.chip} onClick={() => onRadiusChange(widenTo)}>
              <Icon name="open_in_full" size="small" />
              {`Widen to ${String(widenTo)} mi`}
            </button>
          )}
          {lowerRoof === null || onRoofChange === undefined ? null : (
            <button type="button" className={styles.chip} onClick={() => onRoofChange(lowerRoof)}>
              <Icon name="roofing" size="small" />
              {`Roof ≥ ${String(lowerRoof)} yrs`}
            </button>
          )}
          {!copy.permitFilter ||
          (filters.permitStatus ?? "any") === "any" ||
          onPermitStatusChange === undefined ? null : (
            <button
              type="button"
              className={styles.chip}
              onClick={() => onPermitStatusChange("any")}
            >
              <Icon name="description" size="small" />
              Any permit status
            </button>
          )}
          {filters.permitOpenYrs === undefined || onPermitOpenYrsChange === undefined ? null : (
            <button
              type="button"
              className={styles.chip}
              onClick={() => onPermitOpenYrsChange(undefined)}
            >
              <Icon name="schedule" size="small" />
              Any open time
            </button>
          )}
        </div>
      </div>
    );
  } else if (visible.length === 0) {
    body = (
      <div className={styles.state} data-state="CrmCandidatesAllLeads">
        <p className={styles.stateText}>All matches here are already leads.</p>
        <button type="button" className={styles.outlined} onClick={() => setHideLeads(false)}>
          Show them
        </button>
      </div>
    );
  } else {
    body = (
      <table className={styles.table} aria-label="Candidates" data-testid="candidate-table">
        <thead>
          <tr>
            <th scope="col" className={styles.cCheck}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={allOnPage}
                onChange={toggleAll}
                aria-label="Select all on this page"
              />
            </th>
            <th scope="col" className={`${styles.cNum} ${styles.wide840}`}>
              #
            </th>
            <th scope="col">Address</th>
            <th scope="col">Roof</th>
            <th scope="col" className={styles.wide1240}>
              Basis
            </th>
            <th scope="col">Conf.</th>
            <th scope="col" className={styles.wide768}>
              Permit
            </th>
            <th scope="col" className={styles.wide768}>
              Mi
            </th>
            <th scope="col" className={styles.wide1032}>
              Lat, lon
            </th>
            <th scope="col">
              <span className={styles.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((c) => {
            const cid = c.property.propertyCid;
            const at = selected.indexOf(cid);
            return (
              <CandidateRow
                key={cid}
                candidate={c}
                checked={at !== -1}
                order={at === -1 ? null : at + 1}
                why={whyChips(c, filters)}
                permitsUnavailable={data.permitsUnavailable}
                active={selectedCid === cid}
                onToggle={toggle}
                onSelect={onSelect}
                onShowOnMap={onShowOnMap}
              />
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <section className={styles.list} aria-label="Candidate list" data-candidate-list="">
      <header className={styles.head}>
        <p
          className={styles.summary}
          title={headerSummary(headerCount, filters, originLabel, data.status !== "idle")}
        >
          {headerSummary(
            data.status === "ready" ? headerCount : 0,
            filters,
            originLabel,
            data.status !== "idle",
          )}
        </p>
        <button
          type="button"
          className={`${styles.toggle} ${hideLeads ? styles.toggleOn : ""}`}
          aria-pressed={hideLeads}
          onClick={() => setHideLeads((h) => !h)}
          disabled={data.status !== "ready"}
        >
          <Icon name={hideLeads ? "visibility_off" : "visibility"} size="medium" />
          <span className={hideLeads ? undefined : styles.toggleLabel}>
            {hideLeads ? `Existing leads hidden (${String(leadCount)})` : "Hide existing leads"}
          </span>
        </button>
        <span className={styles.matches} data-matches={countText}>
          Matches <span className={styles.num}>{countText}</span>
        </span>
        <span className={styles.noteWrap}>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.warnIcon}`}
            aria-label="Permit coverage note"
            aria-expanded={noteOpen}
            aria-controls={noteId}
            onClick={() => setNoteOpen((o) => !o)}
          >
            <Icon name="info" size="medium" />
          </button>
          <div id={noteId}>
            <Popover
              open={noteOpen}
              onClose={() => setNoteOpen(false)}
              label="Permit coverage note"
              align="end"
            >
              <p className={styles.noteText}>{COVERAGE_NOTE}</p>
            </Popover>
          </div>
        </span>
      </header>
      {data.status === "ready" && data.permitsUnavailable ? (
        <p className={styles.partial} role="status" data-state="CrmCandidatesPartial390">
          <Icon name="block" size="medium" />
          Permit data couldn’t be read for this ring, so rows show the roof only. Try again shortly.
        </p>
      ) : null}
      {data.status === "ready" && data.leadsUnavailable ? (
        <p className={styles.partial} role="status" data-state="CrmCandidatesLeadsUnavailable">
          <Icon name="info" size="medium" />
          {leadsNote(data.leadsReason ?? "failed")}
        </p>
      ) : null}
      {data.status === "ready" && (data.permitsTruncated || data.propertiesTruncated) ? (
        <p className={styles.clipped} role="status" data-state="CrmCandidatesClipped">
          <Icon name="info" size="medium" />
          <span>
            {data.propertiesTruncated
              ? `Showing the nearest ${String(data.propertiesShown)} of ${data.totalInRing.toLocaleString("en-US")} properties; narrow the radius or raise the roof age. `
              : ""}
            {permitNote({ total: data.permitTotal, truncated: data.permitsTruncated }) ?? ""}
          </span>
        </p>
      ) : null}
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
      {selected.length > 0 ? (
        <div className={styles.selectionBar} data-selection-bar="">
          <span className={styles.selectedCount}>{`${String(selected.length)} selected`}</span>
          <button
            type="button"
            className={styles.filled}
            onClick={() => {
              setResult(null);
              setConfirming(true);
            }}
          >
            <Icon name="person_add" size="medium" />
            {`Create ${String(selected.length)} ${selected.length === 1 ? "lead" : "leads"}`}
          </button>
          <button type="button" className={styles.textBtn} onClick={() => setSelection([])}>
            Clear
          </button>
        </div>
      ) : null}
      <div className={styles.body}>{body}</div>
      <footer className={styles.foot}>
        <span className={styles.showing}>
          {visible.length === 0
            ? SORT_LABEL[effectiveSort]
            : `Showing ${String(start + 1)}–${String(start + pageRows.length)} of ${String(visible.length)} · ${SORT_LABEL[effectiveSort]}`}
        </span>
        <nav className={styles.pager} aria-label="Pages">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            <Icon name="chevron_left" size="medium" />
          </button>
          <span className={styles.pageNum} aria-current="page">
            {current}
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Next page"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            <Icon name="chevron_right" size="medium" />
          </button>
        </nav>
      </footer>
      {confirming ? (
        <ConfirmSheet
          rows={confirmRows}
          running={bulk.state.running}
          done={bulk.state.done}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void confirm()}
        />
      ) : null}
      {result === null ? null : (
        <Snackbar
          message={result.message}
          onClose={closeResult}
          actions={
            <>
              <SnackbarAction onClick={() => void navigate("/leads")}>Open Leads</SnackbarAction>
            </>
          }
        />
      )}
    </section>
  );
}
