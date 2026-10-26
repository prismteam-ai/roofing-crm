// B-03 map controls (CRM-HANDOFF §4.2/§10 keyboard model A-4): zoom +/- and a recentre control,
// stacked top-right of the map the way every CrmMap board shows them. Drives the live MapLibre
// instance through CrmMap's own imperative handle (CrmMap.tsx) — never a second source of truth
// for zoom/center. Render-only.
import { IconButton } from "@crm/ui";
import type { ReactElement } from "react";
import type { CrmMapHandle } from "./CrmMap.js";
import styles from "./MapControls.module.css";

export interface MapControlsProps {
  readonly mapRef: { readonly current: CrmMapHandle | null };
  /** "Recentre" (the board's fit control, E-67): with a pin/GPS point, fits the search ring; with
   *  none, returns to the whole-county view. */
  readonly recenterLabel?: string;
  /** "Drop pin" (boards CrmMap*, last control): starts pin mode. Hidden when not given. */
  readonly onDropPin?: () => void;
  /** Pin mode is on: the Drop pin control shows as pressed. */
  readonly pinMode?: boolean;
}

export function MapControls({
  mapRef,
  recenterLabel = "Recentre",
  onDropPin,
  pinMode = false,
}: MapControlsProps): ReactElement {
  return (
    <div className={styles.stack}>
      <IconButton icon="add" label="Zoom in" onClick={() => mapRef.current?.zoomIn()} />
      <IconButton icon="remove" label="Zoom out" onClick={() => mapRef.current?.zoomOut()} />
      <IconButton
        icon="center_focus_strong"
        label={recenterLabel}
        onClick={() => mapRef.current?.recenter()}
      />
      {onDropPin === undefined ? null : (
        <IconButton
          icon="add_location_alt"
          label="Drop pin"
          active={pinMode}
          aria-pressed={pinMode}
          onClick={onDropPin}
        />
      )}
    </div>
  );
}
