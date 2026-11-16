import type { LatLon } from "@roofing-crm/geo";

/**
 * The pin's coordinates are rounded to PIN_DECIMALS (about 1 m) where the pin is placed, so the search, the map
 * points, the long-open permits, the leads in the search, the center sent to the agent and every place the pin is
 * shown use the same value.
 */
export const PIN_DECIMALS = 5;
/** A coordinate rounded to PIN_DECIMALS. */
export const roundCoord = (x: number): number =>
  Number(x.toFixed(PIN_DECIMALS));
/** A point rounded to PIN_DECIMALS. */
export const roundPin = (p: LatLon): LatLon => ({
  lat: roundCoord(p.lat),
  lon: roundCoord(p.lon),
});
/** A coordinate as shown and keyed: exactly PIN_DECIMALS decimals. */
export const coordText = (x: number): string => x.toFixed(PIN_DECIMALS);
