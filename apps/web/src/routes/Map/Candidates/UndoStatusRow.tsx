// The inline "Created n leads · Undo" row (candidate list and the AI panel). The result snackbar
// goes after 10 s but `leads.undoCreate` allows `UNDO_WINDOW_MS` (15 minutes), so this row stays
// until that window ends (client clock, counted from the create time) or it is dismissed. After an
// undo it shows what the server did, with the same honest kept-reasons as the snackbar always did.
import { Icon } from "@crm/ui";
import { UNDO_WINDOW_MS } from "@crm/shared";
import { useEffect, type ReactElement } from "react";
import styles from "./UndoStatusRow.module.css";

export interface UndoStatusRowProps {
  /** Leads this create made (and only those). */
  readonly count: number;
  /** Epoch milliseconds when they were created, on the client clock. */
  readonly createdAt: number;
  readonly undoing: boolean;
  /** The outcome of an undo ("Undid 1 lead · 1 kept (...)"); the row then has no Undo. */
  readonly summary?: string | undefined;
  readonly onUndo: () => void;
  /** Hide the row (also called when the undo window ends). */
  readonly onDismiss: () => void;
}

export function UndoStatusRow({
  count,
  createdAt,
  undoing,
  summary,
  onUndo,
  onDismiss,
}: UndoStatusRowProps): ReactElement | null {
  const remaining = createdAt + UNDO_WINDOW_MS - Date.now();
  useEffect(() => {
    if (remaining <= 0) {
      onDismiss();
      return;
    }
    const id = window.setTimeout(onDismiss, remaining);
    return () => window.clearTimeout(id);
  }, [remaining, onDismiss]);
  if (remaining <= 0) return null;
  return (
    <div className={styles.row} role="status" aria-live="polite" data-state="CrmUndoRow">
      <Icon name={summary === undefined ? "history" : "check_circle"} size="medium" />
      <span className={styles.text}>
        {summary ?? `Created ${String(count)} ${count === 1 ? "lead" : "leads"}`}
      </span>
      {summary === undefined ? (
        <button type="button" className={styles.undo} disabled={undoing} onClick={onUndo}>
          {undoing ? "Undoing…" : "Undo"}
        </button>
      ) : null}
      <button type="button" className={styles.close} aria-label="Hide undo" onClick={onDismiss}>
        <Icon name="close" size="medium" />
      </button>
    </div>
  );
}
