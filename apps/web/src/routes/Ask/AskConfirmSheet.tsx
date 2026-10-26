// "Create leads for all n" confirmation (CrmAskConfirm390 / CrmAskConfirm1440): every proposed
// property with its main signal before anything is created; rows that are already leads or have no
// published location are listed as skipped and never sent. The agent never creates leads by itself.
//
// It reuses the look of the candidate list's sheet (`Map/Candidates/ConfirmSheet.module.css`,
// read-only) but not its component: that one words every lead as "created from the list" and needs
// the existing lead's status, which an `AgentAnswer` proposal does not carry (it has only
// `alreadyLead`). Here an already-lead row says "Already a lead · skipped" and the note says
// "created from Agent", as CRM-HANDOFF section 4.7 words it.
import { Icon } from "@crm/ui";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactElement } from "react";
import styles from "../Map/Candidates/ConfirmSheet.module.css";

export interface AskConfirmRow {
  readonly id: string;
  readonly title: string;
  readonly signal: string;
  /** `create` is sent; the other two are listed as skipped. */
  readonly state: "create" | "already" | "blocked";
  /** Why a `blocked` row is skipped (no published coordinates). */
  readonly reason?: string | undefined;
}

export interface AskConfirmSheetProps {
  readonly rows: readonly AskConfirmRow[];
  readonly running: boolean;
  /** The last attempt's failure text: the sheet stays open so Create again retries. */
  readonly error?: string | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

export function AskConfirmSheet({
  rows,
  running,
  error,
  onCancel,
  onConfirm,
}: AskConfirmSheetProps): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const toCreate = rows.filter((r) => r.state === "create");
  const already = rows.filter((r) => r.state === "already").length;
  const blocked = rows.filter((r) => r.state === "blocked").length;

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
  const notes: string[] = [`${String(rows.length)} proposed`];
  if (already > 0) notes.push(`${plural(already, "already a lead", "already leads")}, skipped`);
  if (blocked > 0) notes.push(`${String(blocked)} without a location, skipped`);

  return (
    <div className={styles.scrim} data-confirm-sheet="ask">
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
        <ul className={styles.list} aria-label="Proposed properties">
          {rows.map((row) => (
            <li key={row.id} className={styles.row} data-skipped={row.state !== "create"}>
              <span className={styles.rowIcon}>
                <Icon name={row.state === "create" ? "person_add" : "block"} size="medium" />
              </span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>{row.title}</span>
                <span className={styles.rowSignal}>{`Main signal: ${row.signal}`}</span>
                {row.state === "already" ? (
                  <span className={styles.skipPill}>Already a lead · skipped</span>
                ) : null}
                {row.state === "blocked" ? (
                  <span
                    className={styles.skipPill}
                  >{`${row.reason ?? "Can't be created"} · skipped`}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          Each new lead: status New, assigned to you, created from Agent. The main signal is the
          open or stalled permit when there is one, else the roof.
        </p>
        {error === undefined ? null : (
          <p role="alert" className={styles.note}>
            {error}
          </p>
        )}
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
            {running ? "Creating…" : createLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
