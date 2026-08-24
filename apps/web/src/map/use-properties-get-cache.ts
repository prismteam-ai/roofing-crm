/**
 * Shared properties.get cache for drawer detail and permit-layer scans.
 *
 * Successful rows stay in memory. Failed loads go through a backoff gate so
 * Oracle misses and 5xx storms do not refetch on every render.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createPropertiesGetFailureGate } from "./properties-get-load-backoff";
import type {
  PropertiesGetApiClient,
  PropertiesGetResult,
} from "./create-http-properties-get-api-client";

export type PropertyDetailResolution = "drawer" | "scan";

function buildPropertiesGetCacheKey(
  propertyId: string,
  detailResolution: PropertyDetailResolution,
): string {
  return `${propertyId}:${detailResolution}`;
}

/**
 * Arguments for the properties.get cache hook.
 */
export interface UsePropertiesGetCacheArguments {
  defaultCountyKey: string;
  propertiesGetApiClient?: PropertiesGetApiClient;
}

/**
 * Cache API returned to drawer and permit-layer hooks.
 */
export interface PropertiesGetCacheApi {
  getCachedResult: (
    propertyId: string,
    detailResolution?: PropertyDetailResolution,
  ) => PropertiesGetResult | undefined;
  shouldAttemptPropertyLoad: (
    propertyId: string,
    detailResolution?: PropertyDetailResolution,
  ) => boolean;
  ensurePropertyLoaded: (
    propertyId: string,
    options?: { detailResolution?: PropertyDetailResolution },
  ) => Promise<PropertiesGetResult | undefined>;
  ensurePropertiesLoaded: (
    propertyIds: string[],
    options?: { detailResolution?: PropertyDetailResolution },
  ) => Promise<void>;
  cacheVersion: number;
}

/**
 * Keeps an in-memory properties.get cache with single-flight deduplication
 * and exponential backoff after failures.
 */
export function usePropertiesGetCache({
  defaultCountyKey,
  propertiesGetApiClient,
}: UsePropertiesGetCacheArguments): PropertiesGetCacheApi {
  const cacheRef = useRef(new Map<string, PropertiesGetResult>());
  const inflightRef = useRef(
    new Map<string, Promise<PropertiesGetResult | undefined>>(),
  );
  const failureGateRef = useRef(createPropertiesGetFailureGate());
  const retryTimeoutIdsRef = useRef(new Map<string, number>());
  const [cacheVersion, setCacheVersion] = useState(0);

  const clearRetryTimeouts = useCallback(() => {
    for (const timeoutId of retryTimeoutIdsRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    retryTimeoutIdsRef.current.clear();
  }, []);

  useEffect(() => {
    cacheRef.current.clear();
    inflightRef.current.clear();
    failureGateRef.current.clear();
    clearRetryTimeouts();
    setCacheVersion((version) => version + 1);
  }, [clearRetryTimeouts, defaultCountyKey]);

  useEffect(() => {
    return () => {
      clearRetryTimeouts();
    };
  }, [clearRetryTimeouts]);

  const scheduleRetry = useCallback((propertyId: string, retryAtMs: number) => {
    const existingTimeoutId = retryTimeoutIdsRef.current.get(propertyId);
    if (existingTimeoutId !== undefined) {
      window.clearTimeout(existingTimeoutId);
    }
    const retryDelayMs = Math.max(0, retryAtMs - Date.now());
    const timeoutId = window.setTimeout(() => {
      retryTimeoutIdsRef.current.delete(propertyId);
      setCacheVersion((version) => version + 1);
    }, retryDelayMs);
    retryTimeoutIdsRef.current.set(propertyId, timeoutId);
  }, []);

  const getCachedResult = useCallback(
    (
      propertyId: string,
      detailResolution: PropertyDetailResolution = "drawer",
    ): PropertiesGetResult | undefined =>
      cacheRef.current.get(buildPropertiesGetCacheKey(propertyId, detailResolution)),
    [cacheVersion],
  );

  const shouldAttemptPropertyLoad = useCallback(
    (
      propertyId: string,
      detailResolution: PropertyDetailResolution = "drawer",
    ): boolean =>
      failureGateRef.current.shouldAttempt(
        buildPropertiesGetCacheKey(propertyId, detailResolution),
      ),
    [cacheVersion],
  );

  const ensurePropertyLoaded = useCallback(
    async (
      propertyId: string,
      options?: { detailResolution?: PropertyDetailResolution },
    ): Promise<PropertiesGetResult | undefined> => {
      if (propertiesGetApiClient === undefined) {
        return undefined;
      }

      const detailResolution = options?.detailResolution ?? "drawer";
      const cacheKey = buildPropertiesGetCacheKey(propertyId, detailResolution);

      const cached = cacheRef.current.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      if (!failureGateRef.current.shouldAttempt(cacheKey)) {
        return undefined;
      }

      const inflight = inflightRef.current.get(cacheKey);
      if (inflight !== undefined) {
        return inflight;
      }

      const loadPromise = (async () => {
        try {
          const propertiesGetResult = await propertiesGetApiClient.getProperty({
            county: defaultCountyKey,
            propertyId,
            detailResolution,
          });
          failureGateRef.current.recordSuccess(cacheKey);
          cacheRef.current.set(cacheKey, propertiesGetResult);
          setCacheVersion((version) => version + 1);
          return propertiesGetResult;
        } catch (error) {
          const retryAtMs = failureGateRef.current.recordFailure(cacheKey, error);
          setCacheVersion((version) => version + 1);
          if (retryAtMs !== null) {
            scheduleRetry(cacheKey, retryAtMs);
          }
          return undefined;
        } finally {
          inflightRef.current.delete(cacheKey);
        }
      })();

      inflightRef.current.set(cacheKey, loadPromise);
      return loadPromise;
    },
    [defaultCountyKey, propertiesGetApiClient, scheduleRetry],
  );

  const ensurePropertiesLoaded = useCallback(
    async (
      propertyIds: string[],
      options?: { detailResolution?: PropertyDetailResolution },
    ): Promise<void> => {
      await Promise.all(
        propertyIds.map((propertyId) => ensurePropertyLoaded(propertyId, options)),
      );
    },
    [ensurePropertyLoaded],
  );

  return useMemo(
    () => ({
      getCachedResult,
      shouldAttemptPropertyLoad,
      ensurePropertyLoaded,
      ensurePropertiesLoaded,
      cacheVersion,
    }),
    [
      cacheVersion,
      ensurePropertiesLoaded,
      ensurePropertyLoaded,
      getCachedResult,
      shouldAttemptPropertyLoad,
    ],
  );
}
