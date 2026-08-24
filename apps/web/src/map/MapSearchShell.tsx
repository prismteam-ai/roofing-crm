/**
 * Map search shell: drop a pin or use GPS, set radius, and hold search-center state.
 *
 * Includes aging-roof / permit layer chrome, candidate list (accessible twin of
 * markers), property drawer with Convert to lead, and a Leads panel from the API.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type JSX,
  type RefObject,
} from "react";

import { DISABLED_CRM_NAV_SECTIONS } from "../chrome/disabled-crm-nav-sections";
import { PlatDeferredFeaturePanel } from "../chrome/PlatDeferredFeaturePanel";
import { PlatFloatingBar, type PlatSheetId } from "../chrome/PlatFloatingBar";
import { CoverageModeBanner } from "../chrome/CoverageModeBanner";
import { PlatSheetNotice } from "../chrome/PlatSheetNotice";
import type { CoverageMode } from "../chrome/coverage-mode-banner-copy";
import { LeadRecordListPanel, type LeadRecordApiClient } from "../leads";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Crosshair, MapPin } from "lucide-react";
import {
  DEFAULT_MIN_STRUCTURE_AGE_YEARS,
  formatAgingRoofHiddenDoorsChip,
} from "./aging-roof-layer-label";
import type { MapLibreMapCanvasProps } from "./map-libre-map-canvas-props";
import type { PublishedPropertyDrawerDetail } from "./PublishedPropertyDrawer";
import { MapSearchPropertyFiltersForm } from "./MapSearchPropertyFiltersForm";
import type { PropertyPermitDetail } from "./PropertyPermitLayerPanel";
import type { SearchInRadiusApiClient } from "./create-http-search-in-radius-api-client";
import type { PropertiesGetApiClient } from "./create-http-properties-get-api-client";
import type {
  AgentAskApiClient,
  AgentAskResult,
} from "./create-http-agent-ask-api-client";
import {
  buildMapCandidatesFromAgentCitations,
  mergeSearchInRadiusMapCandidates,
} from "./build-map-candidates-from-agent-citations";
import { RoofingOpportunityAgentPanel } from "./RoofingOpportunityAgentPanel";
import { usePublishedPropertyDetail } from "./use-published-property-detail";
import { usePropertiesGetCache } from "./use-properties-get-cache";
import { usePermitLayerCandidateSummaries } from "./use-permit-layer-candidate-summaries";
import type { SearchInRadiusCandidateListEmptyReason } from "./search-in-radius-candidate-list-empty-copy";
import {
  SEARCH_IN_RADIUS_QUERY_COLD_START_COPY,
  SEARCH_IN_RADIUS_QUERY_SLOW_THRESHOLD_MS,
  SEARCH_IN_RADIUS_QUERY_PENDING_COPY,
  resolveSearchInRadiusQueryErrorMessage,
} from "./search-in-radius-query-status-copy";
import { selectSearchInRadiusCandidatesForAgingRoofLayer } from "./select-search-in-radius-candidates-for-aging-roof-layer";
import { isStructureYearUnavailableOnSearchCandidates } from "./is-structure-year-unavailable-on-search-candidates";
import {
  resolveLongOpenPermitListChipLabelsByPropertyId,
  selectSearchInRadiusCandidatesForPermitLayer,
} from "./select-search-in-radius-candidates-for-permit-layer";
import { DEFAULT_MIN_OPEN_PERMIT_YEARS } from "./property-permit-layer-summary";
import { rankSearchInRadiusCandidatesByLeadScore } from "./rank-search-in-radius-candidates-by-lead-score";
import { RoofAgeLegend } from "./RoofAgeLegend";
import { SearchInRadiusDisplayCapNote } from "./SearchInRadiusDisplayCapNote";
import {
  capSearchInRadiusCandidatesForDisplay,
  DEFAULT_SEARCH_IN_RADIUS_DISPLAY_CAP,
  formatSearchInRadiusCandidateCountCopy,
} from "./search-in-radius-display-cap";
import { selectSearchInRadiusCandidatesForPinRadius } from "./select-search-in-radius-candidates-for-pin-radius";
import { shouldCommitSearchRadiusFromSliderReason } from "./should-commit-search-radius-from-slider-reason";
import {
  SearchInRadiusCandidateList,
  type SearchInRadiusCandidate,
} from "./SearchInRadiusCandidateList";
import { MapSearchShellWorkspace } from "./MapSearchShellWorkspace";
import {
  SEARCH_PIN_HUD_HANDLE_ARIA_LABEL,
  SEARCH_PIN_WELCOME_BODY,
  SEARCH_PIN_WELCOME_HEADING,
} from "./search-pin-welcome-copy";
import { beginSearchPinDrag, endSearchPinDrag } from "./search-pin-drag";
import { usePublishedPropertyLeadConversion } from "./use-published-property-lead-conversion";
import { buildLeadMarkerStateByPropertyId } from "./plat-roof-marker-lead-state";
import {
  DEFAULT_SEARCH_RADIUS_MILES,
  resolveSearchMapCenterForCountyKey,
  type SearchMapCenter,
} from "./search-map-center";
import { MapFirstRunTour } from "./MapFirstRunTour";
import { RadarReadinessMeter } from "./RadarReadinessMeter";
import { useSearchInRadiusRadarWarmup } from "./use-search-in-radius-radar-warmup";

/**
 * Props for the map search shell (pin, GPS, radius controls + map canvas).
 *
 * `MapLibreMapCanvasComponent` is required so design tests can inject a stub
 * without importing MapLibre GL (jsdom has no WebGL / createObjectURL worker).
 */
export interface MapSearchShellProps {
  /** Catalog county currently searched — drives the pin and search.inRadius county. */
  defaultCountyKey: string;
  /** Map canvas implementation (real MapLibre in production; stub in design tests). */
  MapLibreMapCanvasComponent: ComponentType<MapLibreMapCanvasProps>;
  /**
   * Published permit rows for the long-open roofing layer.
   *
   * Defaults to `[]` (Lee honest empty) until radius search + properties.get
   * attach live consolidated permits.
   */
  propertyPermitDetails?: PropertyPermitDetail[];
  /**
   * Optional injected permit rows keyed by propertyId for permit-layer design tests.
   */
  propertyPermitDetailsByPropertyId?: Record<string, PropertyPermitDetail[]>;
  /**
   * Radius-search parcel candidates (list + map markers).
   *
   * Defaults to `[]` — empty is valid; markers are never seeded from fixtures.
   */
  searchInRadiusCandidates?: SearchInRadiusCandidate[];
  /**
   * Optional `properties.get`-shaped details keyed by propertyId.
   *
   * When absent, the drawer still opens from the list row (address_street) with
   * BBB hidden until a real contractor profile is supplied.
   */
  publishedPropertyDrawerDetailsByPropertyId?: Record<
    string,
    PublishedPropertyDrawerDetail
  >;
  /**
   * LeadRecord API client (leads.create / leads.list).
   *
   * When omitted, Convert is hidden and the Leads panel stays empty.
   */
  leadRecordApiClient?: LeadRecordApiClient;
  /**
   * Optional note when the leads list is session-scoped (shown in the leads sheet).
   */
  leadsListPersistenceNote?: string | null;
  /**
   * Whether pin/radius are backed by live search.inRadius.
   *
   * False until the SPA calls the API — empty list then says search is not connected.
   */
  liveRadiusSearchConnected?: boolean;
  /**
   * Optional live `search.inRadius` client (local tRPC or hosted API).
   *
   * When set, pin/radius changes refetch candidates instead of using the
   * injected corpus.
   */
  searchInRadiusApiClient?: SearchInRadiusApiClient;
  /**
   * Optional live `properties.get` client for drawer permit and BBB detail.
   */
  propertiesGetApiClient?: PropertiesGetApiClient;
  /**
   * Optional live `agent.ask` client for the roofing opportunity panel.
   */
  agentAskApiClient?: AgentAskApiClient;
  /**
   * Coverage honesty for the selected county.
   *
   * Lee fallback stamps above the search-filters HUD. Chester and Montgomery
   * clarify the doors-sheet title. Omitted or null: neither.
   */
  coverageMode?: CoverageMode | null;
  /**
   * Whether radius search may run for the selected catalog county.
   *
   * Overlay-only rows stay listed and recenter the pin without a live walk.
   */
  mapSearchReady?: boolean;
  /**
   * Returns the operator to a map-ready county when the selected row is overlay-only.
   */
  onSwitchToMapReadyCounty?: () => void;
}

/**
 * Map search shell: pin/GPS/radius controls, candidate list, drawer, and leads.
 */
export function MapSearchShell({
  defaultCountyKey,
  MapLibreMapCanvasComponent,
  propertyPermitDetails = [],
  propertyPermitDetailsByPropertyId,
  searchInRadiusCandidates = [],
  publishedPropertyDrawerDetailsByPropertyId,
  leadRecordApiClient,
  leadsListPersistenceNote = null,
  liveRadiusSearchConnected = true,
  searchInRadiusApiClient,
  propertiesGetApiClient,
  agentAskApiClient,
  coverageMode = null,
  mapSearchReady = true,
  onSwitchToMapReadyCounty,
}: MapSearchShellProps): JSX.Element {
  const [searchMapCenter, setSearchMapCenter] = useState<SearchMapCenter | null>(null);
  const [searchRadiusMiles, setSearchRadiusMiles] = useState(
    DEFAULT_SEARCH_RADIUS_MILES,
  );
  const [committedSearchRadiusMiles, setCommittedSearchRadiusMiles] = useState(
    DEFAULT_SEARCH_RADIUS_MILES,
  );
  const [agingRoofLayerEnabled, setAgingRoofLayerEnabled] = useState(true);
  const [platSheet, setPlatSheet] = useState<PlatSheetId | null>(null);
  const [renderedSheet, setRenderedSheet] = useState<PlatSheetId>("doors");
  const platSheetRef = useRef<HTMLElement>(null);
  const platSheetRisePx = usePlatSheetRisePx({
    sheetOpen: platSheet !== null,
    sheetRef: platSheetRef,
    renderedSheet,
  });
  const [radiusHudOpen, setRadiusHudOpen] = useState(false);
  const [filterHudOpen, setFilterHudOpen] = useState(false);
  const [minStructureAgeYears, setMinStructureAgeYears] = useState(
    DEFAULT_MIN_STRUCTURE_AGE_YEARS,
  );
  const [minOpenPermitYears, setMinOpenPermitYears] = useState(
    DEFAULT_MIN_OPEN_PERMIT_YEARS,
  );
  const [searchInRadiusDisplayCap, setSearchInRadiusDisplayCap] = useState(
    DEFAULT_SEARCH_IN_RADIUS_DISPLAY_CAP,
  );
  const [propertyPermitLayerEnabled, setPropertyPermitLayerEnabled] = useState(false);
  const [gpsStatusMessage, setGpsStatusMessage] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [agentCitationMapCandidates, setAgentCitationMapCandidates] = useState<
    SearchInRadiusCandidate[]
  >([]);
  const [agingRoofFilterHidSelectionMessage, setAgingRoofFilterHidSelectionMessage] =
    useState<string | null>(null);
  const [
    permitLayerFilterHidSelectionMessage,
    setPermitLayerFilterHidSelectionMessage,
  ] = useState<string | null>(null);
  const [fetchedSearchInRadiusCandidates, setFetchedSearchInRadiusCandidates] =
    useState<SearchInRadiusCandidate[]>([]);
  const [searchInRadiusQueryErrorMessage, setSearchInRadiusQueryErrorMessage] =
    useState<string | null>(null);
  const [searchInRadiusQueryPending, setSearchInRadiusQueryPending] = useState(false);
  const [searchInRadiusQuerySlow, setSearchInRadiusQuerySlow] = useState(false);
  const [mapCameraRecenterGeneration, setMapCameraRecenterGeneration] = useState(0);
  const [radiusCircleBloomToken, setRadiusCircleBloomToken] = useState(0);
  const pinHudHandleRef = useRef<HTMLButtonElement>(null);
  const radiusChipRef = useRef<HTMLButtonElement>(null);
  const doorsHeadingRef = useRef<HTMLHeadingElement>(null);

  const warmupCountyCenter = useMemo(
    () => resolveSearchMapCenterForCountyKey(defaultCountyKey),
    [defaultCountyKey],
  );
  const searchInRadiusWarmupInput = useMemo(
    () =>
      searchInRadiusApiClient === undefined || mapSearchReady === false
        ? null
        : {
            county: defaultCountyKey,
            center: {
              lat: warmupCountyCenter.latitude,
              lng: warmupCountyCenter.longitude,
            },
            radiusMiles: DEFAULT_SEARCH_RADIUS_MILES,
          },
    [defaultCountyKey, mapSearchReady, searchInRadiusApiClient, warmupCountyCenter],
  );
  const radarWarmup = useSearchInRadiusRadarWarmup({
    searchInRadiusApiClient,
    warmupInput: searchInRadiusWarmupInput,
  });

  useEffect(() => {
    setSearchMapCenter(null);
    setMapCameraRecenterGeneration((generation) => generation + 1);
    setSelectedPropertyId(null);
    setGpsStatusMessage(null);
    setPlatSheet(null);
  }, [defaultCountyKey]);

  useEffect(() => {
    if (platSheet !== null) {
      setRenderedSheet(platSheet);
    }
  }, [platSheet]);

  useEffect(() => {
    if (!searchInRadiusQueryPending) {
      setSearchInRadiusQuerySlow(false);
      return;
    }
    const slowTimeoutId = window.setTimeout(() => {
      setSearchInRadiusQuerySlow(true);
    }, SEARCH_IN_RADIUS_QUERY_SLOW_THRESHOLD_MS);
    return () => {
      window.clearTimeout(slowTimeoutId);
    };
  }, [searchInRadiusQueryPending]);

  const resolvedSearchInRadiusQueryErrorMessage =
    searchInRadiusQueryErrorMessage === null
      ? null
      : resolveSearchInRadiusQueryErrorMessage(searchInRadiusQueryErrorMessage);

  useEffect(() => {
    if (searchMapCenter === null) {
      setSearchInRadiusQueryPending(false);
      setFetchedSearchInRadiusCandidates([]);
      setSearchInRadiusQueryErrorMessage(null);
      return;
    }
    if (searchInRadiusApiClient === undefined || mapSearchReady === false) {
      setSearchInRadiusQueryPending(false);
      if (mapSearchReady === false) {
        setFetchedSearchInRadiusCandidates([]);
        setSearchInRadiusQueryErrorMessage(null);
      }
      return;
    }
    if (!radarWarmup.searchGateOpen) {
      setSearchInRadiusQueryPending(false);
      return;
    }

    let cancelled = false;
    setSearchInRadiusQueryPending(true);
    setSearchInRadiusQueryErrorMessage(null);
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const startedAtMs = Date.now();
        try {
          const candidates = await searchInRadiusApiClient.searchInRadius({
            county: defaultCountyKey,
            center: {
              lat: searchMapCenter.latitude,
              lng: searchMapCenter.longitude,
            },
            radiusMiles: committedSearchRadiusMiles,
            // Elephant MCP hard-caps queryProperties at 1000 rows; ask for the
            // full ceiling so dense areas render every parcel in the circle
            // instead of a nearest-N blob at the pin.
            limit: 1000,
          });
          if (!cancelled) {
            setFetchedSearchInRadiusCandidates(candidates);
            setSearchInRadiusQueryErrorMessage(null);
          }
        } catch (error) {
          if (!cancelled) {
            console.error("search.inRadius failed", {
              county: defaultCountyKey,
              radiusMiles: committedSearchRadiusMiles,
              durationMs: Date.now() - startedAtMs,
              error,
            });
            setSearchInRadiusQueryErrorMessage(
              error instanceof Error ? error.message : "Radius search failed.",
            );
          }
        } finally {
          if (!cancelled) {
            setSearchInRadiusQueryPending(false);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    defaultCountyKey,
    mapSearchReady,
    radarWarmup.searchGateOpen,
    searchInRadiusApiClient,
    searchMapCenter,
    committedSearchRadiusMiles,
  ]);

  const searchInRadiusCandidateCorpus =
    searchInRadiusApiClient === undefined
      ? searchInRadiusCandidates
      : fetchedSearchInRadiusCandidates;

  const searchInRadiusCandidatesInsidePinRadius = useMemo(
    () =>
      searchMapCenter === null
        ? []
        : selectSearchInRadiusCandidatesForPinRadius({
            searchInRadiusCandidates: searchInRadiusCandidateCorpus,
            searchMapCenter,
            searchRadiusMiles,
          }),
    [searchInRadiusCandidateCorpus, searchMapCenter, searchRadiusMiles],
  );

  const mapViewCenter =
    searchMapCenter ?? resolveSearchMapCenterForCountyKey(defaultCountyKey);

  const propertiesGetCache = usePropertiesGetCache({
    defaultCountyKey,
    propertiesGetApiClient,
  });

  const structureYearUnavailableOnTable = useMemo(
    () =>
      isStructureYearUnavailableOnSearchCandidates(
        searchInRadiusCandidatesInsidePinRadius,
      ),
    [searchInRadiusCandidatesInsidePinRadius],
  );

  const agingFilteredSearchInRadiusCandidates = useMemo(
    () =>
      selectSearchInRadiusCandidatesForAgingRoofLayer({
        searchInRadiusCandidates: searchInRadiusCandidatesInsidePinRadius,
        agingRoofLayerEnabled,
        minStructureAgeYears,
        currentUtcYear: new Date().getUTCFullYear(),
        structureYearUnavailableOnTable,
      }),
    [
      agingRoofLayerEnabled,
      minStructureAgeYears,
      searchInRadiusCandidatesInsidePinRadius,
      structureYearUnavailableOnTable,
    ],
  );

  const { permitDetailsByPropertyId, permitLayerScanPending } =
    usePermitLayerCandidateSummaries({
      propertyPermitLayerEnabled,
      searchInRadiusCandidates: agingFilteredSearchInRadiusCandidates,
      propertiesGetCache,
      injectedPermitDetailsByPropertyId: propertyPermitDetailsByPropertyId,
    });

  const visibleSearchInRadiusCandidates = useMemo(
    () =>
      rankSearchInRadiusCandidatesByLeadScore({
        searchInRadiusCandidates: selectSearchInRadiusCandidatesForPermitLayer({
          searchInRadiusCandidates: agingFilteredSearchInRadiusCandidates,
          propertyPermitLayerEnabled,
          permitDetailsByPropertyId,
          minOpenPermitYears,
        }),
        permitDetailsByPropertyId,
        minStructureAgeYears,
        minOpenPermitYears,
      }),
    [
      agingFilteredSearchInRadiusCandidates,
      minOpenPermitYears,
      minStructureAgeYears,
      permitDetailsByPropertyId,
      propertyPermitLayerEnabled,
    ],
  );

  const displayedSearchInRadiusCandidates = useMemo(
    () =>
      capSearchInRadiusCandidatesForDisplay({
        searchInRadiusCandidates: visibleSearchInRadiusCandidates,
        displayCap: searchInRadiusDisplayCap,
      }),
    [searchInRadiusDisplayCap, visibleSearchInRadiusCandidates],
  );

  const mapSearchInRadiusCandidates = useMemo(
    () =>
      mergeSearchInRadiusMapCandidates(
        displayedSearchInRadiusCandidates,
        agentCitationMapCandidates,
      ),
    [agentCitationMapCandidates, displayedSearchInRadiusCandidates],
  );

  const drawerSearchInRadiusCandidates = useMemo(
    () =>
      mergeSearchInRadiusMapCandidates(
        searchInRadiusCandidatesInsidePinRadius,
        agentCitationMapCandidates,
      ),
    [agentCitationMapCandidates, searchInRadiusCandidatesInsidePinRadius],
  );

  const agentCitationPropertyIds = useMemo(
    () => new Set(agentCitationMapCandidates.map((candidate) => candidate.propertyId)),
    [agentCitationMapCandidates],
  );

  const longOpenPermitChipLabelByPropertyId = useMemo(
    () =>
      resolveLongOpenPermitListChipLabelsByPropertyId({
        searchInRadiusCandidates: agingFilteredSearchInRadiusCandidates,
        permitDetailsByPropertyId,
        minOpenPermitYears,
      }),
    [
      agingFilteredSearchInRadiusCandidates,
      minOpenPermitYears,
      permitDetailsByPropertyId,
    ],
  );

  const publishedPropertyDrawerDetailFromHook = usePublishedPropertyDetail({
    selectedPropertyId,
    searchInRadiusCandidates: drawerSearchInRadiusCandidates,
    publishedPropertyDrawerDetailsByPropertyId,
    propertyPermitDetails,
    propertiesGetCache:
      propertiesGetApiClient === undefined ? undefined : propertiesGetCache,
    minOpenPermitYears,
  });

  const {
    publishedPropertyDrawerDetail,
    propertyPermitDetails: resolvedPropertyPermitDetails,
    permitDetailsSource,
    publishedPropertyDetailPending,
    publishedPropertyDetailErrorMessage,
    selectedConvertiblePermitIds,
  } = publishedPropertyDrawerDetailFromHook;

  const {
    leadRecords,
    archivedLeadRecords,
    leadRecordListStatusMessage,
    convertPublishedPropertyToLeadPending,
    convertPublishedPropertyToLeadStatusMessage,
    leadLandedPulseToken,
    handleConvertPublishedPropertyToLead,
    handlePublishedPropertyDrawerClose,
    handleArchiveLeadRecord,
    archiveLeadRecordPendingLeadId,
    handleUpdateLeadRecord,
    updateLeadRecordPendingLeadId,
  } = usePublishedPropertyLeadConversion({
    defaultCountyKey,
    leadRecordApiClient,
    selectedPropertyId,
    setSelectedPropertyId,
    selectedAddressStreet: publishedPropertyDrawerDetail?.addressStreet ?? null,
    selectedPermitIds: selectedConvertiblePermitIds,
  });

  const leadMarkerStateByPropertyId = useMemo(
    () =>
      buildLeadMarkerStateByPropertyId({
        activeLeadRecords: leadRecords,
        archivedLeadRecords,
      }),
    [archivedLeadRecords, leadRecords],
  );

  const handleSearchMapCenterDrop = useCallback(
    (center: SearchMapCenter) => {
      setSearchMapCenter(center);
      setMapCameraRecenterGeneration((generation) => generation + 1);
      setGpsStatusMessage(null);
      setPlatSheet("doors");
      if (radarWarmup.searchGateOpen) {
        setRadiusCircleBloomToken((token) => token + 1);
      }
    },
    [radarWarmup.searchGateOpen],
  );

  useEffect(() => {
    if (radarWarmup.searchGateOpen && searchMapCenter !== null) {
      setRadiusCircleBloomToken((token) => token + 1);
    }
  }, [radarWarmup.searchGateOpen]);

  const handleSearchInRadiusCandidateSelect = useCallback((propertyId: string) => {
    setSelectedPropertyId(propertyId);
    setAgingRoofFilterHidSelectionMessage(null);
    setPermitLayerFilterHidSelectionMessage(null);
  }, []);

  const handleAgentAskResult = useCallback(
    (result: AgentAskResult | null) => {
      if (result === null || !result.indexed || result.citations.length === 0) {
        setAgentCitationMapCandidates([]);
        return;
      }
      setAgentCitationMapCandidates(
        buildMapCandidatesFromAgentCitations(result.citations, searchMapCenter),
      );
    },
    [searchMapCenter],
  );

  const handleLeadRecordSelect = useCallback((propertyId: string) => {
    setSelectedPropertyId(propertyId);
    setAgingRoofFilterHidSelectionMessage(null);
    setPermitLayerFilterHidSelectionMessage(null);
  }, []);

  useEffect(() => {
    if (selectedPropertyId === null) {
      return;
    }
    const stillVisible = visibleSearchInRadiusCandidates.some(
      (candidate) => candidate.propertyId === selectedPropertyId,
    );
    if (stillVisible) {
      return;
    }
    if (agentCitationPropertyIds.has(selectedPropertyId)) {
      return;
    }
    const selectedIsActiveLead = leadRecords.some(
      (leadRecord) =>
        leadRecord.propertyId === selectedPropertyId &&
        leadRecord.status !== "archived",
    );
    if (selectedIsActiveLead) {
      return;
    }
    const stillInsidePinRadius = searchInRadiusCandidatesInsidePinRadius.some(
      (candidate) => candidate.propertyId === selectedPropertyId,
    );
    if (stillInsidePinRadius) {
      const hiddenByAgingRoof =
        agingRoofLayerEnabled &&
        !agingFilteredSearchInRadiusCandidates.some(
          (candidate) => candidate.propertyId === selectedPropertyId,
        );
      if (hiddenByAgingRoof) {
        setAgingRoofFilterHidSelectionMessage(
          "That property is hidden by the structure-year filter. Turn the filter off to see it again.",
        );
        return;
      }
      if (
        propertyPermitLayerEnabled &&
        agingFilteredSearchInRadiusCandidates.some(
          (candidate) => candidate.propertyId === selectedPropertyId,
        )
      ) {
        setPermitLayerFilterHidSelectionMessage(
          "That property is hidden by the long-open permit layer. Turn the layer off to see it again.",
        );
        return;
      }
    }
    setSelectedPropertyId(null);
  }, [
    agingFilteredSearchInRadiusCandidates,
    agingRoofLayerEnabled,
    agentCitationPropertyIds,
    leadRecords,
    propertyPermitLayerEnabled,
    searchInRadiusCandidatesInsidePinRadius,
    selectedPropertyId,
    visibleSearchInRadiusCandidates,
  ]);

  const handleRecenterSearchMapOnCounty = useCallback(() => {
    const countyCenter = resolveSearchMapCenterForCountyKey(defaultCountyKey);
    const hadSearchMapCenter = searchMapCenter !== null;
    // Recenter always lands a pin at the county seat — a first click must not
    // be a dead button when no pin exists yet.
    setSearchMapCenter(countyCenter);
    setMapCameraRecenterGeneration((generation) => generation + 1);
    setGpsStatusMessage(null);
    if (!hadSearchMapCenter) {
      setPlatSheet("doors");
    }
  }, [defaultCountyKey, searchMapCenter]);

  const handleUseMyLocation = useCallback(() => {
    if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
      setGpsStatusMessage("Location is not available in this browser.");
      return;
    }

    setGpsStatusMessage("Locating…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSearchMapCenter({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setPlatSheet("doors");
        setGpsStatusMessage("Using your location. Click the map to move the pin.");
      },
      () => {
        setGpsStatusMessage("Could not read GPS. Drop a pin on the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  const agingRoofHiddenDoorsCount =
    agingRoofLayerEnabled && !structureYearUnavailableOnTable
      ? searchInRadiusCandidatesInsidePinRadius.length -
        agingFilteredSearchInRadiusCandidates.length
      : 0;

  const permitLayerHiddenDoorsCount = propertyPermitLayerEnabled
    ? agingFilteredSearchInRadiusCandidates.length -
      visibleSearchInRadiusCandidates.length
    : 0;

  const candidateListEmptyReason = resolveCandidateListEmptyReason({
    mapSearchReady,
    pinDropped: searchMapCenter !== null,
    liveRadiusSearchConnected: liveRadiusSearchConnected && mapSearchReady,
    searchInRadiusQueryFailed: resolvedSearchInRadiusQueryErrorMessage !== null,
    unfilteredCount: searchInRadiusCandidatesInsidePinRadius.length,
    agingFilteredCount: agingFilteredSearchInRadiusCandidates.length,
    visibleCount: visibleSearchInRadiusCandidates.length,
    agingRoofLayerEnabled,
    propertyPermitLayerEnabled,
    structureYearUnavailableOnTable,
  });

  const showDoorsSheetSearchPending =
    searchInRadiusApiClient !== undefined && searchInRadiusQueryPending;
  const doorsSheetWaitingForRadar =
    searchMapCenter !== null &&
    searchInRadiusApiClient !== undefined &&
    !radarWarmup.searchGateOpen;
  const doorsSheetAwaitingRadiusResults =
    (showDoorsSheetSearchPending || doorsSheetWaitingForRadar) &&
    searchInRadiusCandidatesInsidePinRadius.length === 0;
  const showSearchRadiusCircleOnMap =
    searchMapCenter !== null && radarWarmup.showSearchRadiusCircle;

  const selectedPropertyAlreadyConvertedToLead =
    selectedPropertyId !== null &&
    leadRecords.some(
      (leadRecord) =>
        leadRecord.propertyId === selectedPropertyId &&
        leadRecord.status !== "archived",
    );

  return (
    <section
      className="relative flex h-full min-h-full flex-col"
      aria-label="Map search"
    >
      <MapSearchShellWorkspace
        MapLibreMapCanvasComponent={MapLibreMapCanvasComponent}
        searchMapCenter={searchMapCenter}
        mapViewCenter={mapViewCenter}
        searchRadiusMiles={searchRadiusMiles}
        onSearchMapCenterDrop={handleSearchMapCenterDrop}
        mapCameraRecenterGeneration={mapCameraRecenterGeneration}
        searchInRadiusCandidates={mapSearchInRadiusCandidates}
        selectedPropertyId={selectedPropertyId}
        onSearchInRadiusCandidateSelect={handleSearchInRadiusCandidateSelect}
        leadMarkerStateByPropertyId={leadMarkerStateByPropertyId}
        publishedPropertyDrawerDetail={publishedPropertyDrawerDetail}
        onPublishedPropertyDrawerClose={handlePublishedPropertyDrawerClose}
        onConvertPublishedPropertyToLead={
          leadRecordApiClient !== undefined
            ? handleConvertPublishedPropertyToLead
            : undefined
        }
        convertPublishedPropertyToLeadPending={convertPublishedPropertyToLeadPending}
        convertPublishedPropertyToLeadStatusMessage={
          convertPublishedPropertyToLeadStatusMessage
        }
        selectedPropertyAlreadyConvertedToLead={selectedPropertyAlreadyConvertedToLead}
        showPermitNotes={
          propertyPermitLayerEnabled ||
          propertiesGetApiClient !== undefined ||
          resolvedPropertyPermitDetails.length > 0
        }
        propertyPermitDetails={resolvedPropertyPermitDetails}
        permitDetailsSource={permitDetailsSource}
        publishedPropertyDetailPending={publishedPropertyDetailPending}
        publishedPropertyDetailErrorMessage={publishedPropertyDetailErrorMessage}
        showSearchRadiusCircle={showSearchRadiusCircleOnMap}
        radiusCircleBloomToken={radiusCircleBloomToken}
      />

      <MapFirstRunTour
        anchorRefs={{
          pinHandle: pinHudHandleRef,
          radiusChip: radiusChipRef,
          doorsHeading: doorsHeadingRef,
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={
          {
            "--plat-sheet-rise": `${platSheetRisePx}px`,
          } as CSSProperties
        }
      >
        <div
          className={cn(
            "plat-hud-shift absolute left-3 flex max-w-[min(22rem,calc(100%-5.5rem))] flex-col items-start gap-1",
            platSheet === null
              ? "bottom-4"
              : "bottom-[calc(var(--plat-sheet-rise,0px)+0.75rem)] md:bottom-4",
          )}
        >
          {coverageMode === "lee_dev_fallback" ? (
            <CoverageModeBanner coverageMode="lee_dev_fallback" placement="stamp" />
          ) : null}
          {searchMapCenter === null ? (
            <div
              className="pointer-events-auto max-w-[min(17rem,calc(100vw-6.5rem))] rounded-sm border border-foreground/50 bg-[color:var(--color-card)]/95 bg-[url('/plat/linen-tooth.png')] bg-repeat p-3"
              data-testid="map-search-pin-welcome"
            >
              <p className="font-heading text-sm font-semibold tracking-wide">
                {SEARCH_PIN_WELCOME_HEADING}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                {SEARCH_PIN_WELCOME_BODY}
              </p>
            </div>
          ) : null}
          <RadarReadinessMeter
            phase={radarWarmup.phase}
            progressPercent={radarWarmup.progressPercent}
            pinDropped={searchMapCenter !== null}
          />
          <div
            className={cn(
              "flex flex-col gap-1",
              searchMapCenter !== null && "w-fit max-w-[min(17rem,calc(100vw-6.5rem))]",
            )}
          >
            {searchMapCenter !== null ? (
              <RoofAgeLegend className="pointer-events-auto w-full" />
            ) : null}
            <div
              className={cn(
                "pointer-events-auto flex flex-col gap-2 overflow-hidden rounded-sm border border-foreground/50 bg-[color:var(--color-card)]/95 bg-[url('/plat/linen-tooth.png')] bg-repeat p-2.5 plat-hud-surface",
                searchMapCenter !== null
                  ? "w-full"
                  : (radiusHudOpen || filterHudOpen) &&
                      "w-[min(17rem,calc(100vw-6.5rem))]",
              )}
              role="group"
              aria-label="Search filters"
            >
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    ref={radiusChipRef}
                    className="rounded-sm font-heading tabular-nums focus-visible:border-foreground focus-visible:ring-foreground/20 aria-expanded:border-foreground aria-expanded:bg-foreground aria-expanded:text-[color:var(--color-card)] hover:aria-expanded:bg-foreground hover:aria-expanded:text-[color:var(--color-card)]"
                    aria-expanded={radiusHudOpen}
                    data-testid="map-search-radius-chip"
                    onClick={() => {
                      setRadiusHudOpen((open) => !open);
                    }}
                  >
                    {searchRadiusMiles} mi
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-xs"
                    className="rounded-sm"
                    onClick={handleRecenterSearchMapOnCounty}
                    aria-label="Center map on selected county"
                    data-testid="recenter-search-map-on-county"
                  >
                    <Crosshair />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    className="rounded-sm"
                    onClick={handleUseMyLocation}
                    aria-label="Use my location"
                  >
                    GPS
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="rounded-sm font-heading focus-visible:border-foreground focus-visible:ring-foreground/20 aria-expanded:border-foreground aria-expanded:bg-foreground aria-expanded:text-[color:var(--color-card)] hover:aria-expanded:bg-foreground hover:aria-expanded:text-[color:var(--color-card)]"
                    aria-expanded={filterHudOpen}
                    data-testid="map-search-filter-hud-toggle"
                    onClick={() => {
                      setFilterHudOpen((open) => !open);
                    }}
                  >
                    Filter
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    ref={pinHudHandleRef}
                    draggable
                    aria-label={SEARCH_PIN_HUD_HANDLE_ARIA_LABEL}
                    data-testid="map-search-pin-hud-handle"
                    className={cn(
                      "rounded-sm cursor-grab active:cursor-grabbing focus-visible:border-foreground focus-visible:ring-foreground/20",
                      searchMapCenter !== null &&
                        "border-foreground bg-foreground text-[color:var(--color-card)] hover:bg-foreground hover:text-[color:var(--color-card)]",
                    )}
                    onDragStart={(event) => {
                      beginSearchPinDrag(event.dataTransfer, event.currentTarget);
                    }}
                    onDragEnd={() => {
                      endSearchPinDrag();
                    }}
                  >
                    <MapPin />
                  </Button>
                </div>
                <div
                  className="plat-radius-reveal"
                  data-open={radiusHudOpen ? "true" : "false"}
                >
                  <div>
                    <Label id="search-radius-label" className="sr-only">
                      Search radius (miles)
                    </Label>
                    <Slider
                      className="plat-radius-slider w-full"
                      min={1}
                      max={25}
                      step={1}
                      value={[searchRadiusMiles]}
                      onValueChange={(value, eventDetails) => {
                        const next = Array.isArray(value) ? value[0] : value;
                        if (typeof next !== "number") {
                          return;
                        }
                        setSearchRadiusMiles(next);
                        if (
                          shouldCommitSearchRadiusFromSliderReason(eventDetails.reason)
                        ) {
                          setCommittedSearchRadiusMiles(next);
                        }
                      }}
                      onValueCommitted={(value) => {
                        const next = Array.isArray(value) ? value[0] : value;
                        if (typeof next === "number") {
                          setCommittedSearchRadiusMiles(next);
                        }
                      }}
                      aria-labelledby="search-radius-label"
                      aria-valuetext={`${searchRadiusMiles} miles`}
                    />
                  </div>
                </div>
                <div
                  className="plat-radius-reveal"
                  data-open={filterHudOpen ? "true" : "false"}
                >
                  <div>
                    <MapSearchPropertyFiltersForm
                      agingRoofLayerEnabled={agingRoofLayerEnabled}
                      minStructureAgeYears={minStructureAgeYears}
                      propertyPermitLayerEnabled={propertyPermitLayerEnabled}
                      minOpenPermitYears={minOpenPermitYears}
                      structureYearUnavailableOnTable={structureYearUnavailableOnTable}
                      permitLayerScanPending={permitLayerScanPending}
                      onAgingRoofLayerEnabledChange={(enabled) => {
                        setAgingRoofLayerEnabled(enabled);
                        setAgingRoofFilterHidSelectionMessage(null);
                      }}
                      onMinStructureAgeYearsChange={setMinStructureAgeYears}
                      onPropertyPermitLayerEnabledChange={(enabled) => {
                        setPropertyPermitLayerEnabled(enabled);
                        setPermitLayerFilterHidSelectionMessage(null);
                      }}
                      onMinOpenPermitYearsChange={setMinOpenPermitYears}
                      searchInRadiusDisplayCap={searchInRadiusDisplayCap}
                      onSearchInRadiusDisplayCapChange={setSearchInRadiusDisplayCap}
                    />
                  </div>
                </div>
              </div>
              <p className="sr-only" data-testid="search-map-center" aria-live="polite">
                {searchMapCenter === null
                  ? "No pin"
                  : `${searchMapCenter.latitude.toFixed(4)}, ${searchMapCenter.longitude.toFixed(4)}`}
              </p>
              {gpsStatusMessage !== null ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {gpsStatusMessage}
                </p>
              ) : null}
              {searchInRadiusQueryPending && platSheet !== "doors" ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {SEARCH_IN_RADIUS_QUERY_PENDING_COPY}
                </p>
              ) : null}
              {resolvedSearchInRadiusQueryErrorMessage !== null &&
              platSheet !== "doors" ? (
                <p
                  className="text-xs text-destructive"
                  role="alert"
                  data-testid="search-in-radius-query-error"
                >
                  {resolvedSearchInRadiusQueryErrorMessage}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className={cn(
            "plat-hud-shift pointer-events-auto absolute z-30",
            platSheet === null
              ? "right-3 bottom-4"
              : "right-3 bottom-[calc(var(--plat-sheet-rise,0px)+0.75rem)] md:right-[min(38%,24rem)] md:bottom-4",
          )}
        >
          <PlatFloatingBar
            activeSheet={platSheet}
            onActiveSheetChange={setPlatSheet}
            leadLandedPulseToken={leadLandedPulseToken}
          />
        </div>

        <aside
          ref={platSheetRef}
          className={PLAT_SHEET_SURFACE_CLASS}
          {...platSheetDomProps(platSheet !== null)}
          aria-label={PLAT_SHEET_ARIA_LABEL[renderedSheet]}
        >
          <div
            className="flex min-h-0 flex-1 flex-col"
            hidden={renderedSheet !== "doors"}
          >
            <div className="border-b border-foreground/40 px-3 pt-2 pb-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <h2
                  ref={doorsHeadingRef}
                  className="font-heading text-lg font-bold tracking-wide uppercase"
                  data-testid="search-in-radius-doors-heading"
                >
                  Roofs in this radius
                </h2>
                <p
                  className="text-xs tabular-nums text-muted-foreground"
                  aria-live="polite"
                >
                  {doorsSheetAwaitingRadiusResults
                    ? `… in ${String(searchRadiusMiles)} mi`
                    : formatSearchInRadiusCandidateCountCopy({
                        displayedCount: displayedSearchInRadiusCandidates.length,
                        visibleCount: visibleSearchInRadiusCandidates.length,
                        searchRadiusMiles,
                      })}
                </p>
              </div>
              <div className="mt-0.5">
                <SearchInRadiusDisplayCapNote
                  displayCap={searchInRadiusDisplayCap}
                  onDisplayCapChange={setSearchInRadiusDisplayCap}
                />
              </div>
              {coverageMode !== null && coverageMode !== "lee_dev_fallback" ? (
                <CoverageModeBanner coverageMode={coverageMode} className="mt-0.5" />
              ) : null}
            </div>
            {agingRoofHiddenDoorsCount > 0 ||
            agingRoofFilterHidSelectionMessage !== null ||
            permitLayerHiddenDoorsCount > 0 ||
            permitLayerFilterHidSelectionMessage !== null ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-foreground/20 px-3 py-1">
                {agingRoofHiddenDoorsCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="rounded-sm"
                    data-testid="aging-roof-hidden-count"
                    aria-label={`Show ${formatAgingRoofHiddenDoorsChip(agingRoofHiddenDoorsCount)}`}
                    onClick={() => {
                      setAgingRoofLayerEnabled(false);
                      setAgingRoofFilterHidSelectionMessage(null);
                    }}
                  >
                    {formatAgingRoofHiddenDoorsChip(agingRoofHiddenDoorsCount)}
                  </Button>
                ) : null}
                {agingRoofFilterHidSelectionMessage !== null ? (
                  <span
                    className="sr-only"
                    role="status"
                    data-testid="aging-roof-filter-hid-selection"
                  >
                    {agingRoofFilterHidSelectionMessage}
                  </span>
                ) : null}
                {permitLayerHiddenDoorsCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="rounded-sm"
                    data-testid="permit-layer-hidden-count"
                    aria-label={`Show ${String(permitLayerHiddenDoorsCount)} hidden roofs`}
                    onClick={() => {
                      setPropertyPermitLayerEnabled(false);
                      setPermitLayerFilterHidSelectionMessage(null);
                    }}
                  >
                    {permitLayerHiddenDoorsCount} hidden by permit layer
                  </Button>
                ) : null}
                {permitLayerFilterHidSelectionMessage !== null ? (
                  <span
                    className="sr-only"
                    role="status"
                    data-testid="permit-layer-filter-hid-selection"
                  >
                    {permitLayerFilterHidSelectionMessage}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div
              className="min-h-0 flex-1 overflow-auto px-3 py-1"
              aria-busy={showDoorsSheetSearchPending}
            >
              {doorsSheetAwaitingRadiusResults ? (
                <div
                  className="flex flex-col gap-1 py-3"
                  role="status"
                  aria-live="polite"
                  data-testid="search-in-radius-query-pending"
                >
                  <p className="font-heading text-base font-bold tracking-wide uppercase">
                    {SEARCH_IN_RADIUS_QUERY_PENDING_COPY}
                  </p>
                  {searchInRadiusQuerySlow ? (
                    <p className="text-sm text-muted-foreground">
                      {SEARCH_IN_RADIUS_QUERY_COLD_START_COPY}
                    </p>
                  ) : null}
                  <PlatIndexPendingRows />
                </div>
              ) : null}
              {showDoorsSheetSearchPending && !doorsSheetAwaitingRadiusResults ? (
                <p
                  className="sr-only"
                  role="status"
                  aria-live="polite"
                  data-testid="search-in-radius-query-refreshing"
                >
                  {SEARCH_IN_RADIUS_QUERY_PENDING_COPY}
                </p>
              ) : null}
              {resolvedSearchInRadiusQueryErrorMessage !== null &&
              !showDoorsSheetSearchPending ? (
                <p
                  className="py-3 text-sm text-destructive"
                  role="alert"
                  data-testid="search-in-radius-doors-sheet-error"
                >
                  {resolvedSearchInRadiusQueryErrorMessage}
                </p>
              ) : null}
              {doorsSheetAwaitingRadiusResults ||
              resolvedSearchInRadiusQueryErrorMessage !== null ? null : (
                <SearchInRadiusCandidateList
                  searchInRadiusCandidates={displayedSearchInRadiusCandidates}
                  selectedPropertyId={selectedPropertyId}
                  onSearchInRadiusCandidateSelect={handleSearchInRadiusCandidateSelect}
                  emptyReason={candidateListEmptyReason}
                  longOpenPermitChipLabelByPropertyId={
                    longOpenPermitChipLabelByPropertyId
                  }
                  onSwitchToMapReadyCounty={onSwitchToMapReadyCounty}
                />
              )}
            </div>
          </div>

          <div
            className="flex min-h-0 flex-1 flex-col"
            hidden={renderedSheet !== "leads"}
          >
            <div className="border-b border-foreground/40 px-3 py-2">
              <h2 className="font-heading text-lg font-bold tracking-wide uppercase">
                Leads list
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
              {leadsListPersistenceNote !== null &&
              leadsListPersistenceNote.length > 0 ? (
                <PlatSheetNotice testId="leads-list-persistence-note">
                  {leadsListPersistenceNote}
                </PlatSheetNotice>
              ) : null}
              <LeadRecordListPanel
                leadRecords={leadRecords}
                leadRecordListStatusMessage={leadRecordListStatusMessage}
                onLeadRecordSelect={handleLeadRecordSelect}
                onUpdateLeadRecord={
                  leadRecordApiClient !== undefined ? handleUpdateLeadRecord : undefined
                }
                updateLeadRecordPendingLeadId={updateLeadRecordPendingLeadId}
                onArchiveLeadRecord={
                  leadRecordApiClient !== undefined
                    ? handleArchiveLeadRecord
                    : undefined
                }
                archiveLeadRecordPendingLeadId={archiveLeadRecordPendingLeadId}
              />
            </div>
          </div>

          <div
            className="flex min-h-0 flex-1 flex-col"
            hidden={renderedSheet !== "chat"}
          >
            <div className="border-b border-foreground/40 px-3 py-2">
              <h2 className="font-heading text-lg font-bold tracking-wide uppercase">
                RoofRadar AI
              </h2>
            </div>
            <RoofingOpportunityAgentPanel
              county={defaultCountyKey}
              center={{
                lat: mapViewCenter.latitude,
                lng: mapViewCenter.longitude,
              }}
              radiusMiles={searchRadiusMiles}
              mapSearchReady={mapSearchReady}
              agentAskApiClient={agentAskApiClient}
              selectedPropertyId={selectedPropertyId}
              onCitationPropertySelect={handleSearchInRadiusCandidateSelect}
              onAgentAskResult={handleAgentAskResult}
              onSwitchToMapReadyCounty={onSwitchToMapReadyCounty}
              onApplyStructuredSearchFallback={({
                minStructureAgeYears: agentMinStructureAgeYears,
                minOpenPermitYears: agentMinOpenPermitYears,
              }) => {
                if (agentMinStructureAgeYears !== undefined) {
                  setAgingRoofLayerEnabled(true);
                  setMinStructureAgeYears(agentMinStructureAgeYears);
                }
                if (agentMinOpenPermitYears !== undefined) {
                  setPropertyPermitLayerEnabled(true);
                  setMinOpenPermitYears(agentMinOpenPermitYears);
                }
              }}
            />
          </div>

          {DISABLED_CRM_NAV_SECTIONS.map((section) => (
            <div
              key={section.id}
              className="flex min-h-0 flex-1 flex-col"
              hidden={renderedSheet !== section.id}
            >
              <div className="border-b border-foreground/40 px-3 py-2">
                <h2 className="font-heading text-lg font-bold tracking-wide uppercase">
                  {section.label}
                </h2>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
                <PlatDeferredFeaturePanel section={section} />
              </div>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}

/**
 * Open plat sheets stay in the tree so close can slide; inert while off-map.
 */
function platSheetDomProps(isOpen: boolean): {
  "data-open": boolean;
  inert: boolean;
  "aria-hidden": boolean;
} {
  return {
    "data-open": isOpen,
    inert: !isOpen,
    "aria-hidden": !isOpen,
  };
}

/**
 * Mobile sheets size to their content, capped at 55%. HUD chrome parks just
 * above the live height instead of assuming the cap. Wide screens ignore this
 * and keep the HUD on the map floor.
 */
function usePlatSheetRisePx(arguments_: {
  sheetOpen: boolean;
  sheetRef: RefObject<HTMLElement | null>;
  renderedSheet: PlatSheetId;
}): number {
  const { sheetOpen, sheetRef, renderedSheet } = arguments_;
  const [risePx, setRisePx] = useState(0);

  useLayoutEffect(() => {
    if (!sheetOpen) {
      setRisePx(0);
      return;
    }

    const sheetElement = sheetRef.current;
    if (sheetElement === null) {
      setRisePx(0);
      return;
    }

    const syncRise = () => {
      setRisePx(sheetElement.getBoundingClientRect().height);
    };
    syncRise();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(syncRise);
    observer.observe(sheetElement);
    return () => {
      observer.disconnect();
    };
  }, [renderedSheet, sheetOpen, sheetRef]);

  return sheetOpen ? risePx : 0;
}

/**
 * Ink-rule placeholders for the roofs index while search.inRadius is in flight.
 */
function PlatIndexPendingRows(): JSX.Element {
  return (
    <div
      className="plat-index-pending mt-3"
      aria-hidden="true"
      data-testid="search-in-radius-query-pending-rules"
    >
      {["street", "mid", "far"].map((rowKey) => (
        <span className="plat-index-pending-row" key={rowKey}>
          <span className="plat-index-pending-rule plat-index-pending-rule--street" />
          <span className="plat-index-pending-rule plat-index-pending-rule--miles" />
          <span className="plat-index-pending-rule plat-index-pending-rule--meta" />
        </span>
      ))}
    </div>
  );
}

const PLAT_SHEET_SURFACE_CLASS =
  "plat-sheet pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex max-h-[55%] w-full flex-col border-t border-foreground/70 bg-[color:var(--color-card)] bg-[url('/plat/linen-tooth.png')] bg-repeat md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[min(38%,24rem)] md:border-t-0 md:border-l";

const PLAT_SHEET_ARIA_LABEL: Record<PlatSheetId, string> = {
  doors: "Roofs in this radius",
  leads: "Leads list",
  chat: "RoofRadar AI",
  inbox: "Inbox",
  reports: "Reports",
  campaigns: "Campaigns",
};

/**
 * Chooses empty-list copy: unwired search vs year filter vs true empty radius.
 */
function resolveCandidateListEmptyReason(arguments_: {
  mapSearchReady: boolean;
  pinDropped: boolean;
  liveRadiusSearchConnected: boolean;
  searchInRadiusQueryFailed: boolean;
  unfilteredCount: number;
  agingFilteredCount: number;
  visibleCount: number;
  agingRoofLayerEnabled: boolean;
  propertyPermitLayerEnabled: boolean;
  structureYearUnavailableOnTable?: boolean;
}): SearchInRadiusCandidateListEmptyReason {
  if (arguments_.mapSearchReady === false) {
    return "county_not_map_ready";
  }
  if (arguments_.pinDropped === false) {
    return "no_pin";
  }
  if (arguments_.visibleCount > 0) {
    return "no_radius_results";
  }
  if (arguments_.searchInRadiusQueryFailed && arguments_.unfilteredCount === 0) {
    return "search_failed";
  }
  if (arguments_.propertyPermitLayerEnabled && arguments_.agingFilteredCount > 0) {
    return "permit_layer_filter";
  }
  if (
    arguments_.agingRoofLayerEnabled &&
    arguments_.unfilteredCount > 0 &&
    arguments_.structureYearUnavailableOnTable !== true
  ) {
    return "aging_roof_filter";
  }
  if (!arguments_.liveRadiusSearchConnected && arguments_.unfilteredCount === 0) {
    return "search_not_connected";
  }
  return "no_radius_results";
}
