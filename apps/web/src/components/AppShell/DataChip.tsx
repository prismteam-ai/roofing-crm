// The data-source chip and panel (CRM-HANDOFF E-62; boards CrmDataChip, CrmShellData1440; review
// log row 22: 48 px Close). The chip names the run the lead index is serving, read from
// `shell.indexInfo` — never a hard-coded run. Panel: the manifest CID (copyable), when it was
// promoted, and the links to the CountyLens data (manifest) page and to Verify for this run. States: loading, ready, unavailable (with Retry). The
// board's "updating to Run n" state needs a newer-run signal the API does not expose, so it is
// not drawn rather than guessed.
import { useRef, type ReactElement } from "react";
import { CidDisplay, formatUtc, Icon, IconButton } from "@crm/ui";
import { useShellAppLinks, useShellIndexInfo } from "./shellApi.js";
import { useDismiss } from "./useDismiss.js";
import styles from "./DataChip.module.css";

export interface DataChipProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
}

type ChipState = "loading" | "ready" | "error";

function runText(runId: string | null): string {
  return runId === null ? "run not recorded in the index" : `run ${runId}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The calendar date a run id carries (`20261024`, `2026-10-24`, `…-20261021t103516z`), or null. */
function runDate(runId: string): { day: number; month: string; year: number } | null {
  const match = /(?<!\d)(20\d{2})-?(0[1-9]|1[0-2])-?(0[1-9]|[12]\d|3[01])(?!\d)/.exec(runId);
  if (match === null) return null;
  return {
    day: Number(match[3]),
    month: MONTHS[Number(match[2]) - 1] ?? "",
    year: Number(match[1]),
  };
}

function runTail(runId: string): string {
  return `Run …${runId.slice(-6)}`;
}

/** The run number an id carries, or null: `…run3…` (`travis-full-run3-20261025`) is run 3 (`travis-full-run3-1-20261025` is run 3.1), and an
 *  id that is only 1 to 3 digits is that run number. A date-only id (`20261024`) is not a run
 *  number, so the calendar date is parsed first and a purely numeric id counts only below 4 digits. */
function runNumber(runId: string): string | null {
  const labelled = /run(\d+)(?:-(\d{1,2})(?=-))?/i.exec(runId);
  if (labelled !== null) {
    const major = String(Number(labelled[1]));
    return labelled[2] === undefined ? major : `${major}.${labelled[2]}`;
  }
  return /^\d{1,3}$/.test(runId) ? String(Number(runId)) : null;
}

/** The compact chip text (board CrmShellApps768 "Run 3"): the run number when the id carries one,
 *  else a run id with a calendar date as "24 Oct", else the last six characters. The full id stays
 *  in the chip's tooltip, its name and the panel; the chip never invents a run. */
export function shortRunLabel(runId: string | null): string {
  if (runId === null || runId === "") return "Data";
  const number = runNumber(runId);
  if (number !== null) return `Run ${number}`;
  const date = runDate(runId);
  return date === null ? runTail(runId) : `${String(date.day)} ${date.month}`;
}

/** The wider chip text: "Run 3 · 25 Oct 2026" when the id has a run number and a date, "Run 3"
 *  with a number only, "Run 24 Oct 2026" for a date only, else as the short label; null when
 *  there is no run id. */
export function longRunLabel(runId: string | null): string | null {
  if (runId === null || runId === "") return null;
  const number = runNumber(runId);
  const date = runDate(runId);
  const dated = date === null ? null : `${String(date.day)} ${date.month} ${String(date.year)}`;
  if (number !== null) return dated === null ? `Run ${number}` : `Run ${number} · ${dated}`;
  return dated === null ? runTail(runId) : `Run ${dated}`;
}

/** The status line's run, as the board draws it ("Index up to date · Run 3"). */
function statusRun(runId: string | null): string {
  if (runId === null) return runText(null);
  const number = runNumber(runId);
  return number === null ? (longRunLabel(runId) ?? runText(runId)) : `Run ${number}`;
}

export function DataChip({ open, onToggle, onClose }: DataChipProps): ReactElement {
  const index = useShellIndexInfo();
  const links = useShellAppLinks();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, panel, trigger);

  const state: ChipState = index.data !== undefined ? "ready" : index.isError ? "error" : "loading";
  const label =
    state === "ready" && index.data !== undefined
      ? `Data: CountyLens ${runText(index.data.runId)}`
      : state === "error"
        ? "Data: Index unavailable"
        : "Data: loading";
  const icon = state === "ready" ? "cloud_done" : state === "error" ? "cloud_off" : "cloud_sync";

  return (
    <div className={styles.anchor}>
      <button
        ref={trigger}
        type="button"
        className={styles.chip}
        data-state={state}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        onClick={onToggle}
      >
        <span className={styles.stateIcon} data-state={state}>
          <Icon name={icon} size="small" />
        </span>
        <span className={styles.long}>
          {state === "ready" && index.data !== undefined
            ? `Data: CountyLens ${longRunLabel(index.data.runId) ?? runText(index.data.runId)}`
            : label}
        </span>
        <span className={styles.short} aria-hidden="true">
          {state === "ready" && index.data !== undefined ? shortRunLabel(index.data.runId) : "Data"}
        </span>
      </button>
      {open && (
        <div ref={panel} role="dialog" aria-label="Data source" className={styles.panel}>
          <div className={styles.header}>
            <h2 className={styles.title}>Data source</h2>
            <IconButton icon="close" label="Close" onClick={onClose} />
          </div>
          {index.data !== undefined ? (
            <>
              <p className={styles.body}>
                The lead index is built from the CountyLens manifest{" "}
                <CidDisplay cid={index.data.manifestCid} />
              </p>
              <p className={styles.body}>
                {index.data.promotedAt === ""
                  ? "Promotion time not recorded in the index."
                  : `Promoted ${formatUtc(index.data.promotedAt)} UTC.`}{" "}
                The CRM reads only published CountyLens data.
              </p>
              <p className={styles.status} data-state="ready">
                <span className={styles.stateIcon} data-state="ready">
                  <Icon name="cloud_done" size="small" />
                </span>
                {`Index up to date · ${statusRun(index.data.runId)}`}
              </p>
              <p className={styles.meta}>
                {`${index.data.propertyCount} properties · ${index.data.permitCount} permits`}
              </p>
            </>
          ) : index.isError ? (
            <>
              <p className={styles.status} data-state="error">
                <Icon name="cloud_off" size="small" />
                The lead index is unavailable, so map and list results may be missing. Your leads
                and notes still open.
              </p>
              <button type="button" className={styles.retry} onClick={() => void index.refetch()}>
                Retry
              </button>
            </>
          ) : (
            <p className={styles.status}>
              <Icon name="cloud_sync" size="small" />
              Reading the lead index…
            </p>
          )}
          {links.data?.countyLensUrl != null && (
            <>
              <a className={styles.link} href={`${links.data.countyLensUrl}/data/manifest`}>
                <Icon name="dataset" size="small" />
                CountyLens Data (manifest)
              </a>
              {index.data !== undefined && (
                <a
                  className={styles.link}
                  href={`${links.data.countyLensUrl}/data/verify/${encodeURIComponent(index.data.manifestCid)}`}
                >
                  <Icon name="verified" size="small" />
                  Verify this run
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
