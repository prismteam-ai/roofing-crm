/**
 * Local-only Lee stand-in parcels when Elephant MCP geo/query tools time out.
 *
 * Same Haversine path as live `queryProperties`. Streets are labeled DEMO so
 * they are never mistaken for a published Chester catalog. Replace this loader
 * by injecting an ElephantMcpToolClient once MCP area search is reliable.
 */
import type {
  SearchInRadiusBoundingBox,
  SearchInRadiusPropertyRow,
} from "./routers/search.js";

/** Fort Myers pin-adjacent stand-ins for local tRPC search. */
export const LOCAL_LEE_STAND_IN_SEARCH_PROPERTY_ROWS: SearchInRadiusPropertyRow[] = [
  {
    propertyId: "lee-prop-browser-verify",
    parcelIdentifier: "browser-verify",
    latitude: 26.652,
    longitude: -81.858,
    builtYear: 1988,
    addressStreet: "DEMO — 1 Palm Ave",
    addressCity: "Fort Myers",
    addressZip: "33901",
    hasPermits: true,
    permitCount: 1,
    hasBbbContractor: true,
    gisMuni: null,
  },
  {
    propertyId: "lee-prop-no-built-year",
    parcelIdentifier: "no-built-year",
    latitude: 26.628,
    longitude: -81.886,
    builtYear: null,
    addressStreet: "DEMO — 9 New Construction Ln",
    addressCity: "Fort Myers",
    addressZip: "33901",
    hasPermits: false,
    permitCount: 0,
    hasBbbContractor: false,
    gisMuni: null,
  },
  {
    propertyId: "lee-prop-outside-default-radius",
    parcelIdentifier: "outside-default-radius",
    latitude: 26.6406,
    longitude: -82.15,
    builtYear: 1975,
    addressStreet: "DEMO — 40 West Cape Blvd",
    addressCity: "Cape Coral",
    addressZip: "33904",
    hasPermits: true,
    permitCount: 1,
    hasBbbContractor: false,
    gisMuni: null,
  },
];

/**
 * Returns stand-in rows whose centroids fall in the requested bbox.
 */
export async function listLocalLeeStandInPropertiesInBoundingBox(arguments_: {
  county: string;
  boundingBox: SearchInRadiusBoundingBox;
  center: { lat: number; lng: number };
}): Promise<SearchInRadiusPropertyRow[]> {
  const { boundingBox } = arguments_;
  return LOCAL_LEE_STAND_IN_SEARCH_PROPERTY_ROWS.filter(
    (propertyRow) =>
      propertyRow.latitude >= boundingBox.minLat &&
      propertyRow.latitude <= boundingBox.maxLat &&
      propertyRow.longitude >= boundingBox.minLng &&
      propertyRow.longitude <= boundingBox.maxLng,
  );
}
