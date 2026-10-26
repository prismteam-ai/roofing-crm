// A pane's minimise/restore handle, on the pane's inner edge (left pane: its right edge; right
// pane: its left edge). A 48 px chevron button with aria-expanded and aria-controls; collapsed, the
// pane is a slim 48 px rail that still shows this handle and a vertical label.
import { Icon } from "@crm/ui";
import type { ReactElement } from "react";
import type { PaneSide } from "./paneState.js";
import styles from "./PaneHandle.module.css";

export interface PaneHandleProps {
  readonly side: PaneSide;
  /** "filters" or "results": names the button and the collapsed rail. */
  readonly label: "filters" | "results";
  readonly collapsed: boolean;
  /** The id of the pane body this handle shows or hides. */
  readonly controls: string;
  readonly onToggle: () => void;
}

export function PaneHandle({
  side,
  label,
  collapsed,
  controls,
  onToggle,
}: PaneHandleProps): ReactElement {
  // The chevron points where the pane will go: a left pane hides leftwards, a right one rightwards.
  const hides = side === "left" ? "chevron_left" : "chevron_right";
  const shows = side === "left" ? "chevron_right" : "chevron_left";
  const name = `${collapsed ? "Show" : "Hide"} ${label} panel`;
  return (
    <div className={styles.handleRow} data-side={side} data-collapsed={collapsed}>
      <button
        type="button"
        className={styles.handle}
        aria-expanded={!collapsed}
        aria-controls={controls}
        aria-label={name}
        title={name}
        onClick={onToggle}
      >
        <Icon name={collapsed ? shows : hides} />
      </button>
      {collapsed ? (
        <span className={styles.label} data-pane-label="">
          {label === "filters" ? "Filters" : "Results"}
        </span>
      ) : null}
    </div>
  );
}
