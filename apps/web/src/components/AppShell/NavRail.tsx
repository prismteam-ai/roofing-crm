// The rail's "Coming soon" group (>= 600 px; CRM-HANDOFF E-64, board CrmShell1440): a group
// label, then the five sections as icon + short label + "Soon" items contained in the 80 px rail
// (RoadmapItem "rail" layout). Hidden below 600 px, where the More sheet lists them instead.
import type { ReactElement } from "react";
import { RoadmapItem } from "./RoadmapItem.js";
import { ROADMAP_NAV } from "./navigation.js";
import styles from "./NavRail.module.css";

export function NavRail(): ReactElement {
  return (
    <div className={styles.rail} role="group" aria-label="Roadmap sections (not yet built)">
      <span className={styles.group} aria-hidden="true">
        Coming soon
      </span>
      {ROADMAP_NAV.map((item) => (
        <RoadmapItem key={item.section} item={item} layout="rail" />
      ))}
    </div>
  );
}
