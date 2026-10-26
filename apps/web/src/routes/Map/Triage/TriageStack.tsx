// Field triage (`/map?triage=1`, CRM-HANDOFF §4.4, signature moment 3; boards CrmTriage390,
// Swipe, Lead, Loading, Empty, Failed, Offline, End, NoAddress, NoContractor, States). Turns the
// map's current results, in the current sort, into a stack of cards: swipe right (or Create lead)
// creates a lead with `leads.create`, swipe left (or Skip) skips, Open details opens the property
// drawer. The queue is fixed when triage starts, so creating a lead never reshuffles the cards.
// Skip has Undo (local). Create has Undo too: `leads.undoCreate` deletes only the lead this tap
// created, while it is untouched and under 15 minutes old; when the server keeps it, the snackbar
// says why and the card stays done. Offline: Skip still works and Create returns the card with "You're offline. The lead was not saved."
import { MAX_RADIUS_MI, WIDEN_STEP_MI } from "@crm/domain";
import { Icon } from "@crm/ui";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Link } from "react-router";
import { Skeleton } from "../../../components/Skeleton.js";
import {
  candidateCreateInput,
  isAlreadyExists,
  useCandidates,
  useCreateCandidateLead,
  useUndoCreateLead,
  usePropertyDetail,
} from "../Candidates/candidatesApi.js";
import {
  permitNote,
  leadsNote,
  candidateTitle,
  defaultSort,
  lowerRoofPreset,
  sortCandidates,
  type CandidateFilters,
  type CandidateSort,
} from "../Candidates/candidates.js";
import { Snackbar, SnackbarAction } from "../Candidates/Snackbar.js";
import { undoOneText } from "../Candidates/undoCopy.js";
import { TriageCard, type TriageBbb } from "./TriageCard.js";
import styles from "./Triage.module.css";

const OFFLINE_ERROR = "You’re offline. The lead was not saved.";
const FAILED_ERROR = "Couldn’t create the lead. Nothing was saved.";

type Action = "created" | "skipped" | "already";
interface LogEntry {
  readonly cid: string;
  readonly action: Action;
  readonly leadKey?: string;
  readonly leadId?: string;
}

interface Toast {
  readonly message: string;
  /** Which Undo the snackbar offers: a local skip, or the server-side removal of a created lead. */
  readonly undo?: "skip" | "create";
  readonly leadKey?: string;
  readonly leadId?: string;
}

export interface TriageStackProps {
  /** The map's filters (centre, radius, roof, permit status, permit open years). */
  readonly filters: CandidateFilters;
  readonly sort?: CandidateSort | undefined;
  /** "Back to map": leaves triage (clears `triage` from the URL). */
  readonly onBack: () => void;
  /** Open details: the map's property drawer (`sel`). */
  readonly onOpenDetails?: ((propertyCid: string) => void) | undefined;
  /** Called with the current card's property so the map strip can centre and ring its marker;
   *  null when there is no current card. */
  readonly onCurrentChange?: ((propertyCid: string | null) => void) | undefined;
  readonly onRadiusChange?: ((radiusMi: number) => void) | undefined;
  readonly onRoofChange?: ((years: number) => void) | undefined;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = (): void => setOnline(true);
    const down = (): void => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = (): void => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function TriageStack({
  filters,
  sort,
  onBack,
  onOpenDetails,
  onCurrentChange,
  onRadiusChange,
  onRoofChange,
}: TriageStackProps): ReactElement {
  const data = useCandidates(filters);
  const create = useCreateCandidateLead();
  const online = useOnline();
  const reducedMotion = usePrefersReducedMotion();
  const [order, setOrder] = useState<readonly string[] | null>(null);
  const [log, setLog] = useState<readonly LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const undoCreate = useUndoCreateLead();
  const [toast, setToast] = useState<Toast | null>(null);
  const pendingRef = useRef(false);

  const effectiveSort = sort ?? defaultSort(filters);
  const filterKey = JSON.stringify([
    filters.center,
    filters.radiusMi,
    filters.roofAgeMinYears,
    filters.tenureYearsMin,
    filters.outOfArea,
    filters.permitStatus,
    filters.permitOpenYrs,
    effectiveSort,
  ]);
  // New question → new stack.
  useEffect(() => {
    setOrder(null);
    setLog([]);
    setError(null);
    setToast(null);
  }, [filterKey]);
  // Freeze the queue once the first full result arrives.
  useEffect(() => {
    if (order !== null || data.status !== "ready") return;
    setOrder(sortCandidates(data.candidates, effectiveSort).map((c) => c.property.propertyCid));
  }, [order, data.status, data.candidates, effectiveSort]);

  const byCid = useMemo(
    () => new Map(data.candidates.map((c) => [c.property.propertyCid, c])),
    [data.candidates],
  );
  const queue = useMemo(() => (order ?? []).filter((cid) => byCid.has(cid)), [order, byCid]);
  const total = queue.length;
  const index = log.length;
  const currentCid = index < total ? (queue[index] ?? null) : null;
  const current = currentCid === null ? null : (byCid.get(currentCid) ?? null);

  useEffect(() => {
    onCurrentChange?.(currentCid);
  }, [currentCid, onCurrentChange]);

  const detail = usePropertyDetail(currentCid);
  const bbb: TriageBbb | "loading" | "unavailable" = detail.isError
    ? "unavailable"
    : detail.data === undefined
      ? "loading"
      : { status: detail.data.bbbStatus, reason: detail.data.bbbStatusReason };
  const nearPlace = detail.data?.nearPlace?.name ?? null;

  const closeToast = useCallback(() => setToast(null), []);

  const advance = (entry: LogEntry, message: string, undo?: "skip" | "create"): void => {
    setLog((l) => [...l, entry]);
    setError(null);
    setToast({
      message,
      ...(undo === undefined ? {} : { undo }),
      ...(entry.leadKey === undefined ? {} : { leadKey: entry.leadKey }),
      ...(entry.leadId === undefined ? {} : { leadId: entry.leadId }),
    });
  };

  const skip = (): void => {
    if (current === null || pendingRef.current) return;
    advance(
      { cid: current.property.propertyCid, action: "skipped" },
      `Skipped ${candidateTitle(current.property)}`,
      "skip",
    );
  };

  const createLead = async (): Promise<void> => {
    if (current === null || pendingRef.current || current.lead !== null) return;
    if (!online) {
      setError(OFFLINE_ERROR);
      return;
    }
    const input = candidateCreateInput(current, "map");
    if (input === null) {
      setError("This property has no published location, so a lead can’t be created.");
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const lead = await create.mutateAsync(input);
      advance(
        {
          cid: current.property.propertyCid,
          action: "created",
          leadKey: lead.leadKey,
          leadId: lead.leadId,
        },
        `Lead created · ${lead.leadId}`,
        "create",
      );
    } catch (e) {
      if (isAlreadyExists(e)) {
        advance(
          { cid: current.property.propertyCid, action: "already" },
          "Already a lead · skipped",
        );
      } else {
        setError(online ? FAILED_ERROR : OFFLINE_ERROR);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const undoSkip = (): void => {
    setLog((l) => (l[l.length - 1]?.action === "skipped" ? l.slice(0, -1) : l));
    setToast(null);
    setError(null);
  };

  /** Removes the lead the last Create made. Only a `deleted: true` answer brings the card back;
   *  a refusal keeps the lead and the stack where it is, and the snackbar says why. */
  const undoCreatedLead = async (): Promise<void> => {
    if (toast?.leadKey === undefined || toast.leadId === undefined || pendingRef.current) return;
    const { leadKey, leadId } = toast;
    pendingRef.current = true;
    setPending(true);
    try {
      const answer = await undoCreate.mutateAsync({ leadKey, leadId });
      if (answer.deleted) {
        setLog((l) => (l[l.length - 1]?.leadKey === leadKey ? l.slice(0, -1) : l));
        setToast({ message: undoOneText(answer) });
      } else {
        setToast({ message: undoOneText(answer), leadKey });
      }
    } catch {
      setToast({ message: undoOneText("failed"), undo: "create", leadKey, leadId });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const created = log.filter((e) => e.action === "created").length;
  const skipped = log.length - created;
  const done = total > 0 && index >= total;
  const widenTo =
    filters.radiusMi + WIDEN_STEP_MI <= MAX_RADIUS_MI ? filters.radiusMi + WIDEN_STEP_MI : null;
  const lowerRoof = lowerRoofPreset(filters.roofAgeMinYears);

  let body: ReactElement;
  if (data.status === "idle") {
    body = (
      <p className={styles.stateText} data-state="CrmTriageIdle">
        No centre chosen yet. Drop a pin on the map or use your location, then triage again.
      </p>
    );
  } else if (
    data.status === "loading" ||
    (data.status === "ready" && order === null && data.candidates.length > 0)
  ) {
    body = (
      <div data-state="CrmTriageLoading390">
        <p className={styles.stateText}>Loading the next card…</p>
        <Skeleton variant="cards" count={1} />
      </div>
    );
  } else if (data.status === "error") {
    body = (
      <div className={styles.empty} role="alert" data-state="CrmTriageIndexDown">
        <p className={styles.emptyTitle}>Results unavailable.</p>
        <p className={styles.stateText}>
          The lead index didn’t answer. Your leads and notes still open.
        </p>
        <button type="button" className={styles.outlined} onClick={data.refetch}>
          <Icon name="refresh" size="medium" />
          Retry
        </button>
      </div>
    );
  } else if (total === 0) {
    body = (
      <div className={styles.empty} data-state="CrmTriageEmpty390">
        <p className={styles.emptyTitle}>No candidates in this ring</p>
        <p className={styles.stateText}>
          {`Nothing within ${String(filters.radiusMi)} mi matches the filters. Widen the ring or lower the roof age, then triage again.`}
        </p>
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
        </div>
        <button type="button" className={styles.outlined} onClick={onBack}>
          <Icon name="map" size="medium" />
          Back to map
        </button>
      </div>
    );
  } else if (done) {
    body = (
      <div className={styles.end} data-state="CrmTriageEnd390">
        <Icon name="check_circle" size="large" />
        <h3
          className={styles.endTitle}
        >{`${String(created)} ${created === 1 ? "lead" : "leads"} created, ${String(skipped)} skipped`}</h3>
        <p className={styles.stateText}>
          {`All ${String(total)} candidates within ${String(filters.radiusMi)} mi from the pin are triaged. New leads are New and assigned to you.`}
        </p>
        <div className={styles.endActions}>
          <Link className={styles.filledLink} to="/leads">
            <Icon name="contact_page" size="medium" />
            Open Leads
          </Link>
          <button type="button" className={styles.outlined} onClick={onBack}>
            <Icon name="map" size="medium" />
            Back to map
          </button>
        </div>
      </div>
    );
  } else if (current !== null) {
    body = (
      <>
        <TriageCard
          key={current.property.propertyCid}
          candidate={current}
          filters={filters}
          position={index + 1}
          total={total}
          nearPlace={nearPlace}
          bbb={bbb}
          error={error}
          reducedMotion={reducedMotion}
          onSwipe={(d) => (d === "create" ? void createLead() : skip())}
          onOpenDetails={() => onOpenDetails?.(current.property.propertyCid)}
          onRetry={() => void createLead()}
        />
        <div className={styles.actions}>
          <button type="button" className={styles.outlinedBtn} onClick={skip} disabled={pending}>
            <Icon name="close" size="medium" />
            Skip
          </button>
          {current.lead === null ? (
            <button
              type="button"
              className={styles.filledBtn}
              onClick={() => void createLead()}
              disabled={pending}
            >
              <Icon name="person_add" size="medium" />
              {pending ? "Creating…" : "Create lead"}
            </button>
          ) : (
            <Link
              className={styles.filledBtn}
              to={`/leads/${encodeURIComponent(current.lead.leadKey)}`}
            >
              <Icon name="open_in_new" size="medium" />
              Open lead
            </Link>
          )}
          {onOpenDetails === undefined ? null : (
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Open details"
              onClick={() => onOpenDetails(current.property.propertyCid)}
            >
              <Icon name="info" size="large" />
            </button>
          )}
        </div>
        <p className={styles.hint}>Swipe right to create a lead · swipe left to skip</p>
      </>
    );
  } else {
    body = <p className={styles.stateText}>No card to show.</p>;
  }

  const title =
    done || total === 0
      ? data.status === "ready" && total > 0
        ? "Triage · done"
        : "Triage"
      : `Triage · ${String(Math.min(index + 1, total))} of ${String(total)}`;

  return (
    <section className={styles.panel} aria-label="Field triage" data-triage="">
      <header className={styles.head}>
        <h2 className={styles.title}>{data.status === "loading" ? "Triage" : title}</h2>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <Icon name="map" size="medium" />
          Back to map
        </button>
      </header>
      <progress
        className={styles.progress}
        aria-label="Triage progress"
        max={Math.max(total, 1)}
        value={Math.min(index, Math.max(total, 1))}
      />
      {online ? null : (
        <p className={styles.offline} role="status" data-state="CrmTriageOffline390">
          <Icon name="cloud_off" size="medium" />
          You’re offline. Skip still works; new leads can’t be saved until you’re back online.
        </p>
      )}
      {data.status === "ready" && data.permitsUnavailable ? (
        <p className={styles.offline} role="status" data-state="CrmTriagePartial">
          <Icon name="block" size="medium" />
          Permit data couldn’t be read here, so cards show the roof only.
        </p>
      ) : null}
      {data.status === "ready" && data.leadsUnavailable ? (
        <p className={styles.offline} role="status" data-state="CrmCandidatesLeadsUnavailable">
          <Icon name="info" size="medium" />
          {leadsNote(data.leadsReason ?? "failed")}
        </p>
      ) : null}
      {data.status === "ready" && (data.permitsTruncated || data.propertiesTruncated) ? (
        <p className={styles.offline} role="status" data-state="CrmTriageClipped">
          <Icon name="info" size="medium" />
          {data.propertiesTruncated
            ? `The nearest ${String(data.propertiesShown)} of ${data.totalInRing.toLocaleString("en-US")} properties. `
            : ""}
          {permitNote({ total: data.permitTotal, truncated: data.permitsTruncated }) ?? ""}
        </p>
      ) : null}
      <div className={styles.live} aria-live="polite">
        {current === null || done
          ? ""
          : `Card ${String(index + 1)} of ${String(total)}: ${candidateTitle(current.property)}`}
      </div>
      <div className={styles.body}>{body}</div>
      {toast === null ? null : (
        <Snackbar
          message={toast.message}
          icon={toast.undo === "skip" ? "undo" : "check_circle"}
          onClose={closeToast}
          actions={
            <>
              {toast.undo === "skip" ? (
                <SnackbarAction onClick={undoSkip}>Undo</SnackbarAction>
              ) : null}
              {toast.undo === "create" ? (
                <SnackbarAction onClick={() => void undoCreatedLead()}>Undo</SnackbarAction>
              ) : null}
              {toast.leadKey === undefined ? null : (
                <Link
                  className={styles.snackLink}
                  to={`/leads/${encodeURIComponent(toast.leadKey)}`}
                >
                  Open lead
                </Link>
              )}
            </>
          }
        />
      )}
    </section>
  );
}
