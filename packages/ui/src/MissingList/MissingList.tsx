// The Missing list: what is not available, grouped by reason, as a short bulleted list instead of
// a wall of grey pills. One bullet per distinct reason with its fields joined ("Not on the source
// record: city, ZIP code"); the reason wording is the caller's, verbatim from the contract
// (provenance rule: missing data says why). More than `limit` bullets collapse behind a
// "Show all N" disclosure button. Render-only; MissingReason stays for single compact icon cases.
import { useId, useState, type ReactElement } from "react";
import { Icon } from "../Icon/Icon";
import styles from "./MissingList.module.css";

export interface MissingListGroup {
  /** Stable key (reason plus wording). */
  readonly key: string;
  /** The reason, verbatim (e.g. "Not on the source record"). */
  readonly reason: string;
  /** The fields it applies to, already in plain language and joined ("city, ZIP code"). */
  readonly fields: string;
  /** Per-row total ("25 rows"), only where the data is a count over rows. */
  readonly count?: string | undefined;
  /** Extra `data-*` hooks (raw reason code, raw field names). */
  readonly data?: Readonly<Record<string, string>> | undefined;
}

export interface MissingListProps {
  readonly groups: readonly MissingListGroup[];
  /** Bullets shown before the "Show all N" disclosure. Defaults to 3. */
  readonly limit?: number;
  readonly label?: string;
}

export function MissingList({
  groups,
  limit = 3,
  label = "Missing data",
}: MissingListProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const restId = useId();
  if (groups.length === 0) return null;
  const collapsible = groups.length > limit;
  const shown = collapsible && !open ? groups.slice(0, limit) : groups;
  return (
    <div className={styles.wrap} data-missing-list="">
      <ul className={styles.list} aria-label={label} id={restId}>
        {shown.map((g) => (
          <li
            key={g.key}
            className={styles.item}
            {...Object.fromEntries(Object.entries(g.data ?? {}).map(([k, v]) => [`data-${k}`, v]))}
          >
            <Icon name="remove" size="small" />
            <span className={styles.text}>
              <span className={styles.reason}>{g.reason}</span>
              {`: ${g.fields}`}
              {g.count === undefined ? "" : ` (${g.count})`}
            </span>
          </li>
        ))}
      </ul>
      {collapsible ? (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={restId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Show fewer" : `Show all ${String(groups.length)}`}
        </button>
      ) : null}
    </div>
  );
}
