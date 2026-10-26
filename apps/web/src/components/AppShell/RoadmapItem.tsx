// One not-yet-built section (CRM-HANDOFF E-64; boards CrmShell1440 rail, CrmBottomNav sheet).
// Keeps NavRow's contract (packages/ui): role="button", aria-disabled="true", focusable, title
// "Coming soon", `data-roadmap-section`, and a click or Enter/Space opens /coming-soon/:section
// (AC-5). Two layouts: "rail" stacks icon, short label and the "Soon" pill inside the 80 px rail;
// "sheet" is the 390 More-sheet row (icon, name, one line, "Coming soon" pill). Muted
// on-surface-variant text, not the 38% disabled opacity (E-64). The one line is the row's
// accessible description, so the accessible name stays the section label.
import { useCallback, useId, type KeyboardEvent, type ReactElement } from "react";
import { useMatch, useNavigate } from "react-router";
import { Icon } from "@crm/ui";
import type { RoadmapNavItem } from "./navigation.js";
import styles from "./RoadmapItem.module.css";

export interface RoadmapItemProps {
  readonly item: RoadmapNavItem;
  readonly layout: "rail" | "sheet";
  readonly onNavigate?: () => void;
}

export function RoadmapItem({ item, layout, onNavigate }: RoadmapItemProps): ReactElement {
  const navigate = useNavigate();
  const lineId = useId();
  // The section whose Coming-soon page is open is the current page: marked for assistive
  // technology and drawn with the same pill the primary destinations use (CrmShell390ComingSoon).
  const active = useMatch(`/coming-soon/${item.section}`) !== null;

  const activate = useCallback(() => {
    onNavigate?.();
    void navigate(`/coming-soon/${item.section}`);
  }, [navigate, item.section, onNavigate]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    },
    [activate],
  );

  const rail = layout === "rail";
  return (
    <div
      role="button"
      aria-disabled="true"
      tabIndex={0}
      title="Coming soon"
      aria-label={`${item.label}, coming soon`}
      aria-describedby={lineId}
      aria-current={active ? "page" : undefined}
      data-roadmap-section={item.section}
      data-active={active ? "" : undefined}
      className={rail ? styles.rail : styles.sheet}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <span className={styles.iconPill}>
        <Icon name={item.icon} />
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{item.label}</span>
        <span id={lineId} className={rail ? styles.hiddenLine : styles.line}>
          {item.line}
        </span>
      </span>
      <span className={styles.pill}>{rail ? "Soon" : "Coming soon"}</span>
    </div>
  );
}
