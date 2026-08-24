/**
 * Map + optional property popup workspace (full-bleed plat).
 *
 * Candidate list, leads, and agent live in plat sheets on the shell, not here.
 */
import { useEffect, useState, type ComponentType, type JSX } from "react";

import type { MapLibreMapCanvasProps } from "./map-libre-map-canvas-props";
import type { PlatRoofMarkerLeadState } from "./plat-roof-marker-lead-state";
import {
  PublishedPropertyDrawer,
  type PublishedPropertyDrawerDetail,
} from "./PublishedPropertyDrawer";
import type { PropertyPermitDetail } from "./PropertyPermitLayerPanel";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";
import type { SearchMapCenter } from "./search-map-center";

/**
 * Props for the map workspace under the search HUD.
 */
export interface MapSearchShellWorkspaceProps {
  MapLibreMapCanvasComponent: ComponentType<MapLibreMapCanvasProps>;
  searchMapCenter: SearchMapCenter | null;
  mapViewCenter: SearchMapCenter;
  searchRadiusMiles: number;
  onSearchMapCenterDrop: (center: SearchMapCenter) => void;
  /**
   * Increments when the operator recenters on the selected county so the
   * camera flies even if the pin coordinates did not change.
   */
  mapCameraRecenterGeneration?: number;
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  selectedPropertyId: string | null;
  onSearchInRadiusCandidateSelect: (propertyId: string) => void;
  leadMarkerStateByPropertyId?: Readonly<Record<string, PlatRoofMarkerLeadState>>;
  publishedPropertyDrawerDetail: PublishedPropertyDrawerDetail | null;
  onPublishedPropertyDrawerClose: () => void;
  onConvertPublishedPropertyToLead?: () => void;
  convertPublishedPropertyToLeadPending?: boolean;
  convertPublishedPropertyToLeadStatusMessage?: string | null;
  selectedPropertyAlreadyConvertedToLead?: boolean;
  showPermitNotes?: boolean;
  propertyPermitDetails?: PropertyPermitDetail[];
  permitDetailsSource?:
    "consolidated_permits" | "query_permits" | "synthetic_demo" | null;
  publishedPropertyDetailPending?: boolean;
  publishedPropertyDetailErrorMessage?: string | null;
  showSearchRadiusCircle?: boolean;
  radiusCircleBloomToken?: number;
}

/**
 * Renders the map column with a selected-roof popup.
 */
export function MapSearchShellWorkspace({
  MapLibreMapCanvasComponent,
  searchMapCenter,
  mapViewCenter,
  searchRadiusMiles,
  onSearchMapCenterDrop,
  mapCameraRecenterGeneration = 0,
  searchInRadiusCandidates,
  selectedPropertyId,
  onSearchInRadiusCandidateSelect,
  leadMarkerStateByPropertyId = {},
  publishedPropertyDrawerDetail,
  onPublishedPropertyDrawerClose,
  onConvertPublishedPropertyToLead,
  convertPublishedPropertyToLeadPending = false,
  convertPublishedPropertyToLeadStatusMessage = null,
  selectedPropertyAlreadyConvertedToLead = false,
  showPermitNotes = false,
  propertyPermitDetails = [],
  permitDetailsSource = null,
  publishedPropertyDetailPending = false,
  publishedPropertyDetailErrorMessage = null,
  showSearchRadiusCircle = true,
  radiusCircleBloomToken = 0,
}: MapSearchShellWorkspaceProps): JSX.Element {
  const [displayedPropertyDrawerDetail, setDisplayedPropertyDrawerDetail] =
    useState<PublishedPropertyDrawerDetail | null>(null);

  useEffect(() => {
    if (publishedPropertyDrawerDetail !== null) {
      setDisplayedPropertyDrawerDetail(publishedPropertyDrawerDetail);
    }
  }, [publishedPropertyDrawerDetail]);

  const drawerOpen = selectedPropertyId !== null;
  const propertyDrawerDetailForRender =
    publishedPropertyDrawerDetail ?? displayedPropertyDrawerDetail;

  return (
    <div className="plat-map-tint relative flex h-full min-h-0 flex-1 flex-col">
      <MapLibreMapCanvasComponent
        searchMapCenter={searchMapCenter}
        mapViewCenter={mapViewCenter}
        searchRadiusMiles={searchRadiusMiles}
        onSearchMapCenterDrop={onSearchMapCenterDrop}
        mapCameraRecenterGeneration={mapCameraRecenterGeneration}
        searchInRadiusCandidates={searchInRadiusCandidates}
        selectedPropertyId={selectedPropertyId}
        onSearchInRadiusCandidateSelect={onSearchInRadiusCandidateSelect}
        leadMarkerStateByPropertyId={leadMarkerStateByPropertyId}
        showSearchRadiusCircle={showSearchRadiusCircle}
        radiusCircleBloomToken={radiusCircleBloomToken}
      />
      {displayedPropertyDrawerDetail !== null &&
      propertyDrawerDetailForRender !== null ? (
        <PublishedPropertyDrawer
          open={drawerOpen}
          publishedPropertyDrawerDetail={propertyDrawerDetailForRender}
          onPublishedPropertyDrawerClose={onPublishedPropertyDrawerClose}
          onDrawerClosed={() => {
            setDisplayedPropertyDrawerDetail(null);
          }}
          onConvertPublishedPropertyToLead={onConvertPublishedPropertyToLead}
          convertPublishedPropertyToLeadPending={convertPublishedPropertyToLeadPending}
          convertPublishedPropertyToLeadStatusMessage={
            convertPublishedPropertyToLeadStatusMessage
          }
          selectedPropertyAlreadyConvertedToLead={
            selectedPropertyAlreadyConvertedToLead
          }
          showPermitNotes={showPermitNotes}
          propertyPermitDetails={propertyPermitDetails}
          permitDetailsSource={permitDetailsSource}
          publishedPropertyDetailPending={publishedPropertyDetailPending}
          publishedPropertyDetailErrorMessage={publishedPropertyDetailErrorMessage}
        />
      ) : null}
    </div>
  );
}
