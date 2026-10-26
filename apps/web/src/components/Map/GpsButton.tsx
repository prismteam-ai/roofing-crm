// T015 (B-03, US1): "Use my location" (AC-1's GPS centre point, AC-2's denied/unavailable
// fallback). Every state is an explicit, on-screen card — never a silent catch and never a blank
// map (constitution: a typed state, not an undefined one) — matching the boards CrmGpsStates,
// CrmMapLocating390, CrmMapGps390, CrmMapGpsLow390, CrmMapGpsDenied390, CrmMapGpsUnavailable390
// and CrmMapGpsOutside390: its own words, and the actions the board draws (Drop pin, Try again,
// Go to Travis County). The card renders into `statusHost` (the map's status slot) when given,
// else under the button. "Explain first" (the board's pre-prompt card) is not built: it would add a
// step before the browser prompt that the B-03 e2e does not expect (design/board-match/map.md).
import { useCallback, useId, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@crm/ui";
import { MapStatusCard, type MapStatusAction } from "./MapStatusCard.js";
import { COUNTY_NAME } from "../AppShell/navigation.js";
import styles from "./GpsButton.module.css";

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export type GpsState =
  | "idle"
  | "locating"
  | "located"
  | "lowAccuracy"
  | "denied"
  | "unavailable"
  | "timeout"
  | "outsideCounty";

/** Over this many metres a fix is "approximate" (board CrmMapGpsLow390: Wi-Fi or cell only). */
export const LOW_ACCURACY_M = 500;

/** "±12 m" under a kilometre, "±1.6 km" above (boards CrmMapGps390, CrmMapGpsLow390). */
export function formatAccuracy(meters: number): string {
  return meters < 1000 ? `±${String(Math.round(meters))} m` : `±${(meters / 1000).toFixed(1)} km`;
}

export interface GpsButtonProps {
  /** Called once a position is resolved and `isInCoverage` accepts it. */
  readonly onLocated: (point: LatLng) => void;
  /** AC-1's edge case 2 (outside Travis County): true when the point is inside the covered
   *  county. Defaults to "always inside" so a caller that has no coverage check yet still works. */
  readonly isInCoverage?: (point: LatLng) => boolean;
  /** Called with the fix's accuracy in metres (null when the browser reports none), so the map
   *  can draw the accuracy circle. A separate callback so `onLocated` keeps its one argument. */
  readonly onAccuracy?: (meters: number | null) => void;
  /** The search radius the ring will use ("The 5 mi ring centres on you"). */
  readonly radiusMi?: number;
  /** "Drop pin": the caller starts pin mode. */
  readonly onDropPin?: () => void;
  /** "Go to Travis County": the caller shows the whole county (the ring does not move). */
  readonly onGoToCounty?: () => void;
  /** Where the status card renders (a portal); under the button when absent. */
  readonly statusHost?: HTMLElement | null;
  /** Test-only seam: replaces `navigator.geolocation.getCurrentPosition` so Vitest never calls a
   *  real browser geolocation API. Defaults to `navigator.geolocation`. */
  readonly geolocation?: Pick<Geolocation, "getCurrentPosition">;
}

const STATE_NAME: Readonly<Record<Exclude<GpsState, "idle">, string>> = {
  locating: "CrmMapGpsLocating390",
  located: "CrmMapGps390",
  lowAccuracy: "CrmMapGpsLow390",
  denied: "CrmMapGpsDenied390",
  unavailable: "CrmMapGpsUnavailable390",
  // CRM-HANDOFF.md §4.2 covers "unavailable or timed out" as one combined board
  // (CrmMapGpsUnavailable390) — no separate "CrmMapGpsTimeout390" board exists in
  // design/prototype (found in review, CR-B-03). The `timeout` GpsState keeps its own copy
  // for a more specific message, but shares the one real board name.
  timeout: "CrmMapGpsUnavailable390",
  outsideCounty: "CrmMapGpsOutside390",
};

export function GpsButton({
  onLocated,
  isInCoverage = () => true,
  onAccuracy,
  radiusMi,
  onDropPin,
  onGoToCounty,
  statusHost,
  geolocation,
}: GpsButtonProps): ReactElement {
  const [state, setState] = useState<GpsState>("idle");
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const id = useId();

  const locate = useCallback(() => {
    const geo =
      geolocation ?? (typeof navigator === "undefined" ? undefined : navigator.geolocation);
    if (geo === undefined) {
      setState("unavailable");
      return;
    }
    setState("locating");
    geo.getCurrentPosition(
      (position) => {
        const point: LatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
        const accuracy =
          typeof position.coords.accuracy === "number" && Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null;
        setAccuracyM(accuracy);
        if (!isInCoverage(point)) {
          setState("outsideCounty");
          // Same as the map-click path (TC-008): the point is still handed to the caller so
          // Map.tsx's outside-county banner logic runs off the located point regardless of
          // entry method — only the GPS button's own status text differs (found in review,
          // CR-B-03: the two paths used to disagree here).
          onLocated(point);
          return;
        }
        setState(accuracy !== null && accuracy > LOW_ACCURACY_M ? "lowAccuracy" : "located");
        onAccuracy?.(accuracy);
        onLocated(point);
      },
      (error) => {
        // GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
        if (error.code === 1) setState("denied");
        else if (error.code === 3) setState("timeout");
        else setState("unavailable");
      },
    );
  }, [geolocation, isInCoverage, onAccuracy, onLocated]);

  const close = useCallback(() => setState("idle"), []);
  const dropPin: MapStatusAction | null =
    onDropPin === undefined
      ? null
      : {
          label: "Drop pin",
          onClick: () => {
            setState("idle");
            onDropPin();
          },
        };
  const ring =
    radiusMi === undefined
      ? "The ring centres on you."
      : `The ${String(radiusMi)} mi ring centres on you.`;

  let card: ReactElement | null = null;
  if (state !== "idle") {
    const name = STATE_NAME[state];
    if (state === "locating") {
      card = (
        <MapStatusCard state={name} role="status" icon="progress_activity" spinning>
          Finding your location…
        </MapStatusCard>
      );
    } else if (state === "located") {
      card = (
        <MapStatusCard state={name} role="status" icon="my_location" onClose={close}>
          {accuracyM === null ? "You are here." : `You are here (${formatAccuracy(accuracyM)}).`}{" "}
          {ring}
        </MapStatusCard>
      );
    } else if (state === "lowAccuracy") {
      card = (
        <MapStatusCard
          state={name}
          role="status"
          icon="location_searching"
          actions={dropPin === null ? [] : [dropPin]}
          onClose={close}
        >
          {`Location is approximate (${formatAccuracy(accuracyM ?? 0)}). The ring centres on the best guess; drop a pin for an exact spot.`}
        </MapStatusCard>
      );
    } else if (state === "denied") {
      card = (
        <MapStatusCard
          state={name}
          role="alert"
          icon="location_off"
          actions={dropPin === null ? [] : [dropPin]}
          onClose={close}
        >
          Location is off. Drop a pin or search a place instead.
        </MapStatusCard>
      );
    } else if (state === "unavailable" || state === "timeout") {
      card = (
        <MapStatusCard
          state={name}
          role="alert"
          icon="location_disabled"
          actions={[
            ...(dropPin === null ? [] : [dropPin]),
            { label: "Try again", onClick: locate },
          ]}
          onClose={close}
        >
          {state === "timeout"
            ? "Your location isn't available: the request timed out."
            : "Your location isn't available."}
        </MapStatusCard>
      );
    } else {
      card = (
        <MapStatusCard
          state={name}
          role="alert"
          icon="wrong_location"
          actions={
            onGoToCounty === undefined
              ? []
              : [
                  {
                    label: `Go to ${COUNTY_NAME}`,
                    onClick: () => {
                      setState("idle");
                      onGoToCounty();
                    },
                  },
                ]
          }
          onClose={close}
        >
          You are outside {COUNTY_NAME}. The CRM covers {COUNTY_NAME} only.
        </MapStatusCard>
      );
    }
  }

  const describedBy = state === "idle" ? undefined : `${id}-state`;
  const hosted = card !== null && statusHost !== undefined && statusHost !== null;

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={locate}
        aria-describedby={describedBy}
      >
        <Icon name="my_location" size="medium" />
        <span className={styles.text}>Use my location</span>
      </button>
      {card === null ? null : hosted ? (
        createPortal(<div id={`${id}-state`}>{card}</div>, statusHost)
      ) : (
        <div id={`${id}-state`}>{card}</div>
      )}
    </div>
  );
}
