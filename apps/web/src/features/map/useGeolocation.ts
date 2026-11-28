import type { LatLon } from "@crm/shared";
import { useCallback, useState } from "react";

export type GeoStatus = "idle" | "locating" | "ok" | "denied" | "unavailable";

/** Browser GPS. Denied or missing geolocation is a state, never an exception (Review Focus 5). */
export function useGeolocation(opts: { onLocated?: (p: LatLon) => void } = {}) {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [position, setPosition] = useState<LatLon | undefined>();
  const { onLocated } = opts;
  const locate = useCallback(() => {
    const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    if (!geo || (typeof window !== "undefined" && window.isSecureContext === false)) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    geo.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude };
        setPosition(pos);
        setStatus("ok");
        onLocated?.(pos);
      },
      (err) => setStatus(err.code === 1 ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [onLocated]);
  return { status, position, locate };
}

export const GEO_MESSAGE: Partial<Record<GeoStatus, string>> = {
  locating: "Finding your location…",
  denied:
    "Location permission was denied. Using the Broward County center: click the map or search a city to move the search.",
  unavailable:
    "Location is unavailable in this browser. Using the Broward County center: click the map or search a city to move the search.",
};
