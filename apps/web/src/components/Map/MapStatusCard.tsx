// A map status card (boards CrmGpsStates, CrmMapGps*, CrmMapPinMode*, CrmMapPinOutside390): an
// icon, one or two sentences and the actions the board draws, floating over the map so the
// radius, filters and list stay usable. Render-only; GPS, pin mode and pin-outside use it.
import { Icon } from "@crm/ui";
import type { ReactElement, ReactNode } from "react";
import styles from "./MapStatusCard.module.css";

export interface MapStatusAction {
  readonly label: string;
  readonly onClick: () => void;
  /** The one filled action of a card (board "Place pin here"). */
  readonly primary?: boolean;
}

export interface MapStatusCardProps {
  /** The `data-state` hook (a board name, e.g. CrmMapGpsDenied390). */
  readonly state: string;
  /** `status` for progress and good news, `alert` for something that went wrong. */
  readonly role: "status" | "alert";
  readonly icon: string;
  /** Spins the icon (the board's "Finding your location…"). */
  readonly spinning?: boolean;
  readonly children: ReactNode;
  readonly actions?: readonly MapStatusAction[];
  /** Adds a 48 px Close button that calls this. */
  readonly onClose?: () => void;
}

export function MapStatusCard({
  state,
  role,
  icon,
  spinning = false,
  children,
  actions = [],
  onClose,
}: MapStatusCardProps): ReactElement {
  return (
    <div role={role} data-state={state} className={styles.card}>
      <span className={`${styles.icon} ${spinning ? styles.spin : ""}`}>
        <Icon name={icon} />
      </span>
      <p className={styles.message}>{children}</p>
      {onClose === undefined ? null : (
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      )}
      {actions.length === 0 ? null : (
        <div className={styles.actions}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.primary === true ? styles.primary : styles.action}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
