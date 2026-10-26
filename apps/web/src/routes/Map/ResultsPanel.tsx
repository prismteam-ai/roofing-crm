// B-03 results panel header (CRM-HANDOFF §4.2/§9.1, boards CrmMapPin390 and CrmMap768): the
// "Matches N" count, the coverage-note info icon, collapse-all and expand-all for the rows, and the
// Triage entry. Wraps the rows (children) and the pager (footer). Render-only: ResultsList owns the
// rows and their state, Map.tsx owns the query. The sheet behaviour (peek/full on phones, docked
// below the map on tablets, the right pane from 1280 px) is ResultsSheet's.
import { Icon, Popover } from "@crm/ui";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import styles from "./ResultsPanel.module.css";

export interface ResultsPanelProps {
  readonly count: number;
  /** The number on the Triage button: the swipe stack's length (the rows actually listed), which
   *  can be below `count` when the server total is more than one page. Defaults to `count`. */
  readonly triageCount?: number;
  readonly children: ReactNode;
  /** The pager, drawn under the rows. */
  readonly footer?: ReactNode;
  /** Shows the "Triage n" action after the header icons: the filled button on phones (board
   *  CrmMapPin390), an icon-only button from 768 px (the tablet board has none; the feature stays
   *  reachable). Absent from 1280 px. */
  readonly onTriage?: () => void;
  /** Collapse all / expand all (boards CrmMap768): absent, the two icons are not drawn. */
  readonly onCollapseAll?: () => void;
  readonly onExpandAll?: () => void;
  /** An honest line under the header when the server clipped a page. */
  readonly note?: string | undefined;
}

/** CRM-HANDOFF §4.2 "Coverage note": the full text behind the results-header info icon. Static
 *  copy — this story has no coverage-gap polygon to test against (none is published yet), so the
 *  icon always opens the same explanatory note rather than claiming to detect a real gap (honest
 *  simplification, called out in the build report). */
const COVERAGE_NOTE =
  "Permits are shown only where CountyLens publishes them. Part of this area may have no permit data.";

export function ResultsPanel({
  count,
  triageCount,
  children,
  footer,
  onTriage,
  onCollapseAll,
  onExpandAll,
  note,
}: ResultsPanelProps): ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={styles.sheet}>
      <header className={styles.head}>
        <span className={styles.matches}>{`Matches ${count}`}</span>
        <span className={styles.spacer} />
        <span className={styles.infoWrap}>
          <button
            type="button"
            className={styles.info}
            aria-label="Permit coverage note"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name="info" size="medium" />
          </button>
          <div id={id}>
            <Popover
              open={open}
              onClose={() => setOpen(false)}
              label="Permit coverage note"
              align="end"
            >
              <p className={styles.note}>{COVERAGE_NOTE}</p>
            </Popover>
          </div>
        </span>
        {onCollapseAll === undefined ? null : (
          <button
            type="button"
            className={styles.bulk}
            aria-label="Collapse all"
            title="Collapse all"
            onClick={onCollapseAll}
          >
            <Icon name="unfold_less" size="medium" />
          </button>
        )}
        {onExpandAll === undefined ? null : (
          <button
            type="button"
            className={styles.bulk}
            aria-label="Expand all"
            title="Expand all"
            onClick={onExpandAll}
          >
            <Icon name="unfold_more" size="medium" />
          </button>
        )}
        {onTriage === undefined ? null : (
          <button type="button" className={styles.triage} onClick={onTriage}>
            <Icon name="swipe" size="medium" />
            <span className={styles.triageText}>{`Triage ${triageCount ?? count}`}</span>
          </button>
        )}
      </header>
      {note === undefined ? null : (
        <p className={styles.clipNote} role="status" data-state="CrmMapResultsClipped">
          {note}
        </p>
      )}
      {children}
      {footer}
    </div>
  );
}
