// The map's view keys (CRM-HANDOFF §5 URL table): `view=list` opens the Candidate list,
// `triage=1` opens Field triage. Every other key (centre, radius, roof, sel, ...) is kept, so
// reload, back and a shared link reopen the same view over the same filters.
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

export type MapView = "map" | "list";

export interface MapViewParam {
  readonly view: MapView;
  readonly triage: boolean;
  readonly setView: (view: MapView) => void;
  readonly setTriage: (on: boolean) => void;
}

export function parseMapView(params: URLSearchParams): { view: MapView; triage: boolean } {
  return {
    view: params.get("view") === "list" ? "list" : "map",
    triage: params.get("triage") === "1",
  };
}

export function patchMapView(
  params: URLSearchParams,
  patch: { view?: MapView; triage?: boolean },
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (patch.view !== undefined) {
    if (patch.view === "list") next.set("view", "list");
    else next.delete("view");
  }
  if (patch.triage !== undefined) {
    if (patch.triage) next.set("triage", "1");
    else next.delete("triage");
  }
  return next;
}

export function useMapViewParam(): MapViewParam {
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(() => parseMapView(params), [params]);
  const setView = useCallback(
    (view: MapView) => setParams((prev) => patchMapView(prev, { view })),
    [setParams],
  );
  const setTriage = useCallback(
    (on: boolean) => setParams((prev) => patchMapView(prev, { triage: on })),
    [setParams],
  );
  return { ...parsed, setView, setTriage };
}
