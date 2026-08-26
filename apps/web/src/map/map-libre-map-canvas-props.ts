import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";
import type { SearchMapCenter } from "./search-map-center";
import type { PlatRoofMarkerLeadState } from "./plat-roof-marker-lead-state";

/**
 * Props for the map canvas that renders the interactive map and pin drop.
 *
 * Kept in a MapLibre-free module so design tests can type stubs without loading WebGL.
 * Candidate markers are driven only by `searchInRadiusCandidates` — never fixtures.
 */
export interface MapLibreMapCanvasProps {
  /**
   * Search ping on the plat. `null` keeps the map empty (no pin, no radius circle).
   */
  searchMapCenter: SearchMapCenter | null;
  /**
   * Camera target when no ping is down (selected county seat).
   */
  mapViewCenter: SearchMapCenter;
  searchRadiusMiles: number;
  onSearchMapCenterDrop: (center: SearchMapCenter) => void;
  /**
   * Radius-search parcels to mark on the map.
   *
   * Defaults to `[]` so an empty search stays empty (no hardcoded demo pins).
   */
  searchInRadiusCandidates?: SearchInRadiusCandidate[];
  /** Optional selection highlight for the active list / drawer property. */
  selectedPropertyId?: string | null;
  /** Optional marker click → same selection path as the candidate list. */
  onSearchInRadiusCandidateSelect?: (propertyId: string) => void;
  /**
   * Outreach styling for roofs already saved to the leads list or archived.
   */
  leadMarkerStateByPropertyId?: Readonly<Record<string, PlatRoofMarkerLeadState>>;
  /**
   * Bumped when the camera should fly to the pin even if lat/lng are unchanged
   * (operator panned the plat away from the county seat).
   */
  mapCameraRecenterGeneration?: number;
  /**
   * When false, the walk-radius circle stays hidden (pin may still render).
   */
  showSearchRadiusCircle?: boolean;
  /**
   * Increment to replay the radius bloom when the circle first becomes visible.
   */
  radiusCircleBloomToken?: number;
}
