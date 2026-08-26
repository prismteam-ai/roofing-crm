import { useEffect, useRef, type JSX } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { createPlatRoofMarkerElement } from "./create-plat-roof-marker-element";
import type { MapLibreMapCanvasProps } from "./map-libre-map-canvas-props";
import { runWhenMapStyleReady } from "./run-when-map-style-ready";
import { shouldBloomRadiusCircle } from "./should-bloom-radius-circle";
import {
  resolvePlatRoofMarkerAgeBand,
  resolvePlatRoofMarkerAgeBandMetadata,
} from "./plat-roof-marker-age-band";
import {
  allowSearchPinDragOver,
  endSearchPinDrag,
  isSearchPinDropPayload,
  mapPointerToSearchCenter,
} from "./search-pin-drag";
import type { PlatRoofMarkerLeadState } from "./plat-roof-marker-lead-state";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";
import type { SearchMapCenter } from "./search-map-center";
import { triggerPlatRoofMarkerFocusBounce } from "./trigger-plat-roof-marker-focus-bounce";

export type { MapLibreMapCanvasProps };

/** Ink fill for the search-center pin. */
const SEARCH_IN_RADIUS_CANDIDATE_MARKER_COLOR = "#2c2a26";

/** Walk-radius interior tint — just enough ink to read inside vs outside the circle. */
const SEARCH_RADIUS_CIRCLE_FILL_OPACITY = 0.09;

const PLAT_LINEN = "#e8e2d6";
const PLAT_INK = "#2c2a26";
const PLAT_INK_MUTED = "#5c564c";
const PLAT_WATER = "#7f908c";
const PLAT_WATER_LABEL = "#3d5a80";
const PLAT_PARK = "#d4cec0";
/** Pale road fill — Positron inners are thick; ink here reads as black bars. */
const PLAT_ROAD_FILL = "#d9d2c4";
/** Muted street line, close to linen so the grid recedes behind labels. */
const PLAT_ROAD_LINE = "#b8b19f";

/**
 * OpenFreeMap Positron, no Mapbox/Google token. Recolored on load to india
 * ink on linen — Positron's default roads are pale fills and vanish under a plat tint.
 */
const PLAT_BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * MapLibre GL canvas with click-to-drop pin, radius circle, and search markers.
 *
 * Pin drops notify the parent so search-center state stays the source of truth.
 * Parcel markers come only from `searchInRadiusCandidates` (no fixture pins).
 */
export function MapLibreMapCanvas({
  searchMapCenter,
  mapViewCenter,
  searchRadiusMiles,
  onSearchMapCenterDrop,
  searchInRadiusCandidates = [],
  selectedPropertyId = null,
  onSearchInRadiusCandidateSelect,
  leadMarkerStateByPropertyId = {},
  mapCameraRecenterGeneration = 0,
  showSearchRadiusCircle = true,
  radiusCircleBloomToken = 0,
}: MapLibreMapCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const candidateMarkersRef = useRef<maplibregl.Marker[]>([]);
  const onDropRef = useRef(onSearchMapCenterDrop);
  onDropRef.current = onSearchMapCenterDrop;
  const onCandidateSelectRef = useRef(onSearchInRadiusCandidateSelect);
  onCandidateSelectRef.current = onSearchInRadiusCandidateSelect;
  const previousBloomTokenRef = useRef(0);
  const previousSelectedPropertyIdRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || mapRef.current !== null) {
      return;
    }

    const map = new maplibregl.Map({
      container,
      style: PLAT_BASEMAP_STYLE_URL,
      center: [mapViewCenter.longitude, mapViewCenter.latitude],
      zoom: 11,
      attributionControl: {},
    });
    mapRef.current = map;

    map.on("click", (event) => {
      onDropRef.current({
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      });
    });

    map.on("load", () => {
      applyPlatInkPaint(map);
      map.resize();
    });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            map.resize();
          });
    resizeObserver?.observe(container);

    return () => {
      resizeObserver?.disconnect();
      clearSearchInRadiusCandidateMarkers(candidateMarkersRef);
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Mount once; center/radius/candidate sync runs in effects below.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }

    const cameraCenter = searchMapCenter ?? mapViewCenter;
    map.easeTo({
      center: [cameraCenter.longitude, cameraCenter.latitude],
      duration: prefersReducedMotion() ? 0 : 400,
    });

    const syncPin = (): void => {
      if (searchMapCenter === null) {
        pinMarkerRef.current?.remove();
        pinMarkerRef.current = null;
        hideRadiusCircleSource(map);
        return;
      }

      if (pinMarkerRef.current === null) {
        pinMarkerRef.current = new maplibregl.Marker({
          element: createPlatPinElement(),
        })
          .setLngLat([searchMapCenter.longitude, searchMapCenter.latitude])
          .addTo(map);
      } else {
        pinMarkerRef.current.setLngLat([
          searchMapCenter.longitude,
          searchMapCenter.latitude,
        ]);
      }
    };

    return runWhenMapStyleReady(map, syncPin);
  }, [mapViewCenter, searchMapCenter, mapCameraRecenterGeneration]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }

    if (searchMapCenter === null || !showSearchRadiusCircle) {
      return runWhenMapStyleReady(map, () => {
        hideRadiusCircleSource(map);
      });
    }

    let cancelled = false;
    let animationFrameId = 0;

    const applyCircle = (radiusMiles: number): void => {
      ensureRadiusCircleSource(map, searchMapCenter, radiusMiles);
    };

    const previousBloomToken = previousBloomTokenRef.current;
    previousBloomTokenRef.current = radiusCircleBloomToken;

    const runBloom = (): void => {
      if (
        !shouldBloomRadiusCircle({
          radiusCircleBloomToken,
          previousBloomToken,
          prefersReducedMotion: prefersReducedMotion(),
        })
      ) {
        applyCircle(searchRadiusMiles);
        return;
      }

      const startedAt = performance.now();
      const durationMs = 400;

      const tick = (now: number): void => {
        if (cancelled) {
          return;
        }
        const progress = Math.min(1, (now - startedAt) / durationMs);
        const eased = 1 - (1 - progress) ** 3;
        applyCircle(searchRadiusMiles * eased);
        if (progress < 1) {
          animationFrameId = window.requestAnimationFrame(tick);
        }
      };

      animationFrameId = window.requestAnimationFrame(tick);
    };

    const cleanup = runWhenMapStyleReady(map, runBloom);

    return () => {
      cancelled = true;
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
      }
      cleanup?.();
    };
  }, [
    radiusCircleBloomToken,
    searchMapCenter,
    searchRadiusMiles,
    showSearchRadiusCircle,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }

    const selectionChanged =
      selectedPropertyId !== null &&
      selectedPropertyId !== previousSelectedPropertyIdRef.current;
    previousSelectedPropertyIdRef.current = selectedPropertyId;

    return runWhenMapStyleReady(map, () => {
      syncSearchInRadiusCandidateMarkers({
        map,
        searchInRadiusCandidates,
        selectedPropertyId,
        leadMarkerStateByPropertyId,
        candidateMarkersRef,
        onCandidateSelectRef,
      });

      if (selectionChanged && selectedPropertyId !== null) {
        const selectedMarker = candidateMarkersRef.current.find(
          (marker) => marker.getElement().dataset.propertyId === selectedPropertyId,
        );
        triggerPlatRoofMarkerFocusBounce(selectedMarker?.getElement());
      }
    });
  }, [searchInRadiusCandidates, selectedPropertyId, leadMarkerStateByPropertyId]);

  return (
    <div
      ref={containerRef}
      className="map-libre-map-canvas h-full min-h-72 w-full flex-1"
      role="application"
      aria-label="Property search map. Drag the pin from the tray, or click to ping a search circle."
      onDragEnter={(event) => {
        if (!allowSearchPinDragOver(event.dataTransfer)) {
          return;
        }
        event.preventDefault();
      }}
      onDragOver={(event) => {
        if (!allowSearchPinDragOver(event.dataTransfer)) {
          return;
        }
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!isSearchPinDropPayload(event.dataTransfer)) {
          return;
        }
        const map = mapRef.current;
        if (map === null) {
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        onDropRef.current(
          mapPointerToSearchCenter({
            clientX: event.clientX,
            clientY: event.clientY,
            containerRect: { left: rect.left, top: rect.top },
            unproject: (point) => map.unproject(point),
          }),
        );
        endSearchPinDrag();
      }}
    />
  );
}

/**
 * Removes all radius-search parcel markers from the map.
 */
function clearSearchInRadiusCandidateMarkers(candidateMarkersRef: {
  current: maplibregl.Marker[];
}): void {
  for (const marker of candidateMarkersRef.current) {
    marker.remove();
  }
  candidateMarkersRef.current = [];
}

/**
 * Rebuilds parcel markers from live search candidates (never fixtures).
 */
function syncSearchInRadiusCandidateMarkers(arguments_: {
  map: maplibregl.Map;
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  selectedPropertyId: string | null;
  leadMarkerStateByPropertyId: Readonly<Record<string, PlatRoofMarkerLeadState>>;
  candidateMarkersRef: { current: maplibregl.Marker[] };
  onCandidateSelectRef: {
    current: ((propertyId: string) => void) | undefined;
  };
}): void {
  const {
    map,
    searchInRadiusCandidates,
    selectedPropertyId,
    leadMarkerStateByPropertyId,
    candidateMarkersRef,
    onCandidateSelectRef,
  } = arguments_;

  clearSearchInRadiusCandidateMarkers(candidateMarkersRef);

  const currentUtcYear = new Date().getUTCFullYear();

  for (const candidate of searchInRadiusCandidates) {
    const isSelected = candidate.propertyId === selectedPropertyId;
    const leadState = leadMarkerStateByPropertyId[candidate.propertyId] ?? "prospect";
    const ageBand =
      leadState === "prospect"
        ? resolvePlatRoofMarkerAgeBand({
            builtYear: candidate.builtYear,
            currentUtcYear,
          })
        : undefined;
    const marker = new maplibregl.Marker({
      element: createPlatRoofMarkerElement({ isSelected, leadState, ageBand }),
      anchor: "bottom",
    })
      .setLngLat([candidate.longitude, candidate.latitude])
      .addTo(map);

    const element = marker.getElement();
    element.dataset.propertyId = candidate.propertyId;
    element.style.cursor = "pointer";
    const roofLabel = candidate.addressStreet ?? candidate.propertyId;
    element.title = roofLabel;
    element.setAttribute(
      "aria-label",
      formatPlatRoofMarkerAriaLabel({
        roofLabel,
        isSelected,
        leadState,
        ageBand,
      }),
    );
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      onCandidateSelectRef.current?.(candidate.propertyId);
    });

    candidateMarkersRef.current.push(marker);
  }
}

function formatPlatRoofMarkerAriaLabel(arguments_: {
  roofLabel: string;
  isSelected: boolean;
  leadState: PlatRoofMarkerLeadState;
  ageBand?: ReturnType<typeof resolvePlatRoofMarkerAgeBand>;
}): string {
  const { roofLabel, isSelected, leadState, ageBand } = arguments_;
  const prefix =
    leadState === "lead" ? "Lead" : leadState === "archived" ? "Archived lead" : "Roof";
  const ageSuffix =
    leadState === "prospect" && ageBand !== undefined
      ? `, ${resolvePlatRoofMarkerAgeBandMetadata(ageBand).label}`
      : "";
  return isSelected
    ? `Selected ${prefix.toLowerCase()}, ${roofLabel}${ageSuffix}`
    : `${prefix}, ${roofLabel}${ageSuffix}`;
}

/**
 * Recolors OpenFreeMap Positron so land is linen, water is a cooler wash,
 * labels stay ink, and streets recede as pale linework.
 */
function applyPlatInkPaint(map: maplibregl.Map): void {
  const setPaint = (layerId: string, property: string, value: unknown): void => {
    if (map.getLayer(layerId) !== undefined) {
      map.setPaintProperty(layerId, property, value);
    }
  };

  setPaint("background", "background-color", PLAT_LINEN);
  setPaint("park", "fill-color", PLAT_PARK);
  setPaint("landuse_residential", "fill-color", "#e0dacb");
  setPaint("landcover_wood", "fill-color", "#cdc6b6");
  setPaint("landcover_ice_shelf", "fill-color", PLAT_LINEN);
  setPaint("landcover_glacier", "fill-color", PLAT_LINEN);
  setPaint("building", "fill-color", "#ddd6c7");
  setPaint("building", "fill-outline-color", "#c4bdb0");
  setPaint("road_area_pier", "fill-color", PLAT_LINEN);
  setPaint("road_pier", "line-color", PLAT_LINEN);
  setPaint("aeroway-area", "fill-color", "#e5dfd1");

  setPaint("water", "fill-color", PLAT_WATER);
  setPaint("waterway", "line-color", "#6d807c");

  const minorRoadIds = [
    "highway_path",
    "highway_minor",
    "highway_major_subtle",
    "highway_motorway_subtle",
    "aeroway-taxiway",
    "aeroway-runway-casing",
  ];
  for (const layerId of minorRoadIds) {
    setPaint(layerId, "line-color", PLAT_ROAD_LINE);
  }
  setPaint("highway_minor", "line-opacity", 0.38);
  setPaint("highway_path", "line-opacity", 0.28);
  setPaint("highway_major_subtle", "line-opacity", 0.4);
  setPaint("highway_motorway_subtle", "line-opacity", 0.4);

  const roadFillIds = [
    "highway_major_inner",
    "highway_motorway_inner",
    "highway_motorway_bridge_inner",
    "tunnel_motorway_inner",
    "aeroway-runway",
  ];
  for (const layerId of roadFillIds) {
    setPaint(layerId, "line-color", PLAT_ROAD_FILL);
    setPaint(layerId, "line-opacity", 0.55);
  }

  const casingIds = [
    "highway_major_casing",
    "highway_motorway_casing",
    "highway_motorway_bridge_casing",
    "tunnel_motorway_casing",
  ];
  for (const layerId of casingIds) {
    setPaint(layerId, "line-color", PLAT_ROAD_LINE);
    setPaint(layerId, "line-opacity", 0.42);
  }

  const railwayIds = [
    "railway",
    "railway_service",
    "railway_transit",
    "railway_dashline",
    "railway_service_dashline",
    "railway_transit_dashline",
  ];
  for (const layerId of railwayIds) {
    setPaint(layerId, "line-color", PLAT_ROAD_LINE);
    setPaint(layerId, "line-opacity", 0.35);
  }

  setPaint("boundary_2", "line-color", PLAT_INK_MUTED);
  setPaint("boundary_3", "line-color", PLAT_INK_MUTED);
  setPaint("boundary_disputed", "line-color", PLAT_INK_MUTED);

  const labelIds = [
    "highway-name-path",
    "highway-name-minor",
    "highway-name-major",
    "airport",
    "label_other",
    "label_village",
    "label_town",
    "label_state",
    "label_city",
    "label_city_capital",
    "label_country_1",
    "label_country_2",
    "label_country_3",
    "waterway_line_label",
  ];
  for (const layerId of labelIds) {
    setPaint(layerId, "text-color", PLAT_INK);
    setPaint(layerId, "text-halo-color", PLAT_LINEN);
    setPaint(layerId, "text-halo-width", 1.6);
  }

  setPaint("water_name_point_label", "text-color", PLAT_WATER_LABEL);
  setPaint("water_name_point_label", "text-halo-color", PLAT_LINEN);
  setPaint("water_name_line_label", "text-color", PLAT_WATER_LABEL);
  setPaint("water_name_line_label", "text-halo-color", PLAT_LINEN);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Removes the walk-radius circle when no ping is on the plat.
 */
function hideRadiusCircleSource(map: maplibregl.Map): void {
  const sourceId = "search-radius-circle";
  const layerId = "search-radius-circle-fill";
  const outlineId = "search-radius-circle-outline";
  if (map.getLayer(outlineId) !== undefined) {
    map.removeLayer(outlineId);
  }
  if (map.getLayer(layerId) !== undefined) {
    map.removeLayer(layerId);
  }
  if (map.getSource(sourceId) !== undefined) {
    map.removeSource(sourceId);
  }
}

/**
 * Upserts a GeoJSON circle approximating `searchRadiusMiles` around the center.
 *
 * MapLibre has no native circle layer; a polygon approximation is enough for shell UX.
 */
function ensureRadiusCircleSource(
  map: maplibregl.Map,
  center: SearchMapCenter,
  radiusMiles: number,
): void {
  const sourceId = "search-radius-circle";
  const layerId = "search-radius-circle-fill";
  const outlineId = "search-radius-circle-outline";
  const geojson = {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [buildCircleRing(center, radiusMiles)],
    },
  };

  const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (existing !== undefined) {
    existing.setData(geojson);
    if (map.getLayer(layerId) !== undefined) {
      map.setPaintProperty(layerId, "fill-color", "#2c2a26");
      map.setPaintProperty(layerId, "fill-opacity", SEARCH_RADIUS_CIRCLE_FILL_OPACITY);
    }
    if (map.getLayer(outlineId) !== undefined) {
      map.setPaintProperty(outlineId, "line-color", "#2c2a26");
      map.setPaintProperty(outlineId, "line-width", 2.5);
      map.setPaintProperty(outlineId, "line-dasharray", [3.2, 2]);
    }
    return;
  }

  map.addSource(sourceId, { type: "geojson", data: geojson });
  map.addLayer({
    id: layerId,
    type: "fill",
    source: sourceId,
    paint: {
      "fill-color": "#2c2a26",
      "fill-opacity": SEARCH_RADIUS_CIRCLE_FILL_OPACITY,
    },
  });
  map.addLayer({
    id: outlineId,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": "#2c2a26",
      "line-width": 2.5,
      "line-dasharray": [3.2, 2],
    },
  });
}

/** Builds a closed ring of [lng, lat] pairs for a circle of `radiusMiles`. */
function buildCircleRing(
  center: SearchMapCenter,
  radiusMiles: number,
  steps = 64,
): [number, number][] {
  const earthRadiusMiles = 3958.7613;
  const latRad = (center.latitude * Math.PI) / 180;
  const angularDistance = radiusMiles / earthRadiusMiles;
  const ring: [number, number][] = [];

  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const lng =
      (center.longitude * Math.PI) / 180 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(lat),
      );
    ring.push([(lng * 180) / Math.PI, (lat * 180) / Math.PI]);
  }

  return ring;
}

/**
 * Search-center pin as a small ink needle, not a default MapLibre teardrop.
 */
function createPlatPinElement(): HTMLDivElement {
  const element = document.createElement("div");
  element.style.width = "10px";
  element.style.height = "10px";
  element.style.borderRadius = "999px";
  element.style.background = SEARCH_IN_RADIUS_CANDIDATE_MARKER_COLOR;
  element.style.boxShadow = "0 0 0 2px #e8e2d6";
  return element;
}
