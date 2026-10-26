// Atlas snackbar (CrmCandidatesCreated390, triage snackbars): inverse surface, a leading status
// glyph, one line of text, up to two text actions and a close button. Polite live region, so the
// result is announced without moving focus. Dismisses itself after `timeoutMs` (0 = never).
import { Icon } from "@crm/ui";
import { useEffect, type ReactElement, type ReactNode } from "react";
import styles from "./Snackbar.module.css";

export interface SnackbarProps {
  readonly message: string;
  readonly icon?: string;
  /** Text actions (buttons or links), in reading order. */
  readonly actions?: ReactNode;
  readonly onClose: () => void;
  readonly timeoutMs?: number;
}

export function Snackbar({
  message,
  icon = "check_circle",
  actions,
  onClose,
  timeoutMs = 10_000,
}: SnackbarProps): ReactElement {
  useEffect(() => {
    if (timeoutMs <= 0) return;
    const id = window.setTimeout(onClose, timeoutMs);
    return () => window.clearTimeout(id);
  }, [onClose, timeoutMs, message]);
  return (
    <div className={styles.snackbar} role="status" aria-live="polite" data-snackbar="">
      <div className={styles.line}>
        <Icon name={icon} size="medium" />
        <span className={styles.message}>{message}</span>
      </div>
      <div className={styles.actions}>
        {actions}
        <button type="button" className={styles.close} aria-label="Dismiss" onClick={onClose}>
          <Icon name="close" size="medium" />
        </button>
      </div>
    </div>
  );
}

/** A snackbar text action (inverse-primary). */
export function SnackbarAction({
  children,
  onClick,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button type="button" className={styles.action} onClick={onClick}>
      {children}
    </button>
  );
}

export const snackbarActionClass = styles.action;
