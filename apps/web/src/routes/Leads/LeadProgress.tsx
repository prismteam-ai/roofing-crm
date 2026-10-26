// The thin progress bar at the top of a loading card (boards CrmLeadLoading390, CrmLeadsLoading390):
// an indeterminate Atlas linear indicator. It carries no value, so it is announced as busy.
import type { ReactElement } from "react";
import styles from "./Leads.module.css";

export function LeadProgress({ label }: { readonly label: string }): ReactElement {
  return (
    <div className={styles.progressBar} role="progressbar" aria-label={label}>
      <span className={styles.progressFill} />
    </div>
  );
}
