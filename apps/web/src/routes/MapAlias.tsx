// "/map" is the handoff's name for the CRM map (CRM-HANDOFF routes table: /map?view=list,
// /map?triage=1) and what the Leads list's "Show on map" links to. The map lives at "/", so
// "/map" redirects there and keeps the query string (area, filters, view).
import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router";

export function MapAlias(): ReactElement {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/", search, hash }} replace />;
}
