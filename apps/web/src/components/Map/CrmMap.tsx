// T021 (B-01) + T017 (B-03, US1): MapLibre wrapper. center is fixed on Travis County (bounds.ts);
// minZoom is derived once via map.cameraForBounds on load/resize, no maxBounds set (research.md).
// On a tile-load failure, renders the named CrmMapFailed390 state with a "Retry" action — never a
// blank grey grid (TC-007, the spec.md edge case closed at G5).
//
// B-03 adds: a click-to-drop pin (AC-1), a live radius ring redrawn from `center`/`radiusMi`
// (plan.md's "shared-rule requirement" — the ring's drawing geometry is a display-only
// equirectangular approximation, kept local to this component; the actual inside/outside-radius
// filtering decision always comes from the server's `search.properties`, which uses
// `packages/domain`'s exact `distanceMeters` haversine cut, never this preview math).
//
// Overview (design-review-log rows 10 and 69, CRM-HANDOFF E-67/E-72, PO 2026-10-25): below
// OVERVIEW_MAX_ZOOM the map shows hexagons coloured by median roof age and permit count clusters
// coloured by the longest open duration (MapLibre's own GeoJSON clustering, weighted by each
// point's `permits`). The cells come from `search.countyOverview` (`overviewCells`, the whole
// county); only when the caller has none does the component bin the loaded markers itself
// (hexbin.ts). A click on a hexagon drops a pin there (which zooms to its radius view), so the
// county view stays "tap the map to drop a pin"; a click on a permit cluster expands it. Both are
// WebGL layers, not DOM markers, so they stay fast with a full county. Every colour is an Atlas
// token, resolved from the DOM.
import {
  Map as MapLibreMap,
  Marker,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLibreEvent,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AnswerPin, LeadStatus } from "@crm/shared";
import { COUNTY_ZOOM, EARTH_RADIUS_M, METERS_PER_MILE } from "@crm/domain";
import { RADIUS_BOUNDS } from "../../routes/Map/ExploreFilters.state.js";
import { leadRing } from "./leadRing.js";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PERMIT_OPEN_BUCKETS,
  ROOF_AGE_BUCKETS,
  permitOpenBucket,
  roofAgeBucket,
} from "../../format/buckets.js";
import {
  buildMapInitOptions,
  computeMinZoom,
  TRAVIS_COUNTY_BOUNDS,
  TRAVIS_COUNTY_CENTER,
  unionBox,
} from "./bounds.js";
import {
  OVERVIEW_MAX_ZOOM,
  hexbin,
  hexCellsToFeatureCollection,
  isOverviewView,
  type HexCell,
  type OverviewPermitPoint,
} from "./hexbin.js";
import { pinBounds, pinElement, setPinSelected } from "./answerPins.js";
import { HexCellList, type HexListCell } from "./HexCellList.js";
import { focusCamera, type FocusPadding } from "./focusProperty.js";
import { parseHexZoom } from "./hexSearch.js";
import styles from "./CrmMap.module.css";

/** Default demo style: no API key required. MapLibre's own "demotiles" (the original default
 *  here) only carries data at world/country zoom — at this story's city-level radius-search zoom
 *  it rendered as a flat, featureless color block with no streets or landmarks (found live on
 *  the B-03 hosted preview). OpenFreeMap's "liberty" style is a full OSM-derived vector style,
 *  free and keyless, with real detail at every zoom this app uses. */
const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

const ACCURACY_SOURCE_ID = "crm-gps-accuracy";
const ACCURACY_FILL_LAYER_ID = "crm-gps-accuracy-fill";
const ACCURACY_LINE_LAYER_ID = "crm-gps-accuracy-line";
const RADIUS_RING_SOURCE_ID = "crm-radius-ring";
const RADIUS_RING_FILL_LAYER_ID = "crm-radius-ring-fill";
const RADIUS_RING_LINE_LAYER_ID = "crm-radius-ring-line";
const RING_POINTS = 64;
const [MIN_RADIUS_MI, MAX_RADIUS_MI] = RADIUS_BOUNDS;
const HEX_SOURCE_ID = "crm-hex";
const HEX_FILL_LAYER_ID = "crm-hex-fill";
const HEX_LINE_LAYER_ID = "crm-hex-line";
const PERMIT_CLUSTER_SOURCE_ID = "crm-permit-clusters";
const PERMIT_CLUSTER_LAYER_ID = "crm-permit-clusters-circle";
const HEX_FOCUS_SOURCE_ID = "crm-hex-focus";
const HEX_FOCUS_LAYER_ID = "crm-hex-focus-line";
const OVERVIEW_LAYER_IDS = [HEX_FILL_LAYER_ID, PERMIT_CLUSTER_LAYER_ID] as const;
/** Paint colours MapLibre cannot read from CSS variables: resolved from the live Atlas tokens.
 *  Only if a token is unset (never in the app, which loads tokens.css) does a CSS named colour
 *  stand in, so a paint call never fails. */
const UNSET_TOKEN_COLOR = "gray";

declare global {
  interface Window {
    /** Test-only: the live MapLibre map, set while a CrmMap is mounted (read by tests/e2e only). */
    __crmMap?: MapLibreMap;
  }
}

/** The live value of an Atlas token (`--md-sys-color-primary`), following dark mode. */
function resolveToken(token: string): string {
  if (typeof document === "undefined") return UNSET_TOKEN_COLOR;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value === "" ? UNSET_TOKEN_COLOR : value;
}

function resolvePrimaryColor(): string {
  return resolveToken("--md-sys-color-primary");
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The ring's [[west, south], [east, north]] box, for fitting the view to a new pin. */
function ringBounds(center: LatLng, radiusMi: number): [[number, number], [number, number]] {
  const east = ringPoint(center, 90, radiusMi);
  const north = ringPoint(center, 0, radiusMi);
  const dLng = east[0] - center.lng;
  const dLat = north[1] - center.lat;
  return [
    [center.lng - dLng, center.lat - dLat],
    [center.lng + dLng, center.lat + dLat],
  ];
}

/** Hexagon fill: the median's `--viz-roof-age-*` token; no published roof age → surface variant. */
function hexColorExpression(): ExpressionSpecification {
  const pairs = ROOF_AGE_BUCKETS.flatMap((b) => [b.token, resolveToken(b.token)]);
  return [
    "match",
    ["get", "token"],
    ...pairs,
    resolveToken("--md-sys-color-surface-container-highest"),
  ] as unknown as ExpressionSpecification;
}

/** Cluster colour: the longest open duration in the cluster, on the `--viz-permit-open-*` scale. */
function clusterColorExpression(): ExpressionSpecification {
  const [first, ...rest] = PERMIT_OPEN_BUCKETS;
  return [
    "step",
    ["coalesce", ["get", "maxOpenDays"], ["get", "openDays"], 0],
    resolveToken(first?.token ?? "--md-sys-color-outline"),
    ...rest.flatMap((b) => [b.minDays, resolveToken(b.token)]),
  ] as unknown as ExpressionSpecification;
}

/** Display-only ring point at `bearingDeg` from `center`, `radiusMi` away (equirectangular
 *  approximation — good enough for a visual preview; never used for the actual filter decision). */
function ringPoint(center: LatLng, bearingDeg: number, radiusMi: number): [number, number] {
  const distanceM = radiusMi * METERS_PER_MILE;
  const bearing = (bearingDeg * Math.PI) / 180;
  const latOffsetDeg = ((distanceM * Math.cos(bearing)) / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const lngOffsetDeg =
    Math.abs(cosLat) < 1e-6
      ? 0
      : ((distanceM * Math.sin(bearing)) / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI);
  return [center.lng + lngOffsetDeg, center.lat + latOffsetDeg];
}

function ringGeoJson(center: LatLng, radiusMi: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= RING_POINTS; i += 1) {
    coordinates.push(ringPoint(center, (360 * i) / RING_POINTS, radiusMi));
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

/** A roofed property shown as a Layers → "Aged roofs" marker (E-72). Only the fields the marker
 *  needs to place and color itself — never a re-derivation of `isAgedRoof`'s own threshold logic,
 *  which stays the server's/FilterSheet's job; this component only reads `roofAgeConfidence` to
 *  pick a dot shade, exactly as `data-model.md` already carries it. */
export interface RoofMarkerPoint {
  readonly propertyCid: string;
  readonly lat: number;
  readonly lng: number;
  readonly roofAgeConfidence: "high" | "medium" | "low" | "none";
  /** Published roof age, years; null when not published (the marker and hexagon say so by
   *  using the neutral "no roof age" colour, explained in the legend). */
  readonly roofAgeYears?: number | null;
  /** Set when the property is already a lead (Layers → "My leads"): the marker gets a ring whose
   *  line style carries the status. Absent = no lead, or the layer is off. */
  readonly leadStatus?: LeadStatus;
}

/** A permit shown as a Layers → "Open and stalled permits" marker (E-72): coloured by
 *  `statusClass`, ringed when `isLongOpen` already flagged it ("Open > 5 yrs", never recomputed
 *  here — `packages/domain`'s `isLongOpen` is the only source, computed by the caller). */
export interface PermitMarkerPoint {
  readonly permitCid: string;
  /** The property the permit belongs to: a click on the marker opens that property. */
  readonly propertyCid?: string;
  readonly lat: number;
  readonly lng: number;
  readonly statusClass: string | null;
  readonly isLongOpen: boolean;
  /** Open duration, days (for the cluster colour); null when not published. */
  readonly openDays?: number | null;
}

export interface CrmMapLayers {
  readonly roofs: boolean;
  readonly permits: boolean;
  /** "My leads": ring the markers of properties that are already leads. Default on. */
  readonly leads?: boolean;
}

export interface CrmMapHandle {
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  /** Re-centres and zooms to fit `center`/`radiusMi` (the pin/GPS view), or — with no center —
   *  resets to the whole-county view (E-67's "Recentre returns to the county view"). */
  readonly recenter: () => void;
  /** From the overview, zooms in to the individual-marker view (the "Zoom in" chip). */
  readonly zoomToDetail: () => void;
  /** The area on screen as a search: the map's centre and the radius (miles, in the radius control's
   *  steps and bounds) of the circle that fits the smaller side of the view. `null` before the map
   *  is ready. Zooming into the county hexagons uses it to search what is in view, as a hexagon
   *  click would. */
  readonly viewportSearch: () => { lat: number; lng: number; radiusMi: number } | null;
  /** Pin mode at touch widths ("Place pin here"): drops the pin at the map's centre, under the
   *  crosshair. */
  readonly placeAtCenter: () => void;
  /** "Go to Travis County": shows the whole county, leaving any pin and ring where they are. */
  readonly showCounty: () => void;
  /** AI mode's "Show on map": fits the answer's pins (and the search ring when there is a pin). */
  readonly fitPins: () => void;
  /** Centres on a selected property, at least `FOCUS_ZOOM` (the current zoom when closer), inside
   *  the part of the map that stays visible (`padding`); a smooth flight, or a jump with reduced
   *  motion. Never touches the search pin or the radius. */
  readonly focusProperty: (point: LatLng, padding: FocusPadding, instant?: boolean) => void;
}

/** `overview` = hexagons and permit clusters; `detail` = individual markers. */
export type MapViewMode = "overview" | "detail";

export interface CrmMapProps {
  readonly styleUrl?: string;
  /** The current search pin/GPS point (AC-1); `null`/`undefined` renders no pin, no ring. */
  readonly center?: LatLng | null;
  /** Statute miles, 0.5-25 (RadiusControl's own bound) — the ring's radius. */
  readonly radiusMi?: number;
  /** Fired when the map is clicked (AC-1's pin-drop). */
  readonly onPinDrop?: (point: LatLng) => void;
  /** E-72 Layers: aged-roof markers, shown when `layers.roofs` is on. */
  readonly roofMarkers?: readonly RoofMarkerPoint[];
  /** E-72 Layers: open/stalled permit markers, shown when `layers.permits` is on. */
  readonly permitMarkers?: readonly PermitMarkerPoint[];
  readonly layers?: CrmMapLayers;
  /** Fired when the view switches between the hexagon overview and individual markers. */
  readonly onViewModeChange?: (mode: MapViewMode) => void;
  /** Whole-county hexagons from `search.countyOverview`; `null`/absent = bin `roofMarkers`. */
  readonly overviewCells?: readonly HexCell[] | null;
  /** Whole-county permit cluster points (one per cell, weighted); `null`/absent = use
   *  `permitMarkers`. */
  readonly overviewPermits?: readonly OverviewPermitPoint[] | null;
  /** Fired with the whole-number zoom when it changes (the overview query's hexagon size). */
  readonly onZoomStepChange?: (zoomStep: number) => void;
  /** Pin mode (boards CrmMapPinMode*): a crosshair cursor, and at touch widths a fixed crosshair
   *  at the map's centre. The map click still drops the pin; this only changes what shows. */
  readonly pinMode?: boolean;
  /** A GPS fix's accuracy circle, drawn around `center` (board CrmMapGps390 / GpsLow390). */
  readonly accuracy?: { readonly meters: number } | null;
  /** Field triage's current card (board CrmTriage390): its roof marker is ringed (`is-tri`). */
  readonly triageCid?: string | null;
  /** AI mode: the answer's cited properties, drawn as numbered pins (the citation number). */
  readonly answerPins?: readonly (AnswerPin & { readonly label?: string })[];
  /** The focused citation's number: its pin shows selected, and the map pans to it if needed. */
  readonly focusedPin?: number | null;
  /** A pin was clicked: the answer panel focuses that citation. */
  readonly onPinSelect?: (n: number) => void;
  /** The selected property (its drawer is open): marked on the map so the rep sees which one. */
  readonly selectedPoint?: LatLng | null;
  /** A hexagon of the county overview was clicked, tapped or activated from the keyboard: search
   *  there (the pin goes to the cell's centre). */
  readonly onHexSelect?: (cell: HexSelection) => void;
  /** A property marker was clicked or activated from the keyboard: open that property. */
  readonly onPropertySelect?: (propertyCid: string) => void;
  /** When true, a new set of results (a changed radius, roof age or permit filter) moves the
   *  camera to fit them: the map focuses on the centre of the results. Off while a property is
   *  selected, in AI mode or triage, whose own cameras apply. */
  readonly focusResults?: boolean;
}

export interface HexSelection {
  readonly lat: number;
  readonly lng: number;
  /** The whole-number zoom the cell was made at (its size). */
  readonly zoom: number;
  readonly count: number;
  readonly medianRoofAge: number | null;
}

/** A roof marker's fill: its roof age on the `--viz-roof-age-*` scale (the legend's scale). */
function roofMarkerColor(point: RoofMarkerPoint): string {
  const bucket = roofAgeBucket(point.roofAgeYears ?? null);
  return bucket === null ? "var(--md-sys-color-surface-container-highest)" : `var(${bucket.token})`;
}

/** A permit marker's fill: its open duration on the `--viz-permit-open-*` scale. */
function permitMarkerColor(point: PermitMarkerPoint): string {
  const bucket = permitOpenBucket(point.openDays ?? null);
  return bucket === null ? "var(--md-sys-color-surface-container-highest)" : `var(${bucket.token})`;
}

/** A DOM marker: a round dot (roof) or a diamond (permit, the legend's "◆"). Colours are CSS
 *  token references, so they follow dark mode with no re-render. */
export function dot(
  color: string,
  ringed: boolean,
  shape: "round" | "diamond" = "round",
  triage = false,
  activate?: { readonly label: string; readonly run: () => void },
  leadStatus?: LeadStatus,
): HTMLDivElement {
  const el = document.createElement("div");
  if (activate !== undefined) {
    // A click or Enter/Space on a marker opens its property. The click must not reach the map,
    // whose own click drops a search pin there (and re-fits the view to its ring).
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.setAttribute("aria-label", activate.label);
    el.style.cursor = "pointer";
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      activate.run();
    });
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      activate.run();
    });
  }
  if (triage) {
    // The card being triaged: a primary ring around the dot (the board's current-card marker).
    el.className = "is-tri";
    el.style.boxShadow = "0 0 0 4px var(--md-sys-color-primary)";
    el.style.zIndex = "2";
  }
  el.style.width = "14px";
  el.style.height = "14px";
  el.style.borderRadius = shape === "round" ? "50%" : "2px";
  if (shape === "diamond") el.style.transform = "rotate(45deg)";
  el.style.background = color;
  el.style.boxSizing = "border-box";
  el.style.border = ringed
    ? "3px solid var(--md-sys-color-on-surface)"
    : "2px solid var(--md-sys-color-surface)";
  // 24px hit area around the 14px visible dot (CRM-HANDOFF §10 fix 3: markers keep their 14px
  // look with a 24px hit area).
  el.style.outline = "5px solid transparent";
  if (leadStatus !== undefined) {
    // Already a lead: an outer ring, its line style by status (the dot's fill stays visible).
    const ring = leadRing(leadStatus);
    el.dataset.leadStatus = leadStatus;
    el.style.outlineStyle = ring.style;
    el.style.outlineWidth = "3px";
    el.style.outlineColor = ring.color;
    el.style.outlineOffset = "2px";
  }
  return el;
}

export const CrmMap = forwardRef<CrmMapHandle, CrmMapProps>(function CrmMap(
  {
    styleUrl = DEFAULT_STYLE,
    center = null,
    radiusMi,
    onPinDrop,
    roofMarkers = [],
    permitMarkers = [],
    layers = { roofs: true, permits: true },
    onViewModeChange,
    overviewCells = null,
    overviewPermits = null,
    onZoomStepChange,
    pinMode = false,
    accuracy = null,
    triageCid = null,
    answerPins = [],
    focusedPin = null,
    onPinSelect,
    onHexSelect,
    onPropertySelect,
    focusResults = false,
    selectedPoint = null,
  }: CrmMapProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const radiusRef = useRef(radiusMi);
  radiusRef.current = radiusMi;
  const [styleReady, setStyleReady] = useState(false);
  const onPinDropRef = useRef(onPinDrop);
  onPinDropRef.current = onPinDrop;
  const pinModeRef = useRef(pinMode);
  pinModeRef.current = pinMode;
  const [zoom, setZoom] = useState(COUNTY_ZOOM);
  const overview = isOverviewView(zoom, center !== null);
  const onViewModeChangeRef = useRef(onViewModeChange);
  onViewModeChangeRef.current = onViewModeChange;
  const styleReadyRef = useRef(false);
  const pendingFocusRef = useRef<{
    point: LatLng;
    padding: FocusPadding;
    instant: boolean | undefined;
  } | null>(null);
  const runFocusRef = useRef<(point: LatLng, padding: FocusPadding, instant?: boolean) => void>(
    () => undefined,
  );
  const onPinSelectRef = useRef(onPinSelect);
  onPinSelectRef.current = onPinSelect;
  const onHexSelectRef = useRef(onHexSelect);
  onHexSelectRef.current = onHexSelect;
  const onPropertySelectRef = useRef(onPropertySelect);
  onPropertySelectRef.current = onPropertySelect;
  const pinsRef = useRef(answerPins);
  pinsRef.current = answerPins;
  const onZoomStepChangeRef = useRef(onZoomStepChange);
  onZoomStepChangeRef.current = onZoomStepChange;

  const onRetry = useCallback(() => {
    setFailed(false);
    setRetryToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (containerRef.current === null) return;
    setStyleReady(false);

    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      zoom: COUNTY_ZOOM,
      ...buildMapInitOptions(),
    });
    mapRef.current = map;
    // Test-only hook (TD-4 fix, testplans/B-01-test-cases.md TC-002): exposes the live MapLibre
    // instance so Playwright can assert the county-bbox minZoom guarantee directly, instead of
    // only unit-testing the pure bounds math (bounds.test.ts) with no live-map assertion at all.
    // Never read by application code — only by tests/e2e/*.spec.ts.
    window.__crmMap = map;

    const applyMinZoom = (): void => {
      const minZoom = computeMinZoom(map);
      if (minZoom !== undefined) {
        map.setMinZoom(minZoom);
      }
    };

    const onError = (event: MapLibreEvent & { error?: Error }): void => {
      // MapLibre's "error" event fires for any internal failure (a malformed style, a lost
      // WebGL context, a bad minZoom call), not only a tile-load failure — treating every one
      // as CrmMapFailed390 with a "Retry" button would mislead the user for causes a reload can
      // never fix (found in code review, CR-B-01). A tile-load failure is a network fetch
      // failure, which MapLibre surfaces as a TypeError/AbortError-shaped message; anything else
      // is logged instead of shown as the named tile-failure state.
      const message = event.error?.message ?? "";
      const isTileFailure = /fetch|network|abort|load/i.test(message);
      if (isTileFailure) {
        setFailed(true);
      } else {
        console.error("MapLibre error (not a tile-load failure):", event.error);
      }
    };

    const onClick = (event: MapMouseEvent): void => {
      // A click on a permit cluster expands it (its own layer handler below) and never also
      // drops a pin there. A click on a hexagon drops the pin: with the whole county covered,
      // every county-view click lands on one, and the pin's radius fit is the zoom-in.
      if (
        map.getLayer(PERMIT_CLUSTER_LAYER_ID) !== undefined &&
        map.queryRenderedFeatures(event.point, { layers: [PERMIT_CLUSTER_LAYER_ID] }).length > 0
      ) {
        return;
      }
      // A hexagon takes the click (its own handler below); anywhere else still drops a pin. In
      // pin mode the click always drops the pin: the hexagon's zoom-in must not eat it.
      if (
        !pinModeRef.current &&
        onHexSelectRef.current !== undefined &&
        map.getLayer(HEX_FILL_LAYER_ID) !== undefined &&
        map.queryRenderedFeatures(event.point, { layers: [HEX_FILL_LAYER_ID] }).length > 0
      ) {
        return;
      }
      onPinDropRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    };

    const onLoad = (): void => {
      applyMinZoom();
      setZoom(map.getZoom());
      setStyleReady(true);
    };

    const onZoomEnd = (): void => setZoom(map.getZoom());

    const zoomInto = (lng: number, lat: number, toZoom: number): void => {
      map.easeTo({
        center: [lng, lat],
        zoom: toZoom,
        duration: prefersReducedMotion() ? 0 : 400,
      });
    };

    const onClusterClick = (
      event: MapMouseEvent & {
        features?: { properties: Record<string, unknown>; geometry: GeoJSON.Geometry }[];
      },
    ): void => {
      const feature = event.features?.[0];
      if (feature === undefined || feature.geometry.type !== "Point") return;
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const clusterId = feature.properties.cluster_id;
      const source = map.getSource(PERMIT_CLUSTER_SOURCE_ID) as GeoJSONSource | undefined;
      if (typeof clusterId !== "number" || source === undefined) {
        zoomInto(lng, lat, OVERVIEW_MAX_ZOOM + 0.5);
        return;
      }
      void source
        .getClusterExpansionZoom(clusterId)
        .then((z) => zoomInto(lng, lat, Math.max(z, map.getZoom() + 1)))
        .catch(() => zoomInto(lng, lat, OVERVIEW_MAX_ZOOM + 0.5));
    };

    const onHexClick = (
      event: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] },
    ): void => {
      // A permit cluster on top of the hexagon keeps its own behaviour (zoom in).
      if (
        map.getLayer(PERMIT_CLUSTER_LAYER_ID) !== undefined &&
        map.queryRenderedFeatures(event.point, { layers: [PERMIT_CLUSTER_LAYER_ID] }).length > 0
      ) {
        return;
      }
      if (pinModeRef.current) return;
      const props = event.features?.[0]?.properties;
      const select = onHexSelectRef.current;
      if (props === undefined || select === undefined) return;
      const zoom = parseHexZoom(String(props.id));
      const lat = Number(props.centerLat);
      const lng = Number(props.centerLng);
      if (zoom === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const median = props.medianRoofAge;
      select({
        lat,
        lng,
        zoom,
        count: Number(props.count),
        medianRoofAge: typeof median === "number" ? median : null,
      });
    };

    const pointer = (): void => {
      map.getCanvas().style.cursor = "pointer";
    };
    const unpointer = (): void => {
      map.getCanvas().style.cursor = "";
    };

    // The panes around the map can be minimised, which resizes its container without a window
    // resize: repaint MapLibre at the new size (no-op where ResizeObserver is absent, e.g. tests).
    const container = containerRef.current;
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(() => map.resize()) : null;
    observer?.observe(container);

    map.on("load", onLoad);
    map.on("resize", applyMinZoom);
    map.on("error", onError);
    map.on("click", onClick);
    map.on("zoomend", onZoomEnd);
    map.on("click", HEX_FILL_LAYER_ID, onHexClick);
    map.on("click", PERMIT_CLUSTER_LAYER_ID, onClusterClick);
    for (const id of OVERVIEW_LAYER_IDS) {
      map.on("mouseenter", id, pointer);
      map.on("mouseleave", id, unpointer);
    }

    return () => {
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      delete window.__crmMap;
    };
  }, [styleUrl, retryToken]);

  // Leaving a search for the overview (Escape, Back, "Recentre" with no pin): the camera goes back
  // out to the whole county too, so the hexagons are there to click again.
  // Search criteria changed (radius, roof age, permit filter): fit the camera to the new results,
  // so the map is centred on them rather than on the pin's ring. Keyed on the result set, so
  // re-renders, a selection or a closed drawer never move the camera again.
  const resultsKey =
    roofMarkers.length === 0
      ? ""
      : `${String(roofMarkers.length)}|${roofMarkers[0]?.propertyCid ?? ""}|${roofMarkers[roofMarkers.length - 1]?.propertyCid ?? ""}`;
  const lastFocusedKeyRef = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (resultsKey === "") lastFocusedKeyRef.current = "";
    if (map === null || !styleReady || overview || !focusResults || resultsKey === "") return;
    if (center === null || lastFocusedKeyRef.current === resultsKey) return;
    lastFocusedKeyRef.current = resultsKey;
    const duration = prefersReducedMotion() ? 0 : 400;
    // The fit holds the results AND the whole search ring: fitting the (usually small) cluster of
    // results alone zoomed to street level and left the ring out of view.
    const ring =
      radiusRef.current === undefined ? undefined : ringBounds(center, radiusRef.current);
    const box = unionBox(
      ring ?? [
        [center.lng, center.lat],
        [center.lng, center.lat],
      ],
      roofMarkers,
    );
    map.fitBounds(box, { padding: 64, maxZoom: 16, duration });
    // roofMarkers is read through resultsKey on purpose: only a changed result set moves the camera.
  }, [resultsKey, styleReady, overview, focusResults, center?.lat, center?.lng]);

  const hadCenterRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    const hasCenter = center !== null;
    if (map !== null && styleReady && hadCenterRef.current && !hasCenter) {
      map.fitBounds(TRAVIS_COUNTY_BOUNDS, {
        padding: 24,
        duration: prefersReducedMotion() ? 0 : 400,
      });
    }
    hadCenterRef.current = hasCenter;
  }, [center === null, styleReady]);

  // The pin marker: added/moved/removed as `center` changes, never redrawn as part of the full
  // map-recreation effect above (AC-1: dropping a new pin or a new GPS fix must not re-create the
  // whole map).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;
    if (center === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (markerRef.current === null) {
      // Draggable (board CrmMapPinMove1440): dragging the pin re-centres the search there.
      const marker = new Marker({ draggable: true }).setLngLat([center.lng, center.lat]).addTo(map);
      marker.on("dragend", () => {
        const at = marker.getLngLat();
        onPinDropRef.current?.({ lat: at.lat, lng: at.lng });
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([center.lng, center.lat]);
    }
    // CRM-HANDOFF §4.2: "Picking an area, a GPS fix or a pin zooms in and draws the ring" — a
    // new centre fits the view to its ring (the radius view shows individual markers). Only on
    // a centre change: changing the radius keeps the person's own zoom.
    if (radiusRef.current !== undefined) {
      map.fitBounds(ringBounds(center, radiusRef.current), {
        padding: 32,
        duration: prefersReducedMotion() ? 0 : 400,
      });
    }
    // radiusMi is read through a ref on purpose: a radius change must not refit the view.
  }, [center?.lat, center?.lng, styleReady]);

  // A radius change from the radius control fits the view to the new ring, once per change (the
  // person's own pan/zoom is left alone otherwise). The pin drop does the same in the effect above.
  const lastFitRadiusRef = useRef(radiusMi);
  useEffect(() => {
    const previous = lastFitRadiusRef.current;
    lastFitRadiusRef.current = radiusMi;
    const map = mapRef.current;
    if (map === null || !styleReady || center === null || radiusMi === undefined) return;
    if (previous === undefined || previous === radiusMi) return;
    map.fitBounds(ringBounds(center, radiusMi), {
      padding: 32,
      duration: prefersReducedMotion() ? 0 : 400,
    });
    // Only radiusMi triggers it: a centre change is fitted by the pin effect.
  }, [radiusMi, styleReady]);

  runFocusRef.current = (point, padding, instant) => {
    const map = mapRef.current;
    if (map === null) return;
    // Before the style is ready the pin's own ring fit has not run yet and would override this
    // move: wait, and run right after it (see the effect below).
    if (!styleReadyRef.current) {
      pendingFocusRef.current = { point, padding, instant };
      return;
    }
    const camera = focusCamera({
      point,
      currentZoom: map.getZoom(),
      padding,
      reducedMotion: prefersReducedMotion(),
      ...(instant === true ? { instant } : {}),
    });
    const options = { center: camera.center, zoom: camera.zoom, padding: camera.padding };
    if (camera.kind === "jump") map.jumpTo(options);
    else map.flyTo({ ...options, duration: camera.duration, essential: false });
  };

  // A property selected before the map was ready (a link or a reload with ?sel=): move to it once the
  // style is ready, after the search pin's ring fit above, so that fit does not override it.
  useEffect(() => {
    styleReadyRef.current = styleReady;
    const pending = pendingFocusRef.current;
    if (!styleReady || pending === null) return;
    pendingFocusRef.current = null;
    runFocusRef.current(pending.point, pending.padding, pending.instant);
  }, [styleReady]);

  // The radius ring (AC-1): a GeoJSON polygon redrawn on every center/radiusMi change, per
  // plan.md's shared-rule requirement — a live client-side preview of the same search the
  // "Radius" control drives, without a server round trip just to redraw the ring.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;
    if (center === null || radiusMi === undefined) {
      if (map.getLayer(RADIUS_RING_FILL_LAYER_ID)) map.removeLayer(RADIUS_RING_FILL_LAYER_ID);
      if (map.getLayer(RADIUS_RING_LINE_LAYER_ID)) map.removeLayer(RADIUS_RING_LINE_LAYER_ID);
      if (map.getSource(RADIUS_RING_SOURCE_ID)) map.removeSource(RADIUS_RING_SOURCE_ID);
      return;
    }
    const data = ringGeoJson(center, radiusMi);
    const primaryColor = resolvePrimaryColor();
    const source = map.getSource(RADIUS_RING_SOURCE_ID);
    if (source !== undefined && "setData" in source) {
      (source as { setData: (data: GeoJSON.Feature) => void }).setData(data);
      // Re-resolved on every redraw (not just creation) so a dark-mode toggle between renders is
      // reflected on the next center/radius change too, not only on first paint.
      map.setPaintProperty(RADIUS_RING_FILL_LAYER_ID, "fill-color", primaryColor);
      map.setPaintProperty(RADIUS_RING_LINE_LAYER_ID, "line-color", primaryColor);
      return;
    }
    map.addSource(RADIUS_RING_SOURCE_ID, { type: "geojson", data });
    map.addLayer({
      id: RADIUS_RING_FILL_LAYER_ID,
      type: "fill",
      source: RADIUS_RING_SOURCE_ID,
      paint: { "fill-color": primaryColor, "fill-opacity": 0.08 },
    });
    map.addLayer({
      id: RADIUS_RING_LINE_LAYER_ID,
      type: "line",
      source: RADIUS_RING_SOURCE_ID,
      paint: { "line-color": primaryColor, "line-width": 2 },
    });
  }, [center?.lat, center?.lng, radiusMi, styleReady]);

  // A GPS fix's accuracy circle (boards CrmMapGps390, CrmMapGpsLow390): a translucent disc with an
  // edge, radius = the reported accuracy. Display only, like the radius ring above.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;
    if (center === null || accuracy === null) {
      for (const id of [ACCURACY_LINE_LAYER_ID, ACCURACY_FILL_LAYER_ID])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(ACCURACY_SOURCE_ID)) map.removeSource(ACCURACY_SOURCE_ID);
      return;
    }
    const data = ringGeoJson(center, accuracy.meters / METERS_PER_MILE);
    const source = map.getSource(ACCURACY_SOURCE_ID) as GeoJSONSource | undefined;
    if (source !== undefined) {
      source.setData(data);
      return;
    }
    const color = resolveToken("--md-sys-color-primary");
    map.addSource(ACCURACY_SOURCE_ID, { type: "geojson", data });
    map.addLayer({
      id: ACCURACY_FILL_LAYER_ID,
      type: "fill",
      source: ACCURACY_SOURCE_ID,
      paint: { "fill-color": color, "fill-opacity": 0.16 },
    });
    map.addLayer({
      id: ACCURACY_LINE_LAYER_ID,
      type: "line",
      source: ACCURACY_SOURCE_ID,
      paint: { "line-color": color, "line-width": 1.5 },
    });
  }, [center?.lat, center?.lng, accuracy?.meters, styleReady]);

  // AI mode: the answer's numbered pins, above every other marker. Rebuilt when the set changes;
  // selection only restyles in place (so a click does not flicker the whole set).
  const pinMarkerRefs = useRef<{ n: number; marker: Marker; el: HTMLButtonElement }[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    for (const { marker } of pinMarkerRefs.current) marker.remove();
    pinMarkerRefs.current = [];
    if (map === null || !styleReady) return;
    for (const pin of answerPins) {
      const el = pinElement(pin.n, false, (n) => onPinSelectRef.current?.(n), pin.label);
      const marker = new Marker({ element: el }).setLngLat([pin.lon, pin.lat]).addTo(map);
      pinMarkerRefs.current.push({ n: pin.n, marker, el });
    }
  }, [answerPins, styleReady]);
  useEffect(() => {
    const map = mapRef.current;
    for (const { n, el } of pinMarkerRefs.current) setPinSelected(el, n === focusedPin);
    if (map === null || focusedPin === null) return;
    const pin = answerPins.find((p) => p.n === focusedPin);
    if (pin === undefined) return;
    if (!map.getBounds().contains([pin.lon, pin.lat])) {
      map.easeTo({ center: [pin.lon, pin.lat], duration: prefersReducedMotion() ? 0 : 400 });
    }
  }, [focusedPin, answerPins, styleReady]);

  // E-72 Layers: aged-roof markers. Re-created whenever the result set or the layer toggle
  // changes — the marker list is short (a radius search, never the whole county), so a full
  // remove/re-add is simpler and cheap enough, unlike the single pin marker above.
  const roofMarkerRefs = useRef<Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    for (const marker of roofMarkerRefs.current) marker.remove();
    roofMarkerRefs.current = [];
    if (map === null || !styleReady || !layers.roofs || overview) return;
    for (const point of roofMarkers) {
      const leadStatus = layers.leads === false ? undefined : point.leadStatus;
      const marker = new Marker({
        element: dot(
          roofMarkerColor(point),
          false,
          "round",
          point.propertyCid === triageCid,
          {
            label:
              (point.roofAgeYears == null
                ? "Open this property · no roof age published"
                : `Open this property · roof ${String(point.roofAgeYears)} yrs`) +
              (leadStatus === undefined ? "" : ` · lead: ${leadRing(leadStatus).label}`),
            run: () => onPropertySelectRef.current?.(point.propertyCid),
          },
          leadStatus,
        ),
      })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      roofMarkerRefs.current.push(marker);
    }
  }, [roofMarkers, layers.roofs, layers.leads, styleReady, overview, triageCid]);

  // E-72 Layers: open/stalled permit markers, ringed when `isLongOpen` already flagged the
  // permit ("Open > 5 yrs" — the flag itself comes from `packages/domain`'s `isLongOpen` via the
  // caller, never recomputed here).
  const permitMarkerRefs = useRef<Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    for (const marker of permitMarkerRefs.current) marker.remove();
    permitMarkerRefs.current = [];
    if (map === null || !styleReady || !layers.permits || overview) return;
    for (const point of permitMarkers) {
      const marker = new Marker({
        element: dot(
          permitMarkerColor(point),
          point.isLongOpen,
          "diamond",
          false,
          point.propertyCid === undefined
            ? undefined
            : {
                label: `Open this property · ${point.statusClass ?? "open"} permit`,
                run: () => {
                  if (point.propertyCid !== undefined)
                    onPropertySelectRef.current?.(point.propertyCid);
                },
              },
        ),
      })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      permitMarkerRefs.current.push(marker);
    }
  }, [permitMarkers, layers.permits, styleReady, overview]);

  useEffect(() => {
    onViewModeChangeRef.current?.(overview ? "overview" : "detail");
  }, [overview]);

  // Overview: the server's whole-county cells, or (fallback) the loaded roof markers binned at
  // the current whole-number zoom.
  const zoomStep = Math.floor(zoom);
  useEffect(() => {
    onZoomStepChangeRef.current?.(zoomStep);
  }, [zoomStep]);
  const hexData = useMemo(
    () =>
      hexCellsToFeatureCollection(
        overviewCells ??
          hexbin(
            roofMarkers.map((p) => ({
              lat: p.lat,
              lng: p.lng,
              roofAgeYears: p.roofAgeYears ?? null,
            })),
            { zoom: zoomStep },
          ),
      ),
    [overviewCells, roofMarkers, zoomStep],
  );
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;
    const show = overview && layers.roofs && hexData.features.length > 0;
    if (!show) {
      for (const id of [HEX_LINE_LAYER_ID, HEX_FILL_LAYER_ID])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(HEX_SOURCE_ID)) map.removeSource(HEX_SOURCE_ID);
      return;
    }
    // At least 2, so the interpolate stops below stay strictly ascending (MapLibre rejects
    // equal stops, e.g. when every cell holds one property).
    const maxCount = Math.max(2, ...hexData.features.map((f) => f.properties.count));
    const data = hexData as unknown as GeoJSON.FeatureCollection;
    const source = map.getSource(HEX_SOURCE_ID) as GeoJSONSource | undefined;
    if (source !== undefined) {
      source.setData(data);
    } else {
      map.addSource(HEX_SOURCE_ID, { type: "geojson", data });
      map.addLayer({
        id: HEX_FILL_LAYER_ID,
        type: "fill",
        source: HEX_SOURCE_ID,
        paint: { "fill-color": hexColorExpression() },
      });
      // §10 fix 4: a 3:1 edge where fills alone fail — on-surface-variant outline.
      map.addLayer({
        id: HEX_LINE_LAYER_ID,
        type: "line",
        source: HEX_SOURCE_ID,
        paint: { "line-color": resolveToken("--md-sys-color-on-surface-variant"), "line-width": 1 },
      });
    }
    // Stronger fill = more properties in the hexagon (the legend says so).
    map.setPaintProperty(HEX_FILL_LAYER_ID, "fill-opacity", [
      "interpolate",
      ["linear"],
      ["get", "count"],
      1,
      0.45,
      maxCount,
      0.9,
    ]);
    map.setPaintProperty(HEX_FILL_LAYER_ID, "fill-color", hexColorExpression());
  }, [hexData, overview, layers.roofs, styleReady]);

  // Overview: permit count clusters (MapLibre's GeoJSON clustering), coloured by the longest
  // open duration in the cluster, sized by the summed `permits`, ringed for a 3:1 edge. Server
  // points carry a cell's permit count; a loaded permit marker counts 1.
  const permitData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features:
        overviewPermits === null
          ? permitMarkers.map((p) => ({
              type: "Feature",
              properties: { openDays: p.openDays ?? 0, permits: 1 },
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            }))
          : overviewPermits.map((p) => ({
              type: "Feature",
              properties: { openDays: p.openDays, permits: p.permits },
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            })),
    }),
    [overviewPermits, permitMarkers],
  );
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;
    const show = overview && layers.permits && permitData.features.length > 0;
    if (!show) {
      if (map.getLayer(PERMIT_CLUSTER_LAYER_ID)) map.removeLayer(PERMIT_CLUSTER_LAYER_ID);
      if (map.getSource(PERMIT_CLUSTER_SOURCE_ID)) map.removeSource(PERMIT_CLUSTER_SOURCE_ID);
      return;
    }
    const source = map.getSource(PERMIT_CLUSTER_SOURCE_ID) as GeoJSONSource | undefined;
    if (source !== undefined) {
      source.setData(permitData);
      return;
    }
    map.addSource(PERMIT_CLUSTER_SOURCE_ID, {
      type: "geojson",
      data: permitData,
      cluster: true,
      clusterRadius: 40,
      clusterMaxZoom: OVERVIEW_MAX_ZOOM,
      clusterProperties: {
        maxOpenDays: ["max", ["get", "openDays"]],
        permits: ["+", ["get", "permits"]],
      },
    });
    map.addLayer({
      id: PERMIT_CLUSTER_LAYER_ID,
      type: "circle",
      source: PERMIT_CLUSTER_SOURCE_ID,
      paint: {
        "circle-color": clusterColorExpression(),
        "circle-radius": [
          "step",
          ["coalesce", ["get", "permits"], ["get", "point_count"], 1],
          8,
          5,
          12,
          25,
          16,
          100,
          20,
        ],
        "circle-stroke-color": resolveToken("--md-sys-color-surface"),
        "circle-stroke-width": 3,
      },
    });
  }, [permitData, overview, layers.permits, styleReady]);

  // The selected property: a ring in the primary colour at its position (its own marker, so it shows
  // whatever the results or the layers hold). Decorative: the drawer says which property it is.
  const selectedMarkerRef = useRef<Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    selectedMarkerRef.current?.remove();
    selectedMarkerRef.current = null;
    if (map === null || !styleReady || selectedPoint === null) return;
    const el = document.createElement("div");
    el.dataset.selectedProperty = "true";
    el.setAttribute("aria-hidden", "true");
    el.style.width = "32px";
    el.style.height = "32px";
    el.style.boxSizing = "border-box";
    el.style.borderRadius = "50%";
    el.style.border = "3px solid var(--md-sys-color-primary)";
    el.style.boxShadow = "0 0 0 2px var(--md-sys-color-surface)";
    el.style.pointerEvents = "none";
    selectedMarkerRef.current = new Marker({ element: el })
      .setLngLat([selectedPoint.lng, selectedPoint.lat])
      .addTo(map);
  }, [selectedPoint?.lat, selectedPoint?.lng, styleReady]);

  // The hexagons' keyboard twin and the outline of the focused one (3 px, primary): the layer is
  // WebGL, so focus has to be drawn on the map itself.
  const [focusedHex, setFocusedHex] = useState<string | null>(null);
  const hexListCells = useMemo<HexListCell[]>(
    () =>
      hexData.features.map((f) => ({
        id: f.properties.id,
        lat: f.properties.centerLat,
        lng: f.properties.centerLng,
        count: f.properties.count,
        medianRoofAge: f.properties.medianRoofAge,
      })),
    [hexData],
  );
  const showHexList =
    overview && layers.roofs && onHexSelect !== undefined && hexListCells.length > 0;
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;
    const feature =
      focusedHex === null
        ? undefined
        : hexData.features.find((f) => f.properties.id === focusedHex);
    if (!showHexList || feature === undefined) {
      if (map.getLayer(HEX_FOCUS_LAYER_ID)) map.removeLayer(HEX_FOCUS_LAYER_ID);
      if (map.getSource(HEX_FOCUS_SOURCE_ID)) map.removeSource(HEX_FOCUS_SOURCE_ID);
      return;
    }
    const data = feature as unknown as GeoJSON.Feature;
    const source = map.getSource(HEX_FOCUS_SOURCE_ID) as GeoJSONSource | undefined;
    if (source !== undefined) {
      source.setData(data);
      return;
    }
    map.addSource(HEX_FOCUS_SOURCE_ID, { type: "geojson", data });
    map.addLayer({
      id: HEX_FOCUS_LAYER_ID,
      type: "line",
      source: HEX_FOCUS_SOURCE_ID,
      paint: { "line-color": resolveToken("--md-sys-color-primary"), "line-width": 3 },
    });
  }, [focusedHex, hexData, showHexList, styleReady]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn(),
      zoomOut: () => mapRef.current?.zoomOut(),
      recenter: () => {
        const map = mapRef.current;
        if (map === null) return;
        if (center === null) {
          map.setCenter(TRAVIS_COUNTY_CENTER);
          map.setZoom(COUNTY_ZOOM);
          return;
        }
        if (radiusMi !== undefined) {
          map.fitBounds(ringBounds(center, radiusMi), {
            padding: 32,
            duration: prefersReducedMotion() ? 0 : 400,
          });
          return;
        }
        map.flyTo({ center: [center.lng, center.lat], zoom: 12 });
      },
      placeAtCenter: () => {
        const at = mapRef.current?.getCenter();
        if (at !== undefined) onPinDropRef.current?.({ lat: at.lat, lng: at.lng });
      },
      fitPins: () => {
        const map = mapRef.current;
        if (map === null) return;
        const ring =
          center !== null && radiusMi !== undefined ? ringBounds(center, radiusMi) : undefined;
        const bounds = pinBounds(pinsRef.current, ring);
        if (bounds === null) return;
        map.fitBounds(bounds, {
          padding: 48,
          maxZoom: 14,
          duration: prefersReducedMotion() ? 0 : 400,
        });
      },
      focusProperty: (point, padding, instant) => runFocusRef.current(point, padding, instant),
      showCounty: () => {
        mapRef.current?.fitBounds(TRAVIS_COUNTY_BOUNDS, {
          padding: 24,
          duration: prefersReducedMotion() ? 0 : 400,
        });
      },
      viewportSearch: () => {
        const map = mapRef.current;
        if (map === null) return null;
        const bounds = map.getBounds();
        const at = map.getCenter();
        const rad = Math.PI / 180;
        const halfNorthSouthMi =
          ((bounds.getNorth() - at.lat) * rad * EARTH_RADIUS_M) / METERS_PER_MILE;
        const halfEastWestMi =
          ((bounds.getEast() - at.lng) * rad * Math.cos(at.lat * rad) * EARTH_RADIUS_M) /
          METERS_PER_MILE;
        const fitMi = Math.ceil(Math.min(halfNorthSouthMi, halfEastWestMi) * 2) / 2;
        return {
          lat: at.lat,
          lng: at.lng,
          radiusMi: Math.min(MAX_RADIUS_MI, Math.max(MIN_RADIUS_MI, fitMi)),
        };
      },
      zoomToDetail: () => {
        const map = mapRef.current;
        if (map === null) return;
        map.easeTo({
          ...(center === null ? {} : { center: [center.lng, center.lat] as [number, number] }),
          zoom: OVERVIEW_MAX_ZOOM + 0.5,
          duration: prefersReducedMotion() ? 0 : 400,
        });
      },
    }),
    [center?.lat, center?.lng, radiusMi],
  );

  return (
    <div className={styles.wrapper}>
      <div
        ref={containerRef}
        className={styles.map}
        data-testid="crm-map"
        data-view-mode={overview ? "overview" : "detail"}
        data-pin-mode={pinMode ? "true" : undefined}
      />
      {showHexList ? (
        <HexCellList
          cells={hexListCells}
          onFocusCell={setFocusedHex}
          onSelect={(cell) => {
            const zoom = parseHexZoom(cell.id);
            if (zoom === null) return;
            onHexSelect?.({
              lat: cell.lat,
              lng: cell.lng,
              zoom,
              count: cell.count,
              medianRoofAge: cell.medianRoofAge,
            });
          }}
        />
      ) : null}
      {pinMode ? <div className={styles.crosshair} aria-hidden="true" data-crosshair="" /> : null}
      {failed && (
        <div role="alert" data-state="CrmMapFailed390" className={styles.failed}>
          <p className={styles.failedMessage}>
            <strong>Map unavailable, results below.</strong> The map tiles didn&apos;t load; the
            list, filters and leads still work.
          </p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
});
