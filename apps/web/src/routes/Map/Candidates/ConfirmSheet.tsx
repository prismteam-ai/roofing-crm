// E-75 bulk-create confirmation (CrmCandidatesConfirm390 / 1440): every selected property with its
// main signal; rows that are already leads are marked "Already a lead · {status} · skipped" and
// are not sent. A bottom sheet below 600 px, a centred dialog above. Escape and Cancel close it;
// focus starts on the primary action and stays inside while open.
import { Icon } from "@crm/ui";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactElement } from "react";
import { STATUS_LABEL } from "../../Leads/LeadFilters.js";
import type { CandidateLead } from "./candidates.js";
import styles from "./ConfirmSheet.module.css";

export interface ConfirmRow {
  readonly id: string;
  readonly title: string;
  readonly signal: string;
  readonly lead: CandidateLead | null;
  /** Set when the row cannot be sent (no published location); shown instead of creating it. */
  readonly blockedReason?: string | undefined;
}

export interface ConfirmSheetProps {
  readonly rows: readonly ConfirmRow[];
  readonly running: boolean;
  readonly done: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

export function ConfirmSheet({
  rows,
  running,
  done,
  onCancel,
  onConfirm,
}: ConfirmSheetProps): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const toCreate = rows.filter((r) => r.lead === null && r.blockedReason === undefined);
  const skipped = rows.length - toCreate.length;
  const leadsSkipped = rows.filter((r) => r.lead !== null).length;

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape" && !running) {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Tab" || dialogRef.current === null) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const createLabel = `Create ${plural(toCreate.length, "lead", "leads")}`;
  const notes: string[] = [`${String(rows.length)} selected`];
  if (leadsSkipped > 0)
    notes.push(`${plural(leadsSkipped, "already a lead", "already leads")}, skipped`);
  if (skipped - leadsSkipped > 0)
    notes.push(`${String(skipped - leadsSkipped)} without a location, skipped`);

  return (
    <div className={styles.scrim} data-confirm-sheet="">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.sheet}
        onKeyDown={onKeyDown}
      >
        <span className={styles.handle} aria-hidden="true" />
        <h2 id={titleId} className={styles.title}>{`${createLabel}?`}</h2>
        <p className={styles.sub}>{notes.join(" · ")}</p>
        <ul className={styles.list} aria-label="Selected properties">
          {rows.map((row) => {
            const skippedRow = row.lead !== null || row.blockedReason !== undefined;
            return (
              <li key={row.id} className={styles.row} data-skipped={skippedRow}>
                <span className={styles.rowIcon}>
                  <Icon name={skippedRow ? "block" : "person_add"} size="medium" />
                </span>
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle}>{row.title}</span>
                  <span className={styles.rowSignal}>{`Main signal: ${row.signal}`}</span>
                  {row.lead === null ? null : (
                    <span className={styles.skipPill}>
                      {`Already a lead · ${STATUS_LABEL[row.lead.status]} · skipped`}
                    </span>
                  )}
                  {row.lead === null && row.blockedReason !== undefined ? (
                    <span className={styles.skipPill}>{`${row.blockedReason} · skipped`}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        <p className={styles.note}>
          Each new lead: status New, assigned to you, created from the list. The main signal is the
          open or stalled permit when there is one, else the roof.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.text} onClick={onCancel} disabled={running}>
            Cancel
          </button>
          <button
            ref={primaryRef}
            type="button"
            className={styles.filled}
            onClick={onConfirm}
            disabled={running || toCreate.length === 0}
          >
            <Icon name="person_add" size="medium" />
            {running ? `Creating ${String(done)} of ${String(toCreate.length)}…` : createLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
