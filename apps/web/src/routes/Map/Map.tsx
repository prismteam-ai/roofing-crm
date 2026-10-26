// T022 (B-01) + T018 (B-03, US1): the home screen, gated behind the Cognito session from SignIn
// (T020). Wires pin-drop/GPS (CrmMap, GpsButton) and the radius control (RadiusControl) to
// `search.properties` (packages/api-client), rendering the zero-result "widen to {n} mi" state
// (fixed +1 mi steps, capped at 25 mi — Round 1 decision, 2026-10-23) and the outside-county
// state (AC-1's edge cases, contracts/search-api.md).
//
// Structural UI rebuild (2026-10-23, against CRM-HANDOFF §4.2/§4.3 and the served prototype
// boards — see the build report for the exact list): adds the top search/context bar, zoom and
// recentre map controls, a Layers popover (aged-roof + permit markers, coverage-gap note), the
// roof-age chip/permit-status/permit-duration filters, a "Matches N" results sheet of richer
// result cards, and a fuller property detail drawer — all layered on the SAME state machine this
// file already had (query/permitsQuery/detailQuery, the URL-state helpers, the named CrmMap*
// states). No backend call shape changed; only what renders around them.
//
// UI fix (2026-10-25, side-by-side audit vs CrmMap390/768/1440, CrmProperty*): breakpoint layout
// (Map.module.css). ≥ 1280 px: three panes — Filters left (320 px), map centre, results right
// (360 px), the property drawer a 440 px side sheet over the right edge. < 1280 px: the map fills
// the screen under a one-row toolbar (Use my location, Filters sheet), results in a peeking,
// draggable bottom sheet over the map (ResultsSheet), the drawer a full-height sheet. One DOM at
// every width, so every data-state / data-testid / data-route hook is unchanged. Plus the
// zoomed-out overview (PO, 2026-10-25): hexagons and permit clusters below the overview zoom,
// the "Zoom in" chip and the legend. The overview's hexagons and permit clusters come from
// `search.countyOverview` (design-review-log row 10): the whole county, opening immediately with
// no centre, re-fetched per whole-number zoom and filter; the client binning of loaded results is
// only the fallback when that overview cannot be read (the legend says so). The first-visit
// "What can I ask?" card (components/Onboarding) floats over the map area.
import { useTRPC } from "@crm/api-client/react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useSearchParams } from "react-router";
import { COUNTY_ZOOM, WIDEN_STEP_MI, yearsToDays } from "@crm/domain";
import { isFinaledPermit } from "@crm/shared";
import { isInTravisCounty } from "../../components/Map/bounds.js";
import {
  CrmMap,
  type CrmMapHandle,
  type HexSelection,
  type LatLng,
} from "../../components/Map/CrmMap.js";
import { DRAWER_WIDTH_PX, focusPadding, focusTiming } from "../../components/Map/focusProperty.js";
import { hexSearchRadiusMi } from "../../components/Map/hexSearch.js";
import { GpsButton, LOW_ACCURACY_M } from "../../components/Map/GpsButton.js";
import { LayersPopover, type LayersState } from "../../components/Map/LayersPopover.js";
import { MapControls } from "../../components/Map/MapControls.js";
import { MapStatusCard } from "../../components/Map/MapStatusCard.js";
import { MapLegend } from "../../components/Map/MapLegend.js";
import { useLegendOpen } from "../../components/Map/legendState.js";
import type { MapViewMode } from "../../components/Map/CrmMap.js";
import {
  OVERVIEW_MAX_ZOOM,
  overviewPermitPoints,
  overviewToHexCells,
} from "../../components/Map/hexbin.js";
import type { CountyOverviewStatus } from "../../components/Map/MapLegend.js";
import { RadiusControl } from "../../components/Map/RadiusControl.js";
import { WhatCanIAsk } from "../../components/Onboarding/WhatCanIAsk.js";
import {
  overviewFilterNote,
  parseMapQuery,
  patchMapParams,
  presetPatch,
  type FilterPreset,
  RADIUS_BOUNDS,
  ROOF_ANY,
} from "./ExploreFilters.state.js";
import { FilterSheet, type PermitStatusFilter } from "./FilterSheet.js";
import { useShellAppLinks } from "../../components/AppShell/shellApi.js";
import { AnswerList } from "./Candidates/AnswerList.js";
import { CandidateList, patchMapView, useMapViewParam } from "./Candidates/index.js";
import {
  emptyStateCopy,
  propertiesSearchInput,
  leadsNote,
  permitNote,
  permitQueryInput,
} from "./Candidates/candidates.js";
import { useLeadMarks } from "./Candidates/useLeadMarks.js";
import { runLabel } from "./whyLead.js";
import { usePrefetchLeadsList } from "../Leads/leadsApi.js";
import {
  PropertyDetail,
  PropertyNotInRun,
  type PropertyDetailData,
} from "./PropertyDetail/PropertyDetail.js";
import { ResultsList } from "./ResultsList.js";
import { ResultsSheet } from "./ResultsSheet.js";
import type { ExactLookupResult } from "./SearchBox.js";
import { TopBar } from "./TopBar.js";
import { TriageStack } from "./Triage/index.js";
import { answerMatchTotal } from "../Ask/askCopy.js";
import { AskPanel, type AutoAsk } from "../Ask/AskPanel.js";
import { answerPins, type AgentAnswer } from "@crm/shared";
import { MapViewToggle, type MapViewChoice } from "./MapViewToggle.js";
import { PaneHandle } from "./PaneHandle.js";
import { usePaneCollapsed } from "./paneState.js";
import { newThreadId, patchMapMode, readThreadId, useMapMode } from "./mapMode.js";
import { COUNTY_NAME } from "../../components/AppShell/navigation.js";
import styles from "./Map.module.css";

const [, MAX_RADIUS_MI] = RADIUS_BOUNDS;
/** `property.get` rejects an id that is not a property id with BAD_REQUEST (or NOT_FOUND): the link
 *  names nothing in the run, which the drawer says, rather than a failed lookup. */
function isBadPropertyId(error: unknown): boolean {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
  return code === "BAD_REQUEST" || code === "NOT_FOUND";
}

const DEFAULT_LAYERS: LayersState = { roofs: true, permits: true, leads: true, gaps: false };
const NO_PROPERTIES: readonly { readonly requestIdentifier: string }[] = [];
/** The county overview changes only with a new promoted run; refetching it on every focus is waste. */
const OVERVIEW_STALE_MS = 5 * 60_000;
/** From this width the map has a pointer to aim with (the board's 1440/768 pin mode); under it, a
 *  fixed crosshair and "Place pin here" (the 390 board). Same break as Map.module.css's panes. */
const WIDE_QUERY = "(min-width: 1280px)";

function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const list = window.matchMedia(WIDE_QUERY);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/** Pixels of the map the 440 px right-edge drawer will cover: the drawer starts 440 px from the
 *  viewport's right edge, the map ends where the results pane begins. Unknown size: the whole drawer. */
function drawerOverlap(mapEl: HTMLElement | null): number {
  if (mapEl === null) return DRAWER_WIDTH_PX;
  const rect = mapEl.getBoundingClientRect();
  if (rect.width === 0) return DRAWER_WIDTH_PX;
  const drawerLeft = mapEl.ownerDocument.documentElement.clientWidth - DRAWER_WIDTH_PX;
  return Math.max(0, Math.round(rect.right - drawerLeft));
}

/** Pixels of the map the results sheet covers: the phone's bottom sheet floats over the map, the
 *  tablet's docked panel sits below it and covers none. Measured, so it stays right at any width. */
function sheetOverlap(mapEl: HTMLElement | null, sheet: HTMLElement | null | undefined): number {
  if (mapEl === null || sheet === null || sheet === undefined) return 0;
  const map = mapEl.getBoundingClientRect();
  const top = sheet.getBoundingClientRect().top;
  return Math.max(0, Math.round(map.bottom - top));
}

export function Component(): ReactElement {
  const trpc = useTRPC();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapQuery = useMemo(() => parseMapQuery(searchParams), [searchParams]);
  const {
    center,
    radiusMi,
    roofAgeMinYears,
    tenureYearsMin,
    outOfArea,
    permitStatus,
    permitOpenYrs,
    permitView,
    sel,
  } = mapQuery;
  const ownerFilterActive = tenureYearsMin !== undefined || outOfArea;
  // AC-1's edge case 2: a center outside Travis County is never itself the search point (the
  // pin still shows — see CrmMap's `center` prop below), so this is its own derived flag rather
  // than a URL key.
  const pinOutsideCounty = center !== null && !isInTravisCounty(center);

  const mapHandleRef = useRef<CrmMapHandle | null>(null);
  const mapAreaRef = useRef<HTMLDivElement | null>(null);
  const [layers, setLayers] = useState<LayersState>(DEFAULT_LAYERS);
  const [legendOpen, setLegendOpen] = useLegendOpen();
  // The first-visit card is up: the map's chips, legend and Layers step aside (one overlay at a
  // time, CRM-HANDOFF rule 11) and the card keeps clear of the results sheet (Map.module.css).
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  // A permit filter narrows the matches to properties with a matching permit, in every view: the
  // map and cards, the list and triage show the same properties and the same count.
  const permitFilterActive = permitStatus !== "any" || permitOpenYrs !== undefined;
  const [viewMode, setViewMode] = useState<MapViewMode>("overview");
  const [zoomStep, setZoomStep] = useState(COUNTY_ZOOM);
  // Pin mode (boards CrmMapPinMode*), the GPS fix's accuracy circle, whether the centre came from
  // GPS (its own card says if it is outside the county), and the map's status stack (a portal
  // target for the GPS, pin-mode and pin-outside cards).
  const [pinMode, setPinMode] = useState(false);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [fromGps, setFromGps] = useState(false);
  const [statusHost, setStatusHost] = useState<HTMLDivElement | null>(null);
  const wide = useWide();
  // `view=list` (the Candidate list) and `triage=1` (Field triage) live in the URL beside the
  // centre, radius and filters, so reload, back and a shared link reopen the same view.
  const { view, triage, setTriage } = useMapViewParam();
  const appLinks = useShellAppLinks();
  const [triageCid, setTriageCid] = useState<string | null>(null);
  // As soon as a lead can be created (a drawer is open, the candidate list or triage is showing),
  // fetch the first page of the Leads list, so a created lead is inserted into a real cached page
  // and /leads paints at once instead of waiting for its own round trip.
  const prefetchLeads = usePrefetchLeadsList();
  const canCreateLead = sel !== null || triage || view === "list";
  useEffect(() => {
    if (canCreateLead) void prefetchLeads();
  }, [canCreateLead, prefetchLeads]);
  // AI mode (`mode=ai&q=`): the agent answers inside the map; its cited properties are numbered pins.
  const { mode, q, setMode, clearQuestion } = useMapMode();
  // The question in `?q=` only prefills the box. Keep what the panel should show in state, and take
  // `q` out of the URL, so a reload or a shared link does not refill the box with an old question.
  const [prefill, setPrefill] = useState<string | null>(null);
  // An explicit click (a card question, "Ask about it") also carries `askNow` in the navigation
  // state: that, never the URL, is what makes the panel ask once. `clearQuestion` drops both.
  const askNow = (useLocation().state as { askNow?: unknown } | null)?.askNow === true;
  const [autoAsk, setAutoAsk] = useState<AutoAsk | null>(null);
  const autoAskNonce = useRef(0);
  useEffect(() => {
    if (q === null) return;
    setPrefill(q);
    if (askNow) {
      autoAskNonce.current += 1;
      setAutoAsk({ text: q, nonce: autoAskNonce.current });
    }
    // An explicit ask (the drawer's "Ask about it", a card question) closes the property drawer, or on
    // a tablet it stays on top and hides the answer.
    clearQuestion({ closeDrawer: askNow });
  }, [q, askNow, clearQuestion]);
  const consumeAutoAsk = useCallback(
    (nonce: number) => setAutoAsk((cur) => (cur?.nonce === nonce ? null : cur)),
    [],
  );
  const ai = mode === "ai";
  const [threadId, setThreadId] = useState(readThreadId);
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [focusedCitation, setFocusedCitation] = useState<number | null>(null);
  // Each pin is named after its property ("Source 2: TCAD 0201885122") for screen readers.
  const pins = useMemo(() => {
    if (answer === null) return [];
    const tcadByCid = new Map<string, string>();
    for (const c of answer.citations)
      if (c.propertyCid && c.tcadId) tcadByCid.set(c.propertyCid, c.tcadId);
    for (const r of answer.rows ?? []) tcadByCid.set(r.propertyCid, r.tcadId);
    return answerPins(answer).map((pin) => {
      const tcad = tcadByCid.get(pin.propertyCid);
      return tcad === undefined ? pin : { ...pin, label: `TCAD ${tcad}` };
    });
  }, [answer]);
  const hadAnswer = useRef(false);
  // The question behind `answer`, and whether the List view has been switched back to the filter
  // results ("Show filter results"). A new answer or a reset puts the answer back in the List.
  const [answerAsked, setAnswerAsked] = useState("");
  const [showFilterList, setShowFilterList] = useState(false);
  // Three-pane widths: each pane can be minimised (kept for the session); the Matches rows of an
  // AI answer render into the results pane (`matchesHost`) while the left pane shows the answer.
  const [leftCollapsedState, toggleLeft] = usePaneCollapsed("left");
  const leftCollapsed = wide && leftCollapsedState;
  const [matchesHost, setMatchesHost] = useState<HTMLDivElement | null>(null);
  // Once AI mode has been opened at three-pane widths its panel stays mounted (hidden under the
  // Filters tab), so switching tabs never throws the answer away.
  const [aiOpened, setAiOpened] = useState(ai);
  useEffect(() => {
    if (ai) setAiOpened(true);
  }, [ai]);
  // ONE AskPanel instance for the whole page. It renders into a detached host element through a
  // portal and that host is moved into the current slot (the left pane from 1280 px, the results
  // sheet below), so resizing, rotating or opening devtools changes where it is drawn, never
  // whether it is mounted: the answer, the question and the thread are never dropped.
  const panelHost = useMemo(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.dataset.askHost = "";
    return el;
  }, []);
  const [leftSlot, setLeftSlot] = useState<HTMLDivElement | null>(null);
  const [sheetSlot, setSheetSlot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (panelHost === null) return;
    const target = wide ? leftSlot : sheetSlot;
    if (target !== null && panelHost.parentElement !== target) target.appendChild(panelHost);
    else if (target === null && panelHost.parentElement !== null) panelHost.remove();
  }, [panelHost, wide, leftSlot, sheetSlot]);
  const onAnswer = useCallback((next: AgentAnswer | null, asked?: string) => {
    setAnswerAsked(asked ?? "");
    // A new answer is what the List shows; the way back to the filter results is per answer.
    setShowFilterList(false);
    // "New question" clears the answer: that starts a new agent thread (no carried-over memory).
    if (next === null && hadAnswer.current) setThreadId(newThreadId());
    hadAnswer.current = next !== null;
    setAnswer(next);
    setFocusedCitation(null);
  }, []);

  // Changing the search (a place, ZIP, address, permit, TCAD account or saved search chosen in the
  // top-bar box) starts a new conversation: the Ask panel forgets the last question and answer and
  // the agent gets a new thread, so a follow-up never inherits the previous place.
  const resetAsk = useCallback(() => {
    setThreadId(newThreadId());
    hadAnswer.current = false;
    setAnswer(null);
    setAnswerAsked("");
    setShowFilterList(false);
    setFocusedCitation(null);
    setPrefill(null);
  }, []);

  useEffect(() => {
    // Fire-and-forget: contracts/health.md's health.ping, same-origin via the Amplify /api/*
    // rewrite. Its own X-Ray trace (not this call's result) is what AC-2/NFR-001 checks.
    void fetch("/api/trpc/health.ping").catch(() => {
      // No UI consequence: health.ping failing does not block the map (it's an observability
      // probe, not a data dependency of this screen).
    });
  }, []);

  // A hexagon of the county overview opened the radius view (Escape or Back returns to the overview).
  const [fromHex, setFromHex] = useState(false);
  const hasRadiusParam = searchParams.has("r");
  const selectHex = useCallback(
    (cell: HexSelection) => {
      setPinMode(false);
      setAccuracyM(null);
      setFromGps(false);
      setFromHex(true);
      // The rep's own radius is kept; a cell the radius would not cover widens it (never past 25 mi).
      const radius = hexSearchRadiusMi(cell.lat, cell.zoom, hasRadiusParam ? radiusMi : undefined);
      setSearchParams((prev) => patchMapParams(prev, { lat: cell.lat, lng: cell.lng, r: radius }));
    },
    [hasRadiusParam, radiusMi, setSearchParams],
  );

  // Zooming into the county hexagons without clicking one searches what is in view, as a hexagon
  // click would: the view's centre becomes the search centre, the radius fits the view, and Escape
  // or Back returns to the overview. It runs once per zoom-in: clearing the search (Escape, Back,
  // Recentre) suppresses it until the map has zoomed back out to the overview, so it cannot
  // re-trigger while the camera is still flying out.
  const autoSearchSuppressedRef = useRef(false);
  const previousCentreRef = useRef(center);
  const [autoSearched, setAutoSearched] = useState(false);
  useEffect(() => {
    if (previousCentreRef.current !== null && center === null) {
      autoSearchSuppressedRef.current = true;
      setAutoSearched(false);
    }
    previousCentreRef.current = center;
  }, [center]);
  useEffect(() => {
    if (viewMode === "overview") autoSearchSuppressedRef.current = false;
  }, [viewMode]);
  useEffect(() => {
    if (
      viewMode !== "detail" ||
      center !== null ||
      autoSearchSuppressedRef.current ||
      pinMode ||
      sel !== null ||
      ai ||
      triage ||
      view !== "map"
    )
      return;
    const found = mapHandleRef.current?.viewportSearch();
    if (found === null || found === undefined) return;
    autoSearchSuppressedRef.current = true;
    setAutoSearched(true);
    setFromHex(true);
    setSearchParams((prev) =>
      patchMapParams(prev, { lat: found.lat, lng: found.lng, r: found.radiusMi }),
    );
  }, [viewMode, center, pinMode, sel, ai, triage, view, setSearchParams]);
  // A search the person changes themselves (radius, roof age, permits, owner) re-focuses on the new
  // results like any other; only the first, automatic one keeps the camera where they put it.
  useEffect(() => {
    setAutoSearched(false);
  }, [radiusMi, roofAgeMinYears, permitStatus, permitOpenYrs]);

  // A pin dropped, placed or dragged by hand: ends pin mode, and is not a GPS fix.
  const placePoint = useCallback(
    (point: LatLng) => {
      setFromHex(false);
      setPinMode(false);
      setAccuracyM(null);
      setFromGps(false);
      setSearchParams((prev) => patchMapParams(prev, { lat: point.lat, lng: point.lng }));
    },
    [setSearchParams],
  );

  // Escape leaves a hexagon search for the overview (only when nothing else is open).
  useEffect(() => {
    if (!fromHex || center === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented || sel !== null || pinMode) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [role='dialog']")
      )
        return;
      setFromHex(false);
      setSearchParams((prev) => patchMapParams(prev, { lat: null, lng: null, r: null }));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fromHex, center, sel, pinMode, setSearchParams]);
  useEffect(() => {
    if (center === null) setFromHex(false);
  }, [center]);

  // A GPS fix: the same centre change, but it keeps the accuracy `GpsButton` reports first.
  const gpsLocated = useCallback(
    (point: LatLng) => {
      setPinMode(false);
      setFromHex(false);
      setFromGps(true);
      setSearchParams((prev) => patchMapParams(prev, { lat: point.lat, lng: point.lng }));
    },
    [setSearchParams],
  );

  const setRadiusMi = useCallback(
    (value: number) => {
      setSearchParams((prev) => patchMapParams(prev, { r: value }));
    },
    [setSearchParams],
  );

  const setRoofAgeMinYears = useCallback(
    (value: number | undefined) => {
      setSearchParams((prev) => patchMapParams(prev, { roof: value ?? ROOF_ANY }));
    },
    [setSearchParams],
  );

  const setTenureYearsMin = useCallback(
    (value: number | undefined) => {
      setSearchParams((prev) => patchMapParams(prev, { tenure: value ?? null }));
    },
    [setSearchParams],
  );

  // The permit filters live in the URL beside the roof age, so a shared link or a reload keeps them.
  const setPermitStatus = useCallback(
    (value: PermitStatusFilter) => {
      setSearchParams((prev) => patchMapParams(prev, { permit: value === "any" ? null : value }));
    },
    [setSearchParams],
  );

  const setPermitOpenYrs = useCallback(
    (value: number | undefined) => {
      setSearchParams((prev) => patchMapParams(prev, { permitYrs: value ?? null }));
    },
    [setSearchParams],
  );

  // One URL update for a Suggestions preset: place and radius stay, the other filters are replaced.
  const applyPreset = useCallback(
    (preset: FilterPreset) => {
      setSearchParams((prev) => patchMapParams(prev, presetPatch(preset)));
    },
    [setSearchParams],
  );

  const setOutOfArea = useCallback(
    (value: boolean) => {
      setSearchParams((prev) => patchMapParams(prev, { ooa: value ? true : null }));
    },
    [setSearchParams],
  );

  const selectProperty = useCallback(
    (propertyCid: string) => {
      setSearchParams((prev) => patchMapParams(prev, { sel: propertyCid }));
    },
    [setSearchParams],
  );

  // The top-bar search box: a chosen place or ZIP centres the radius search like a pin drop does
  // (the radius in the URL is kept); a found permit or TCAD account opens its property.
  const queryClient = useQueryClient();
  const searchCentre = useCallback(
    (point: LatLng) => {
      resetAsk();
      setFromHex(false);
      setPinMode(false);
      setAccuracyM(null);
      setFromGps(false);
      setSearchParams((prev) =>
        patchMapParams(prev, { lat: point.lat, lng: point.lng, sel: null }),
      );
    },
    [setSearchParams, resetAsk],
  );
  const searchOpenProperty = useCallback(
    (propertyCid: string, point: LatLng) => {
      resetAsk();
      setFromHex(false);
      setPinMode(false);
      setAccuracyM(null);
      setFromGps(false);
      setSearchParams((prev) =>
        patchMapParams(prev, { lat: point.lat, lng: point.lng, sel: propertyCid }),
      );
    },
    [setSearchParams, resetAsk],
  );
  // Saved searches: the box saves the URL's centre, radius and roof filter, and a chosen one is
  // put back through the URL like a pin drop (the open property is closed).
  const searchCurrent = useMemo(
    () =>
      center === null ? null : { lat: center.lat, lng: center.lng, radiusMi, roofAgeMinYears },
    [center, radiusMi, roofAgeMinYears],
  );
  const searchApplySaved = useCallback(
    (view: {
      lat: number;
      lng: number;
      radiusMi: number;
      roofAgeMinYears?: number | undefined;
    }) => {
      resetAsk();
      setFromHex(false);
      setPinMode(false);
      setAccuracyM(null);
      setFromGps(false);
      setSearchParams((prev) =>
        patchMapParams(prev, {
          lat: view.lat,
          lng: view.lng,
          r: view.radiusMi,
          roof: view.roofAgeMinYears ?? ROOF_ANY,
          sel: null,
        }),
      );
    },
    [setSearchParams, resetAsk],
  );
  // Called only when a permit/TCAD option is chosen, so nothing is requested while typing.
  const searchLookup = useCallback(
    (kind: "permit" | "tcad", value: string): Promise<ExactLookupResult> =>
      queryClient.fetchQuery(
        kind === "permit"
          ? trpc.search.byPermitNumber.queryOptions({ value })
          : trpc.search.byTcadId.queryOptions({ value }),
      ),
    [queryClient, trpc],
  );

  const searchAddress = useCallback(
    (value: string) =>
      queryClient.fetchQuery(trpc.search.byAddress.queryOptions({ value, limit: 5 })),
    [queryClient, trpc],
  );

  const closeDetail = useCallback(() => {
    setSearchParams((prev) => patchMapParams(prev, { sel: null }));
  }, [setSearchParams]);

  const searchInput = useMemo(
    () =>
      center === null || pinOutsideCounty
        ? null
        : propertiesSearchInput(
            center,
            radiusMi,
            roofAgeMinYears,
            tenureYearsMin,
            outOfArea,
            permitStatus,
            permitOpenYrs,
          ),
    [
      center,
      pinOutsideCounty,
      radiusMi,
      roofAgeMinYears,
      tenureYearsMin,
      outOfArea,
      permitStatus,
      permitOpenYrs,
    ],
  );

  const query = useQuery({
    ...trpc.search.properties.queryOptions(searchInput ?? { center: { lat: 0, lng: 0 }, radiusMi }),
    enabled: searchInput !== null,
  });

  // T028 (B-03, US3): search.permits over the same radius-filtered set. Fetched whenever either
  // the permit-view toggle (results list) or the Layers popover's "permits" marker layer is on —
  // the two controls share one request, never two separately-derived ones.
  const wantPermits = permitView || layers.permits || permitFilterActive;
  // The server filters (status, open years) and pages (the 500 longest open); the input is built
  // by the same helper the Candidate list and Field triage use, so all three share one cache entry.
  const permitsQuery = useQuery({
    ...trpc.search.permits.queryOptions(
      permitQueryInput(
        searchInput === null ? null : searchInput.center,
        searchInput === null ? radiusMi : searchInput.radiusMi,
        permitStatus,
        permitOpenYrs,
      ),
    ),
    enabled: searchInput !== null && wantPermits,
  });
  const filteredPermits = useMemo(() => permitsQuery.data?.permits ?? [], [permitsQuery.data]);
  const permitClipNote = wantPermits
    ? permitNote(
        permitsQuery.data === undefined
          ? undefined
          : {
              total: permitsQuery.data.total ?? permitsQuery.data.permits.length,
              truncated: permitsQuery.data.truncated === true,
            },
      )
    : null;

  const permitsByPropertyCid = useMemo(() => {
    const map = new Map<string, typeof filteredPermits>();
    for (const permit of filteredPermits) {
      map.set(permit.propertyCid, [...(map.get(permit.propertyCid) ?? []), permit]);
    }
    return map;
  }, [filteredPermits]);

  // The properties the map and the cards list: the nearest page of the ring, and with a permit
  // filter only those with a matching permit (the rule the Candidate list applies, buildCandidates).
  // While the permits load the filtered set is not known yet.
  // The server applies the permit filters to every property in the circle before it pages and
  // counts, so the rows listed are exactly the page it returned.
  const listProperties = useMemo(() => query.data?.properties ?? [], [query.data]);

  const detailQuery = useQuery({
    ...trpc.property.get.queryOptions({ propertyCid: sel ?? "" }),
    enabled: sel !== null,
    // A rejected id will be rejected again: say so at once instead of retrying.
    retry: (failures: number, error: unknown) => !isBadPropertyId(error) && failures < 1,
  });

  // The selected property's position: from the results row when it is there, else from its detail.
  const selectedPoint = useMemo<LatLng | null>(() => {
    if (sel === null) return null;
    const row = query.data?.properties.find((p) => p.propertyCid === sel);
    const from = row ?? detailQuery.data?.property ?? null;
    if (from === null || from.latitude === null || from.longitude === null) return null;
    return { lat: from.latitude, lng: from.longitude };
  }, [sel, query.data, detailQuery.data]);
  // Selecting a property (a marker, a row, ?sel= from a link or a reload, Open on map, Show on map)
  // centres the map on it, once per selection: closing the drawer keeps the view. Only the camera
  // moves; the search pin and the radius are untouched.
  const drawerReady = sel !== null && detailQuery.data !== undefined;
  const centredOnRef = useRef<string | null>(null);
  // A selection already in the URL when the page opened (a link or a reload) has no earlier view to
  // fly from: the camera jumps there instead of animating through every zoom level.
  const openedWithSelRef = useRef(sel);
  const deepLinkTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (sel === null) {
      centredOnRef.current = null;
      return;
    }
    const handle = mapHandleRef.current;
    if (centredOnRef.current === sel || selectedPoint === null || handle === null || view !== "map")
      return;
    // A deep link waits for the drawer to be on screen, then pauses: the pause starts when the rep
    // can first act (the drawer is there), so the first thing they do cancels the move.
    const deepLink = openedWithSelRef.current === sel;
    if (deepLink && !drawerReady) return;
    centredOnRef.current = sel;
    const point = selectedPoint;
    const move = (instant: boolean): void => {
      const mapEl = mapAreaRef.current;
      const sheet = mapEl?.ownerDocument.querySelector<HTMLElement>("[data-sheet]");
      handle.focusProperty(
        point,
        focusPadding({
          wide,
          mapWidth: mapEl?.clientWidth ?? 0,
          mapHeight: mapEl?.clientHeight ?? 0,
          drawerOverlap: drawerOverlap(mapEl),
          sheetHeight: wide ? 0 : sheetOverlap(mapEl, sheet),
        }),
        instant,
      );
    };
    if (!deepLink) {
      move(false);
      return;
    }
    // A deep link: jump there after a pause, unless the rep has started using the page by then.
    deepLinkTimerRef.current = window.setTimeout(() => {
      deepLinkTimerRef.current = undefined;
      move(true);
    }, focusTiming.deepLinkDelayMs);
  }, [sel, selectedPoint, view, wide, drawerReady]);
  const cancelDeepLinkFocus = useCallback(() => {
    if (deepLinkTimerRef.current !== undefined) window.clearTimeout(deepLinkTimerRef.current);
    deepLinkTimerRef.current = undefined;
  }, []);
  useEffect(() => cancelDeepLinkFocus, [cancelDeepLinkFocus]);

  const widenTo = radiusMi + WIDEN_STEP_MI <= MAX_RADIUS_MI ? radiusMi + WIDEN_STEP_MI : null;
  const isZeroResult =
    searchInput !== null && query.data !== undefined && listProperties.length === 0;

  // The map's own question, handed to the Candidate list and Field triage. Same centre rule as the
  // map's search (an outside pin is never a search centre), so the three share one React Query
  // cache entry for `search.properties` and `search.permits`.
  const candidateFilters = useMemo(
    () => ({
      center: pinOutsideCounty ? null : center,
      radiusMi,
      roofAgeMinYears,
      tenureYearsMin,
      outOfArea,
      permitStatus,
      permitOpenYrs,
    }),
    [
      pinOutsideCounty,
      center,
      radiusMi,
      roofAgeMinYears,
      tenureYearsMin,
      outOfArea,
      permitStatus,
      permitOpenYrs,
    ],
  );
  // One URL update (two in a row would each start from the same params and drop the first).
  const showOnMap = useCallback(
    (cid: string) => {
      setSearchParams((prev) => patchMapView(patchMapParams(prev, { sel: cid }), { view: "map" }));
    },
    [setSearchParams],
  );
  const openTriage = useCallback(() => setTriage(true), [setTriage]);
  const closeTriage = useCallback(() => {
    setTriage(false);
    setTriageCid(null);
  }, [setTriage]);

  // The toggle above the map is a pure view switch (Map + cards | List): it never changes the mode,
  // so AI mode (and its answer) survives a switch of view. One URL update, like every other change.
  const chooseView = useCallback(
    (choice: MapViewChoice) => {
      setSearchParams((prev) => patchMapView(prev, { view: choice === "list" ? "list" : "map" }));
    },
    [setSearchParams],
  );
  // The left pane's Filters | Ask AI switch (from 1280 px): the mode, shown on the map view.
  const chooseLeft = useCallback(
    (choice: "filters" | "ai") => {
      setSearchParams((prev) =>
        patchMapMode(patchMapView(prev, { view: "map" }), {
          mode: choice === "ai" ? "ai" : "map",
        }),
      );
    },
    [setSearchParams],
  );

  // "My leads" layer: which of the ring's properties are already leads (the List view's read, same
  // cache entries). Off, nothing is fetched.
  const leadMarks = useLeadMarks(query.data?.properties ?? NO_PROPERTIES, layers.leads);

  const roofMarkers = useMemo(
    () =>
      listProperties
        .filter((p) => p.latitude !== null && p.longitude !== null)
        .map((p) => {
          const leadStatus = layers.leads
            ? leadMarks.marks.get(p.requestIdentifier)?.status
            : undefined;
          return {
            propertyCid: p.propertyCid,
            lat: p.latitude as number,
            lng: p.longitude as number,
            roofAgeConfidence: p.roofAgeConfidence,
            roofAgeYears: p.roofAgeYears,
            ...(leadStatus === undefined ? {} : { leadStatus }),
          };
        }),
    [listProperties, layers.leads, leadMarks.marks],
  );

  const permitMarkers = useMemo(() => {
    const properties = new Map((query.data?.properties ?? []).map((p) => [p.propertyCid, p]));
    return filteredPermits
      .map((permit) => {
        const property = properties.get(permit.propertyCid);
        if (property?.latitude == null || property.longitude == null) return null;
        return {
          permitCid: permit.permitCid,
          propertyCid: permit.propertyCid,
          lat: property.latitude,
          lng: property.longitude,
          // A permit with a final date is finished: never pinned as open or stalled.
          statusClass: isFinaledPermit(permit) ? "closed" : permit.statusClass,
          isLongOpen: permit.isLongOpen,
          openDays: permit.openDays,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }, [filteredPermits, query.data]);

  // The whole-county overview (zoomed out only). Same filters as the markers: roof-age minimum
  // and, with the permit layer on, permit status and "open at least N yrs" (the client filter
  // above drops openDays / 365.25 < N, so the server's day threshold is ceil(N × 365.25)).
  const overviewWanted = viewMode === "overview" && (layers.roofs || layers.permits);
  const overviewInput = useMemo(
    () => ({
      zoom: Math.max(0, Math.min(zoomStep, OVERVIEW_MAX_ZOOM - 1)),
      ...(roofAgeMinYears === undefined ? {} : { roofAgeMinYears }),
      ...(layers.permits
        ? {
            permits: true,
            ...(permitStatus === "any" ? {} : { permitStatus }),
            ...(permitOpenYrs === undefined
              ? {}
              : { permitOpenDaysMin: yearsToDays(permitOpenYrs) }),
          }
        : {}),
    }),
    [zoomStep, roofAgeMinYears, layers.permits, permitStatus, permitOpenYrs],
  );
  const overviewQuery = useQuery({
    ...trpc.search.countyOverview.queryOptions(overviewInput),
    enabled: overviewWanted,
    // Keep the previous zoom's hexagons on screen while the next zoom's load (they are still
    // geographically right, just a different size).
    placeholderData: keepPreviousData,
    staleTime: OVERVIEW_STALE_MS,
  });
  const overview = overviewQuery.isError ? undefined : overviewQuery.data;
  const overviewCells = useMemo(
    () => (overview === undefined ? null : overviewToHexCells(overview.cells, overview.zoom)),
    [overview],
  );
  const overviewPermits = useMemo(
    () =>
      overview === undefined || overview.counts.openPermits === undefined
        ? null
        : overviewPermitPoints(overview.cells),
    [overview],
  );
  const countyStatus = useMemo<CountyOverviewStatus>(() => {
    if (overviewQuery.isError) return { state: "error" };
    if (overview === undefined) return { state: "loading" };
    return {
      state: "ready",
      binned: overview.counts.binned,
      excludedNoCoordinates: overview.counts.excludedNoCoordinates,
      excludedNoRoofDate: overview.counts.excludedNoRoofDate,
      binnedWithoutRoofAge: overview.counts.binnedWithoutRoofAge,
      runId: overview.runId,
    };
  }, [overviewQuery.isError, overview]);

  const hasResults = query.data !== undefined && listProperties.length > 0;
  const isLoading =
    searchInput !== null && (query.isLoading || (permitFilterActive && permitsQuery.isLoading));
  const isIndexDown = searchInput !== null && query.isError;
  const sheetEmpty =
    !pinOutsideCounty && !isLoading && !isIndexDown && !isZeroResult && !hasResults;
  // A sheet that only holds a notice (no pin, loading, failed, or nothing found) peeks small.
  const compactPeek = pinOutsideCounty || isLoading || isIndexDown || isZeroResult || sheetEmpty;
  // The results pane starts collapsed while it has nothing to show (no centre chosen, no results,
  // not AI or triage); once the user toggles it, their choice stands for the session.
  const [rightCollapsedState, toggleRight] = usePaneCollapsed(
    "right",
    sheetEmpty && !ai && !triage,
  );
  const rightCollapsed = wide && rightCollapsedState;
  // Counts come from the server's totals; a clipped page says so (never a page as the whole set).
  // Permit filters included: the server counts the properties that pass every filter.
  const serverTotal = query.data?.counts?.afterRoofAge ?? query.data?.properties.length ?? 0;
  const matchTotal = serverTotal;
  const propertiesClipped =
    query.data !== undefined && serverTotal > (query.data?.properties.length ?? 0);
  const resultsNote =
    propertiesClipped || permitClipNote !== null
      ? [
          propertiesClipped
            ? `Showing the nearest ${String(query.data?.properties.length ?? 0)} of ${serverTotal.toLocaleString("en-US")} properties; narrow the radius or raise the roof age.`
            : null,
          permitClipNote,
        ]
          .filter((line): line is string => line !== null)
          .join(" ")
      : undefined;
  const showOverviewChip =
    viewMode === "overview" &&
    layers.roofs &&
    ((overviewCells?.length ?? 0) > 0 || roofMarkers.length > 0);

  const askPanel = (layout: "pane" | "sheet"): ReactElement => (
    <AskPanel
      threadId={threadId}
      {...(prefill === null ? {} : { initialQuestion: prefill })}
      focusedCitation={focusedCitation}
      onFocusCitation={setFocusedCitation}
      onAnswer={onAnswer}
      onShowOnMap={() => mapHandleRef.current?.fitPins()}
      onOpenProperty={selectProperty}
      autoAsk={autoAsk}
      onAutoAskConsumed={consumeAutoAsk}
      layout={layout}
      {...(layout === "pane" ? { matchesHost } : {})}
    />
  );
  const askPanelPortal =
    aiOpened && panelHost !== null
      ? createPortal(askPanel(wide ? "pane" : "sheet"), panelHost)
      : null;
  const topChoice: MapViewChoice = view === "list" ? "list" : "cards";
  const matchCountInAnswer = answer === null ? 0 : answerMatchTotal(answer);

  return (
    <section
      aria-label="Map"
      data-route="map"
      data-view={view}
      {...(welcomeOpen
        ? { "data-welcome": "open", "data-sheet-peek": compactPeek ? "compact" : "results" }
        : {})}
      {...(ai ? { "data-mode": "ai" } : {})}
      className={styles.page}
    >
      <div className={styles.top}>
        <TopBar
          onCentre={searchCentre}
          onOpenProperty={searchOpenProperty}
          lookup={searchLookup}
          lookupAddress={searchAddress}
          current={searchCurrent}
          onApplySaved={searchApplySaved}
        />
      </div>
      <div
        className={styles.controls}
        data-pane="left"
        data-collapsed={leftCollapsed ? "true" : undefined}
      >
        {wide ? (
          <PaneHandle
            side="left"
            label="filters"
            collapsed={leftCollapsed}
            controls="map-left-body"
            onToggle={toggleLeft}
          />
        ) : null}
        <div id="map-left-body" className={styles.paneBody} hidden={leftCollapsed}>
          {wide ? (
            <div role="group" aria-label="Left panel" className={styles.leftSwitch}>
              <button
                type="button"
                className={`${styles.leftTab} ${ai ? "" : styles.leftTabOn}`}
                aria-pressed={!ai}
                onClick={() => chooseLeft("filters")}
              >
                Filters
              </button>
              <button
                type="button"
                className={`${styles.leftTab} ${ai ? styles.leftTabOn : ""}`}
                aria-pressed={ai}
                aria-label="Ask AI panel"
                onClick={() => chooseLeft("ai")}
              >
                Ask AI
              </button>
            </div>
          ) : null}
          <div className={styles.paneBody} hidden={wide && ai}>
            <GpsButton
              onLocated={gpsLocated}
              onAccuracy={setAccuracyM}
              isInCoverage={isInTravisCounty}
              radiusMi={radiusMi}
              onDropPin={() => setPinMode(true)}
              onGoToCounty={() => mapHandleRef.current?.showCounty()}
              statusHost={statusHost}
            />
            <FilterSheet
              roofAgeMinYears={roofAgeMinYears}
              onRoofAgeMinYearsChange={setRoofAgeMinYears}
              permitStatus={permitStatus}
              onPermitStatusChange={setPermitStatus}
              permitOpenYrs={permitOpenYrs}
              onPermitOpenYrsChange={setPermitOpenYrs}
              tenureYearsMin={tenureYearsMin}
              onTenureYearsMinChange={setTenureYearsMin}
              outOfArea={outOfArea}
              onOutOfAreaChange={setOutOfArea}
              matchNote={
                searchInput === null || query.data === undefined
                  ? overviewFilterNote(permitFilterActive, ownerFilterActive)
                  : undefined
              }
              matchCount={
                searchInput === null || query.data === undefined
                  ? // The county overview is not filtered by owner or permit: no count rather than a
                    // wrong one.
                    ownerFilterActive || permitFilterActive
                    ? undefined
                    : (overview?.counts.matched ?? undefined)
                  : matchTotal
              }
              matchScope={
                searchInput === null || query.data === undefined
                  ? "county-wide"
                  : `within ${String(radiusMi)} mi`
              }
              runLabel={
                listProperties[0] === undefined
                  ? overview?.runId == null
                    ? undefined
                    : runLabel(overview.runId)
                  : runLabel(listProperties[0].runId)
              }
              onApplyPreset={applyPreset}
              onClear={() => {
                // One URL update: two in a row would each start from the same params.
                setSearchParams((prev) =>
                  patchMapParams(prev, {
                    roof: null,
                    tenure: null,
                    ooa: null,
                    permit: null,
                    permitYrs: null,
                  }),
                );
              }}
              open={mode === "filters"}
              onOpenChange={(open) => setMode(open ? "filters" : "map")}
              inline={wide}
            />
            {wide ? null : <MapViewToggle selected={topChoice} onSelect={chooseView} />}
          </div>
          {wide && aiOpened ? (
            <div className={styles.aiLeft} hidden={!ai}>
              <div ref={setLeftSlot} className={styles.aiSlot} />
            </div>
          ) : null}
        </div>
      </div>
      {wide ? (
        <div className={styles.viewBar} data-view-bar="">
          <MapViewToggle selected={topChoice} onSelect={chooseView} />
        </div>
      ) : null}
      {view === "list" ? (
        <div className={styles.listPane} data-view="list">
          {answer !== null && (answer.rows?.length ?? 0) > 0 && !showFilterList ? (
            <AnswerList
              answer={answer}
              asked={answerAsked}
              selectedCid={sel}
              onSelect={selectProperty}
              onShowOnMap={showOnMap}
              onShowFilterResults={() => setShowFilterList(true)}
            />
          ) : (
            <CandidateList
              filters={candidateFilters}
              originLabel={center === null ? "the county" : fromGps ? "you" : "the pin"}
              selectedCid={sel}
              onSelect={selectProperty}
              onShowOnMap={showOnMap}
              onRadiusChange={setRadiusMi}
              onRoofChange={setRoofAgeMinYears}
              onPermitStatusChange={setPermitStatus}
              onPermitOpenYrsChange={setPermitOpenYrs}
            />
          )}
        </div>
      ) : null}
      {view === "map" ? (
        <div ref={mapAreaRef} className={styles.mapArea} onPointerDownCapture={cancelDeepLinkFocus}>
          <CrmMap
            ref={mapHandleRef}
            center={center}
            {...(pinOutsideCounty ? {} : { radiusMi })}
            onPinDrop={placePoint}
            roofMarkers={roofMarkers}
            permitMarkers={permitMarkers}
            layers={layers}
            onViewModeChange={setViewMode}
            onZoomStepChange={setZoomStep}
            overviewCells={overviewCells}
            overviewPermits={overviewPermits}
            pinMode={pinMode}
            accuracy={accuracyM === null || center === null ? null : { meters: accuracyM }}
            triageCid={triage ? triageCid : null}
            answerPins={pins}
            focusedPin={focusedCitation}
            onPinSelect={setFocusedCitation}
            onHexSelect={selectHex}
            onPropertySelect={selectProperty}
            focusResults={!ai && !triage && sel === null && view === "map" && !autoSearched}
            selectedPoint={selectedPoint}
          />
          <MapControls
            mapRef={mapHandleRef}
            pinMode={pinMode}
            onDropPin={() => setPinMode((on) => !on)}
          />
          <div className={styles.overlay} data-centre={center === null ? "none" : "set"}>
            <div className={styles.layersRow}>
              <LayersPopover
                value={layers}
                onChange={setLayers}
                legend={{ open: legendOpen, onChange: setLegendOpen }}
              />
              <div className={styles.legendSlot}>
                <MapLegend
                  mode={viewMode}
                  roofs={layers.roofs}
                  permits={layers.permits}
                  leads={layers.leads}
                  leadsNote={leadsNote(leadMarks.reason)}
                  loadedCount={roofMarkers.length}
                  county={countyStatus}
                  toggle="none"
                />
              </div>
            </div>
            <div ref={setStatusHost} className={styles.statusStack} data-map-status="" />
            {showOverviewChip ? (
              <p className={styles.chip} role="status" data-view-chip="overview">
                <span>
                  Click a hexagon to search there
                  {overviewFilterNote(permitFilterActive, ownerFilterActive) === undefined
                    ? ""
                    : `. ${overviewFilterNote(permitFilterActive, ownerFilterActive) ?? ""}`}
                </span>
                <button
                  type="button"
                  className={styles.chipAction}
                  aria-label="Zoom in to individual properties"
                  onClick={() => mapHandleRef.current?.zoomToDetail()}
                >
                  Zoom in
                </button>
              </p>
            ) : null}
            {center === null ? null : (
              <div className={styles.radiusOverlay}>
                <RadiusControl
                  radiusMi={radiusMi}
                  onChange={setRadiusMi}
                  originLabel={
                    !fromGps
                      ? "the pin"
                      : accuracyM !== null && accuracyM > LOW_ACCURACY_M
                        ? "your location (approximate)"
                        : "your location (GPS)"
                  }
                />
              </div>
            )}
          </div>
          {center === null ? (
            <p className={styles.countyCard} data-county-card="">
              <strong>Whole county</strong>
              <span>
                Tap the map to drop a pin, or use your location, to list properties within a radius.
              </span>
            </p>
          ) : null}
          <WhatCanIAsk onOpenChange={setWelcomeOpen} />
          {statusHost !== null && pinMode
            ? createPortal(
                <MapStatusCard
                  state="CrmMapPinMode390"
                  role="status"
                  icon="add_location_alt"
                  actions={[
                    ...(wide
                      ? []
                      : [
                          {
                            label: "Place pin here",
                            primary: true,
                            onClick: () => {
                              mapHandleRef.current?.placeAtCenter();
                              setPinMode(false);
                            },
                          },
                        ]),
                    { label: "Cancel", onClick: () => setPinMode(false) },
                  ]}
                >
                  {wide
                    ? "Click the map where you want the search centre. You can drag the pin afterwards."
                    : "Move the map so the crosshair is on the spot, then place the pin."}
                </MapStatusCard>,
                statusHost,
              )
            : null}
          {statusHost !== null && pinOutsideCounty && !fromGps
            ? createPortal(
                <MapStatusCard
                  state="CrmMapPinOutside390"
                  role="alert"
                  icon="wrong_location"
                  actions={[
                    {
                      label: `Go to ${COUNTY_NAME}`,
                      onClick: () => mapHandleRef.current?.showCounty(),
                    },
                  ]}
                >
                  This pin is outside {COUNTY_NAME}. The CRM covers {COUNTY_NAME} only.
                </MapStatusCard>,
                statusHost,
              )
            : null}
        </div>
      ) : null}
      {view === "map" ? (
        <div
          className={styles.resultsSlot}
          data-empty={ai || triage ? "false" : sheetEmpty}
          data-pane="right"
          {...(ai ? { "data-slot": "ai" } : {})}
          data-collapsed={rightCollapsed ? "true" : undefined}
        >
          {wide ? (
            <PaneHandle
              side="right"
              label="results"
              collapsed={rightCollapsed}
              controls="map-right-body"
              onToggle={toggleRight}
            />
          ) : null}
          <div id="map-right-body" className={styles.paneBody} hidden={rightCollapsed}>
            {ai ? (
              wide ? (
                <div className={styles.matchesPane} data-slot="ai-matches">
                  <h2 className={styles.matchesTitle}>{`Matches ${String(matchCountInAnswer)}`}</h2>
                  {answer === null ? (
                    <p className={styles.notice}>
                      Ask a question on the left. The properties it matches appear here, numbered
                      like the pins on the map.
                    </p>
                  ) : null}
                  <div ref={setMatchesHost} className={styles.matchesHost} />
                </div>
              ) : (
                <ResultsSheet>
                  <div ref={setSheetSlot} className={styles.aiSlot} />
                </ResultsSheet>
              )
            ) : triage ? (
              <div className={styles.triageDock}>
                <TriageStack
                  filters={candidateFilters}
                  onBack={closeTriage}
                  onOpenDetails={selectProperty}
                  onCurrentChange={setTriageCid}
                  onRadiusChange={setRadiusMi}
                  onRoofChange={setRoofAgeMinYears}
                />
              </div>
            ) : (
              <ResultsSheet peek={compactPeek ? "compact" : "results"}>
                {pinOutsideCounty ? (
                  <p className={styles.notice}>
                    No search was run: the pin is outside Travis County.
                  </p>
                ) : null}
                {isLoading ? (
                  <p
                    role="progressbar"
                    aria-label="Loading results"
                    data-state="CrmMapLoading390"
                    className={styles.notice}
                  >
                    Loading results…
                  </p>
                ) : null}
                {isIndexDown ? (
                  <p role="alert" data-state="CrmMapIndexDown390" className={styles.notice}>
                    <span>
                      <strong>Lead index unavailable.</strong> Map results can&apos;t load right
                      now. Your leads and notes still open.
                    </span>
                    <button
                      type="button"
                      className={styles.widen}
                      onClick={() => void query.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                ) : null}
                {isZeroResult ? (
                  <p role="status" data-state="CrmMapNoResults390" className={styles.notice}>
                    {permitFilterActive || ownerFilterActive
                      ? `${emptyStateCopy(candidateFilters).title} ${emptyStateCopy(candidateFilters).text}`
                      : `No properties within ${String(radiusMi)} mi.`}
                    {widenTo === null ? null : (
                      <button
                        type="button"
                        className={styles.widen}
                        onClick={() => setRadiusMi(widenTo)}
                      >
                        {`Widen to ${widenTo} mi`}
                      </button>
                    )}
                  </p>
                ) : null}
                {sheetEmpty ? (
                  <p className={styles.notice} data-results-empty="">
                    No centre chosen yet, so no results. Drop a pin on the map or use your location
                    to list properties within a radius.
                  </p>
                ) : null}
                {query.data !== undefined && hasResults ? (
                  <ResultsList
                    rows={listProperties}
                    total={matchTotal}
                    clipped={propertiesClipped}
                    note={resultsNote}
                    center={center}
                    selectedCid={sel}
                    onSelect={selectProperty}
                    permitsByPropertyCid={
                      permitsQuery.data === undefined ? null : permitsByPropertyCid
                    }
                    onTriage={wide ? undefined : openTriage}
                    radiusMi={radiusMi}
                    centreLabel={fromGps ? "you" : "the pin"}
                  />
                ) : null}
              </ResultsSheet>
            )}
          </div>
        </div>
      ) : null}
      {askPanelPortal}
      {sel !== null && detailQuery.isError ? (
        <div className={styles.drawerSlot}>
          <PropertyNotInRun
            onClose={closeDetail}
            reason={isBadPropertyId(detailQuery.error) ? "not-in-run" : "unavailable"}
            onRetry={() => void detailQuery.refetch()}
          />
        </div>
      ) : null}
      {sel !== null && detailQuery.data !== undefined ? (
        <div className={styles.drawerSlot} onPointerDownCapture={cancelDeepLinkFocus}>
          <PropertyDetail
            data={detailQuery.data satisfies PropertyDetailData}
            onClose={closeDetail}
            onSelectProperty={selectProperty}
            {...(center === null ? {} : { center, radiusMi })}
            centreLabel={fromGps ? "you" : "the pin"}
            countyLensUrl={appLinks.data?.countyLensUrl}
          />
        </div>
      ) : null}
    </section>
  );
}
