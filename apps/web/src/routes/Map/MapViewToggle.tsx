// The one segmented control above the map, at every width: Map + cards | List, a pure view switch
// (aria-pressed buttons in one group, exactly one selected, 48 px targets). It says nothing about
// the mode: AI mode is entered and left from the left pane's Filters | Ask AI switch (from 1280 px),
// the rail's Map > AI entry, the bottom bar's Ask tab and the Filters button, and the view stays
// selectable (and one option stays pressed) while it is on.
import { Icon } from "@crm/ui";
import type { ReactElement } from "react";
import styles from "./ViewToggle.module.css";

export type MapViewChoice = "cards" | "list";

const OPTIONS: readonly { value: MapViewChoice; label: string; icon: string }[] = [
  { value: "cards", label: "Map + cards", icon: "map" },
  { value: "list", label: "List", icon: "table_rows" },
];

export function MapViewToggle({
  selected,
  onSelect,
}: {
  readonly selected: MapViewChoice;
  readonly onSelect: (choice: MapViewChoice) => void;
}): ReactElement {
  return (
    <div role="group" aria-label="View" className={styles.group}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`${styles.segment} ${selected === option.value ? styles.on : ""}`}
          aria-pressed={selected === option.value}
          onClick={() => onSelect(option.value)}
        >
          <Icon name={option.icon} size="medium" />
          <span className={styles.label}>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
