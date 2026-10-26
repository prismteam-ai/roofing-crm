// The Leads list beside the open lead at 1440 (board CrmLead1440, E-83): my leads, the open one
// marked, each row a link to its lead page. Shares the list query (same input as /leads, so the
// cache is shared). Only mounted from the split width, so a phone never fetches it.
import { StatusPill } from "@crm/ui";
import type { ReactElement } from "react";
import { Link } from "react-router";
import { STATUS_LABEL } from "./LeadFilters.js";
import { LEAD_STATUS_ICON, LEAD_STATUS_KIND } from "./LeadsList.js";
import { LEAD_PAGE_SIZE } from "./leadFilters.state.js";
import { leadTime } from "./leadFormat.js";
import { useLeadsList } from "./leadsApi.js";
import styles from "./Leads.module.css";

export function LeadsPane({ currentKey }: { readonly currentKey: string }): ReactElement {
  const result = useLeadsList({ limit: LEAD_PAGE_SIZE });
  const total = result.status === "success" ? result.data.totalCount : undefined;
  return (
    <aside className={styles.pane} aria-label="My leads">
      <div className={styles.paneHead}>
        <h2 className={styles.paneTitle}>
          Leads
          {total === undefined ? null : (
            <span className={styles.headCountShown}>{` · ${total}`}</span>
          )}
        </h2>
        <Link className={styles.link} to="/leads">
          All filters
        </Link>
      </div>
      {result.status === "pending" ? (
        <p className={styles.meta} role="status">
          Loading your leads…
        </p>
      ) : result.status === "error" ? (
        <p className={styles.meta}>Your leads could not be listed here. Open Leads to retry.</p>
      ) : result.data.leads.length === 0 ? (
        <p className={styles.meta}>No leads yet.</p>
      ) : (
        <ul className={styles.paneList}>
          {result.data.leads.map((lead) => {
            const current = lead.leadKey === currentKey;
            return (
              <li key={lead.leadKey}>
                <Link
                  className={`${styles.paneRow} ${current ? styles.paneRowCurrent : ""}`}
                  to={`/leads/${encodeURIComponent(lead.leadKey)}`}
                  aria-current={current ? "page" : undefined}
                >
                  <span className={styles.paneRowTop}>
                    <span className={styles.paneAddress}>{lead.address}</span>
                    <StatusPill
                      status={LEAD_STATUS_KIND[lead.status]}
                      text={STATUS_LABEL[lead.status]}
                      icon={LEAD_STATUS_ICON[lead.status]}
                    />
                  </span>
                  <span className={styles.meta}>{`Created ${leadTime(lead.createdAt)}`}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
