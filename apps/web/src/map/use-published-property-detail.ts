/**
 * Loads properties.get detail when a published property is selected on the map.
 *
 * Uses a shared properties.get cache so permit-layer scans reuse the same rows.
 */
import { useEffect, useMemo, useState } from "react";
import { resolvePropertyPermitOpenYears } from "@roofing-crm-challenge/shared";

import { mapPropertiesGetResultToPublishedPropertyDrawerDetail } from "./map-properties-get-result-to-published-property-drawer-detail";
import { DEFAULT_MIN_OPEN_PERMIT_YEARS } from "./property-permit-layer-summary";
import {
  isRoofingPropertyPermitDetail,
  type PropertyPermitDetail,
} from "./PropertyPermitLayerPanel";
import type { PublishedPropertyDrawerDetail } from "./PublishedPropertyDrawer";
import { resolvePublishedPropertyDrawerDetail } from "./resolve-published-property-drawer-detail";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";
import type { PropertiesGetCacheApi } from "./use-properties-get-cache";

export { DEFAULT_MIN_OPEN_PERMIT_YEARS };

/**
 * Arguments for the published-property detail hook.
 */
export interface UsePublishedPropertyDetailArguments {
  selectedPropertyId: string | null;
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  publishedPropertyDrawerDetailsByPropertyId?: Record<
    string,
    PublishedPropertyDrawerDetail
  >;
  propertyPermitDetails?: PropertyPermitDetail[];
  propertiesGetCache?: PropertiesGetCacheApi;
  currentUtcYear?: number;
  minOpenPermitYears?: number;
}

/**
 * Result of the published-property detail hook.
 */
export interface UsePublishedPropertyDetailResult {
  publishedPropertyDrawerDetail: PublishedPropertyDrawerDetail | null;
  propertyPermitDetails: PropertyPermitDetail[];
  permitDetailsSource:
    "consolidated_permits" | "query_permits" | "synthetic_demo" | null;
  publishedPropertyDetailPending: boolean;
  publishedPropertyDetailErrorMessage: string | null;
  selectedConvertiblePermitIds: string[];
}

/**
 * Returns roofing permit ids that are long-open enough to attach on lead convert.
 */
export function selectConvertibleRoofingPermitIds(arguments_: {
  propertyPermitDetails: PropertyPermitDetail[];
  minOpenPermitYears: number;
  currentUtcYear: number;
}): string[] {
  return arguments_.propertyPermitDetails
    .filter((permitDetail) => {
      if (!isRoofingPropertyPermitDetail(permitDetail)) {
        return false;
      }
      const openYears = resolvePropertyPermitOpenYears({
        openedDate: permitDetail.openedDate,
        issuedDate: permitDetail.issuedDate,
        closedDate: permitDetail.closedDate,
        currentUtcYear: arguments_.currentUtcYear,
      });
      return openYears !== null && openYears >= arguments_.minOpenPermitYears;
    })
    .map((permitDetail) => permitDetail.permitId)
    .filter((permitId): permitId is string => permitId !== null);
}

/**
 * Fetches and caches properties.get for the selected parcel.
 */
export function usePublishedPropertyDetail({
  selectedPropertyId,
  searchInRadiusCandidates,
  publishedPropertyDrawerDetailsByPropertyId,
  propertyPermitDetails: injectedPropertyPermitDetails = [],
  propertiesGetCache,
  currentUtcYear = new Date().getUTCFullYear(),
  minOpenPermitYears = DEFAULT_MIN_OPEN_PERMIT_YEARS,
}: UsePublishedPropertyDetailArguments): UsePublishedPropertyDetailResult {
  const [publishedPropertyDetailPending, setPublishedPropertyDetailPending] =
    useState(false);
  const [publishedPropertyDetailErrorMessage, setPublishedPropertyDetailErrorMessage] =
    useState<string | null>(null);

  useEffect(() => {
    if (propertiesGetCache === undefined || selectedPropertyId === null) {
      setPublishedPropertyDetailPending(false);
      setPublishedPropertyDetailErrorMessage(null);
      return;
    }

    if (
      publishedPropertyDrawerDetailsByPropertyId?.[selectedPropertyId] !== undefined
    ) {
      setPublishedPropertyDetailPending(false);
      setPublishedPropertyDetailErrorMessage(null);
      return;
    }

    if (
      propertiesGetCache.getCachedResult(selectedPropertyId, "drawer") !== undefined
    ) {
      setPublishedPropertyDetailPending(false);
      setPublishedPropertyDetailErrorMessage(null);
      return;
    }

    if (!propertiesGetCache.shouldAttemptPropertyLoad(selectedPropertyId)) {
      setPublishedPropertyDetailPending(false);
      setPublishedPropertyDetailErrorMessage("Could not load property details.");
      return;
    }

    let cancelled = false;
    setPublishedPropertyDetailPending(true);
    setPublishedPropertyDetailErrorMessage(null);

    void (async () => {
      const propertiesGetResult = await propertiesGetCache.ensurePropertyLoaded(
        selectedPropertyId,
        {
          detailResolution: "drawer",
        },
      );
      if (!cancelled) {
        if (propertiesGetResult === undefined) {
          setPublishedPropertyDetailErrorMessage("Could not load property details.");
        }
        setPublishedPropertyDetailPending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    propertiesGetCache,
    propertiesGetCache?.cacheVersion,
    publishedPropertyDrawerDetailsByPropertyId,
    selectedPropertyId,
  ]);

  const fetchedPropertiesGetResult =
    selectedPropertyId === null || propertiesGetCache === undefined
      ? undefined
      : propertiesGetCache.getCachedResult(selectedPropertyId, "drawer");

  const mergedDrawerDetailsByPropertyId = useMemo(() => {
    const merged: Record<string, PublishedPropertyDrawerDetail> = {
      ...publishedPropertyDrawerDetailsByPropertyId,
    };
    if (fetchedPropertiesGetResult !== undefined) {
      merged[fetchedPropertiesGetResult.propertyId] =
        mapPropertiesGetResultToPublishedPropertyDrawerDetail(
          fetchedPropertiesGetResult,
        );
    }
    return merged;
  }, [fetchedPropertiesGetResult, publishedPropertyDrawerDetailsByPropertyId]);

  const publishedPropertyDrawerDetail = resolvePublishedPropertyDrawerDetail({
    selectedPropertyId,
    searchInRadiusCandidates,
    publishedPropertyDrawerDetailsByPropertyId: mergedDrawerDetailsByPropertyId,
  });

  const propertyPermitDetails =
    fetchedPropertiesGetResult?.permits ??
    (propertiesGetCache === undefined ? injectedPropertyPermitDetails : []);

  const selectedConvertiblePermitIds = selectConvertibleRoofingPermitIds({
    propertyPermitDetails,
    minOpenPermitYears,
    currentUtcYear,
  });

  return {
    publishedPropertyDrawerDetail,
    propertyPermitDetails,
    permitDetailsSource: fetchedPropertiesGetResult?.permitDetailsSource ?? null,
    publishedPropertyDetailPending,
    publishedPropertyDetailErrorMessage,
    selectedConvertiblePermitIds,
  };
}
