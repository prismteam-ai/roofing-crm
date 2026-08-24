/**
 * Scans radius candidates with properties.get when the permit layer is enabled.
 */
import { useEffect, useMemo, useState } from "react";

import type { PropertyPermitDetail } from "./PropertyPermitLayerPanel";
import { PERMIT_LAYER_CANDIDATE_SCAN_LIMIT } from "./property-permit-layer-summary";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";
import type { PropertiesGetCacheApi } from "./use-properties-get-cache";

/**
 * Arguments for permit-layer candidate scanning.
 */
export interface UsePermitLayerCandidateSummariesArguments {
  propertyPermitLayerEnabled: boolean;
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  propertiesGetCache: PropertiesGetCacheApi;
  injectedPermitDetailsByPropertyId?: Record<string, PropertyPermitDetail[]>;
}

/**
 * Result of permit-layer candidate scanning.
 */
export interface UsePermitLayerCandidateSummariesResult {
  permitDetailsByPropertyId: Record<string, PropertyPermitDetail[]>;
  permitLayerScanPending: boolean;
}

/**
 * Picks which candidates get a properties.get permit scan.
 *
 * Parcels the published table flags with permits are scanned first (nearest
 * first within each group), so sparse permit signals are not starved out of
 * the budget by nearer permitless parcels. Candidates without the flag
 * (older API responses) keep plain nearest-first order.
 */
export function selectPermitLayerScanPropertyIds(
  searchInRadiusCandidates: SearchInRadiusCandidate[],
): string[] {
  const flaggedWithPermits: string[] = [];
  const remaining: string[] = [];

  for (const candidate of searchInRadiusCandidates) {
    if (candidate.hasPermits === true) {
      flaggedWithPermits.push(candidate.propertyId);
    } else {
      remaining.push(candidate.propertyId);
    }
  }

  return [...flaggedWithPermits, ...remaining].slice(
    0,
    PERMIT_LAYER_CANDIDATE_SCAN_LIMIT,
  );
}

/**
 * Loads permit rows for visible radius candidates when the permit layer is on.
 */
export function usePermitLayerCandidateSummaries({
  propertyPermitLayerEnabled,
  searchInRadiusCandidates,
  propertiesGetCache,
  injectedPermitDetailsByPropertyId,
}: UsePermitLayerCandidateSummariesArguments): UsePermitLayerCandidateSummariesResult {
  const [permitLayerScanPending, setPermitLayerScanPending] = useState(false);

  const candidatePropertyIds = useMemo(
    () => selectPermitLayerScanPropertyIds(searchInRadiusCandidates),
    [searchInRadiusCandidates],
  );

  useEffect(() => {
    if (!propertyPermitLayerEnabled) {
      setPermitLayerScanPending(false);
      return;
    }

    if (injectedPermitDetailsByPropertyId !== undefined) {
      setPermitLayerScanPending(false);
      return;
    }

    const missingPropertyIds = candidatePropertyIds.filter(
      (propertyId) =>
        propertiesGetCache.getCachedResult(propertyId, "scan") === undefined &&
        propertiesGetCache.shouldAttemptPropertyLoad(propertyId, "scan"),
    );
    if (missingPropertyIds.length === 0) {
      setPermitLayerScanPending(false);
      return;
    }

    let cancelled = false;
    setPermitLayerScanPending(true);
    void (async () => {
      try {
        await propertiesGetCache.ensurePropertiesLoaded(missingPropertyIds, {
          detailResolution: "scan",
        });
      } finally {
        if (!cancelled) {
          setPermitLayerScanPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    candidatePropertyIds,
    injectedPermitDetailsByPropertyId,
    propertyPermitLayerEnabled,
    propertiesGetCache,
    propertiesGetCache.cacheVersion,
  ]);

  const permitDetailsByPropertyId = useMemo(() => {
    const merged: Record<string, PropertyPermitDetail[]> = {
      ...injectedPermitDetailsByPropertyId,
    };

    for (const propertyId of candidatePropertyIds) {
      if (merged[propertyId] !== undefined) {
        continue;
      }
      const cachedResult = propertiesGetCache.getCachedResult(propertyId, "scan");
      if (cachedResult !== undefined) {
        merged[propertyId] = cachedResult.permits;
      }
    }

    return merged;
  }, [
    candidatePropertyIds,
    injectedPermitDetailsByPropertyId,
    propertiesGetCache,
    propertiesGetCache.cacheVersion,
  ]);

  return {
    permitDetailsByPropertyId,
    permitLayerScanPending,
  };
}
