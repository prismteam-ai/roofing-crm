// The banners on the Leads screens (boards CrmLeadsError390, CrmLeadsPartial390, CrmLeadSaveFailed390,
// CrmLeadStale390, CrmLeadElsewhere390): an Atlas banner with a leading icon, a bold headline, the
// rest of the sentence and one text action. Errors are announced as alerts, everything else as
// polite status text.
import { Icon } from "@crm/ui";
import type { ReactElement } from "react";
import styles from "./LeadBanner.module.css";

export interface LeadBannerProps {
  readonly kind: "error" | "warning" | "info";
  readonly icon: string;
  /** The bold first sentence. */
  readonly headline: string;
  /** The rest of the message. */
  readonly children?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function LeadBanner({
  kind,
  icon,
  headline,
  children,
  actionLabel,
  onAction,
}: LeadBannerProps): ReactElement {
  return (
    <div
      className={`${styles.banner} ${styles[kind]}`}
      role={kind === "error" ? "alert" : "status"}
      data-banner={kind}
    >
      <Icon name={icon} />
      <p className={styles.text}>
        <strong>{headline}</strong>
        {children === undefined ? null : ` ${children}`}
      </p>
      {actionLabel === undefined || onAction === undefined ? null : (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
