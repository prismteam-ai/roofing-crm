// The app-switcher rows (design-system § 15; review log row 3; CrmAppsMenu): CountyLens, Roofing
// CRM (current, checked, aria-current) and the landing page. Used as menu items in the top bar's
// Apps menu (>= 600 px) and as plain links under "Apps" in the 390 More sheet. Links come from
// `shell.appLinks` (server config); a link the config does not give says so instead of guessing.
import type { ReactElement } from "react";
import { Link } from "react-router";
import { Icon } from "@crm/ui";
import { useShellAppLinks } from "./shellApi.js";
import styles from "./AppLinks.module.css";

export interface AppLinksProps {
  /** "menuitem" inside the Apps menu; omitted for the More sheet's plain links. */
  readonly itemRole?: "menuitem";
  readonly onNavigate?: () => void;
}

function Unavailable({
  icon,
  label,
  reason,
  itemRole,
}: {
  readonly icon: string;
  readonly label: string;
  readonly reason: string;
  readonly itemRole: "menuitem" | undefined;
}): ReactElement {
  return (
    <span role={itemRole} aria-disabled="true" className={`${styles.item} ${styles.unavailable}`}>
      <Icon name={icon} />
      <span className={styles.label}>{label}</span>
      <span className={styles.reason}>{reason}</span>
    </span>
  );
}

export function AppLinks({ itemRole, onNavigate }: AppLinksProps): ReactElement {
  const links = useShellAppLinks();
  const pendingReason = links.isError ? "Link not available" : "Loading";
  const countyLens = links.data?.countyLensUrl;
  const landing = links.data?.landingPageUrl;

  return (
    <>
      {countyLens === undefined || countyLens === null ? (
        <Unavailable
          icon="travel_explore"
          label="CountyLens"
          reason={countyLens === null ? "Not available yet" : pendingReason}
          itemRole={itemRole}
        />
      ) : (
        <a role={itemRole} href={countyLens} className={styles.item} onClick={onNavigate}>
          <Icon name="travel_explore" />
          <span className={styles.label}>CountyLens</span>
        </a>
      )}
      <Link
        role={itemRole}
        to="/"
        aria-current="page"
        className={`${styles.item} ${styles.current}`}
        onClick={onNavigate}
      >
        <Icon name="roofing" />
        <span className={styles.label}>Roofing CRM</span>
        <span className={styles.check} title="Current app">
          <Icon name="check" />
        </span>
      </Link>
      {landing === undefined || landing === null ? (
        <Unavailable
          icon="home"
          label="Landing page"
          reason={landing === null ? "Not available yet" : pendingReason}
          itemRole={itemRole}
        />
      ) : (
        <a role={itemRole} href={landing} className={styles.item} onClick={onNavigate}>
          <Icon name="home" />
          <span className={styles.label}>Landing page</span>
        </a>
      )}
    </>
  );
}
