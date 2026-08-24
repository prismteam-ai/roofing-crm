/**
 * Map search shell: MapLibre pin/GPS/radius controls and search-center state.
 *
 * Design tests import `MapSearchShell` + props types only (no MapLibre GL in jsdom).
 * Production also imports `MapLibreMapCanvas` and wires it into the shell.
 */
export {
  LEE_FALLBACK_SEARCH_MAP_CENTER,
  DEFAULT_SEARCH_RADIUS_MILES,
  resolveInitialSearchMapCenter,
  resolveSearchMapCenterForCountyKey,
  type SearchMapCenter,
} from "./search-map-center";
export {
  DEFAULT_MIN_STRUCTURE_AGE_YEARS,
  formatAgingRoofHiddenDoorsChip,
  formatAgingRoofLayerLabel,
  resolveAgingRoofLayerLabel,
} from "./aging-roof-layer-label";
export type { MapLibreMapCanvasProps } from "./map-libre-map-canvas-props";
export {
  MapSearchPropertyFiltersForm,
  MIN_OPEN_PERMIT_YEARS_SLIDER_MAX,
  MIN_OPEN_PERMIT_YEARS_SLIDER_MIN,
  MIN_STRUCTURE_AGE_YEARS_SLIDER_MAX,
  MIN_STRUCTURE_AGE_YEARS_SLIDER_MIN,
  type MapSearchPropertyFiltersFormProps,
} from "./MapSearchPropertyFiltersForm";
export { MapSearchShell, type MapSearchShellProps } from "./MapSearchShell";
export {
  AgingRoofLayerControl,
  type AgingRoofLayerControlProps,
} from "./AgingRoofLayerControl";
export {
  PropertyPermitLayerControl,
  type PropertyPermitLayerControlProps,
} from "./PropertyPermitLayerControl";
export {
  PROPERTY_PERMIT_LAYER_EMPTY_COPY,
  PropertyPermitLayerPanel,
  formatPropertyPermitClosedDateLabel,
  formatPropertyPermitLayerRowCopy,
  formatPropertyPermitOpenDurationLabel,
  isRoofingPropertyPermitDetail,
  selectRoofingPropertyPermitDetails,
  type PropertyPermitDetail,
  type PropertyPermitLayerPanelProps,
} from "./PropertyPermitLayerPanel";
export {
  SEARCH_IN_RADIUS_CANDIDATE_LIST_AGING_FILTER_EMPTY_COPY,
  SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY,
  SEARCH_IN_RADIUS_CANDIDATE_LIST_PERMIT_FILTER_EMPTY_COPY,
  SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_NOT_CONNECTED_COPY,
  SearchInRadiusCandidateList,
  type SearchInRadiusCandidate,
  type SearchInRadiusCandidateListEmptyReason,
  type SearchInRadiusCandidateListProps,
} from "./SearchInRadiusCandidateList";
export {
  CONVERT_PUBLISHED_PROPERTY_ALREADY_ON_LIST_COPY,
  CONVERT_PUBLISHED_PROPERTY_TO_LEAD_RISK_COPY,
  PUBLISHED_PROPERTY_DRAWER_BBB_ABSENT_COPY,
  PublishedPropertyDrawer,
  shouldShowPublishedPropertyDrawerBbb,
  type PublishedPropertyBbbProfile,
  type PublishedPropertyDrawerDetail,
  type PublishedPropertyDrawerProps,
} from "./PublishedPropertyDrawer";
export { resolvePublishedPropertyDrawerDetail } from "./resolve-published-property-drawer-detail";
export { selectSearchInRadiusCandidatesForAgingRoofLayer } from "./select-search-in-radius-candidates-for-aging-roof-layer";
export {
  resolveLongOpenPermitListChipLabelsByPropertyId,
  selectSearchInRadiusCandidatesForPermitLayer,
} from "./select-search-in-radius-candidates-for-permit-layer";
export {
  DEFAULT_MIN_OPEN_PERMIT_YEARS,
  PERMIT_LAYER_CANDIDATE_SCAN_LIMIT,
  formatLongOpenPermitListChipLabel,
  resolveMaxLongOpenRoofingPermitYears,
  selectLongOpenRoofingPropertyPermitDetails,
} from "./property-permit-layer-summary";
export { selectSearchInRadiusCandidatesForPinRadius } from "./select-search-in-radius-candidates-for-pin-radius";
export { MapLibreMapCanvas } from "./MapLibreMapCanvas";
export {
  createHttpSearchInRadiusApiClient,
  type SearchInRadiusApiClient,
  type SearchInRadiusQueryInput,
} from "./create-http-search-in-radius-api-client";
export {
  createHttpPropertiesGetApiClient,
  type PropertiesGetApiClient,
  type PropertiesGetQueryInput,
  type PropertiesGetResult,
} from "./create-http-properties-get-api-client";
export {
  createHttpAgentAskApiClient,
  type AgentAskApiClient,
  type AgentAskQueryInput,
  type AgentAskResult,
  type AgentAskCitation,
} from "./create-http-agent-ask-api-client";
export {
  RoofingOpportunityAgentPanel,
  AGENT_PANEL_NOT_CONNECTED_COPY,
  AGENT_PANEL_EMPTY_INVITE_HEADING,
  AGENT_PANEL_EMPTY_INVITE_BODY,
  AGENT_PANEL_ASK_FAILED_COPY,
  type RoofingOpportunityAgentPanelProps,
} from "./RoofingOpportunityAgentPanel";
