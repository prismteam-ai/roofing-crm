// The catch-all route inside the shell: a path that matches no screen (a mistyped URL, an old
// link) says so in the Atlas coming-soon card layout, with a way back to the Map, instead of
// leaving the page body blank. Reuses ComingSoon.module.css so the card looks like its siblings.
import type { ReactElement } from "react";
import { Link, useLocation } from "react-router";
import { Icon } from "@crm/ui";
import { LIVE_SECTION_LABELS } from "../components/AppShell/navigation.js";
import styles from "./ComingSoon.module.css";

export function Component(): ReactElement {
  const { pathname } = useLocation();
  return (
    <section
      aria-label="Page not found"
      data-route="not-found"
      data-state="not-found"
      className={styles.page}
    >
      <div className={styles.card}>
        <span className={styles.icon}>
          <Icon name="search_off" />
        </span>
        <h2 className={styles.title}>There’s no page here</h2>
        <p className={styles.body}>
          This link doesn’t match a screen in the Roofing CRM. The live sections are{" "}
          {LIVE_SECTION_LABELS.join(" and ")}.
        </p>
        <p className={styles.provenance}>
          <Icon name="info" size="small" />
          <span>{`Roofing CRM · unknown path “${pathname.slice(0, 40)}”`}</span>
        </p>
        <div className={styles.actions}>
          <Link to="/" className={styles.button} data-variant="filled">
            <Icon name="map" size="medium" />
            Back to Map
          </Link>
        </div>
      </div>
    </section>
  );
}
