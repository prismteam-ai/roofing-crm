import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { fetchTrpcQuery } from "./api/trpc-http";
import { resolveApiBaseUrl } from "./apiBaseUrl";
import {
  createHttpCountiesListApiClient,
  OperateWorkspaceHeader,
  resolveCoverageModeForCountyKey,
  resolveDefaultCountyKeyFromCatalog,
  resolveMapSearchReadyCountyKeyFallback,
  usePublishedCountyCatalogList,
} from "./chrome";
import {
  createHttpLeadRecordApiClient,
  createMemoryLeadRecordApiClient,
  LEADS_LIST_PERSISTENCE_LOCAL_API_COPY,
  LEADS_LIST_PERSISTENCE_LOCAL_MEMORY_COPY,
  type LeadRecordApiClient,
} from "./leads";
import {
  createHttpSearchInRadiusApiClient,
  createHttpPropertiesGetApiClient,
  createHttpAgentAskApiClient,
  MapLibreMapCanvas,
  MapSearchShell,
  type SearchInRadiusApiClient,
  type PropertiesGetApiClient,
  type AgentAskApiClient,
} from "./map";
import type { SearchInRadiusCandidate } from "./map/SearchInRadiusCandidateList";
import type { PropertyPermitDetail } from "./map/PropertyPermitLayerPanel";

/** Local tRPC default (`pnpm --filter api dev`). */
const LOCAL_TRPC_API_BASE_URL = "http://127.0.0.1:2022";

/**
 * Reads the Amplify-injected API URL for production builds.
 *
 * Local Vite prefers the process on :2022; demo parcels are a fallback only.
 */
function readHostedApiBaseUrl(): string | null {
  try {
    return resolveApiBaseUrl();
  } catch {
    return null;
  }
}

function readLocalTrpcApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return LOCAL_TRPC_API_BASE_URL;
}

/**
 * Dev-only parcels when local tRPC is not running.
 *
 * Offset from the Fort Myers pin so markers do not stack.
 */
const DEV_LONG_OPEN_PERMIT_DETAILS_BY_PROPERTY_ID: Record<
  string,
  PropertyPermitDetail[]
> = {
  "lee-prop-browser-verify": [
    {
      permitId: "DEMO-OPEN-6",
      permitType: "Roofing",
      status: "Open",
      issuedDate: "2020-01-15",
      openedDate: "2020-01-15",
      closedDate: null,
      description: "DEMO — synthetic long-open roofing permit",
      contractorName: null,
      sourceSystem: null,
      provenanceClass: null,
    },
  ],
};

const DEV_SEARCH_IN_RADIUS_CANDIDATES: SearchInRadiusCandidate[] = [
  {
    propertyId: "lee-prop-browser-verify",
    parcelIdentifier: "browser-verify",
    latitude: 26.652,
    longitude: -81.858,
    builtYear: 1988,
    addressStreet: "DEMO — 1 Palm Ave",
    addressCity: "Fort Myers",
    gisMuni: null,
    distanceMiles: 1.1,
  },
  {
    propertyId: "lee-prop-no-built-year",
    parcelIdentifier: "no-built-year",
    latitude: 26.628,
    longitude: -81.886,
    builtYear: null,
    addressStreet: "DEMO — 9 New Construction Ln",
    addressCity: "Fort Myers",
    gisMuni: null,
    distanceMiles: 1.4,
  },
  {
    propertyId: "lee-prop-outside-default-radius",
    parcelIdentifier: "outside-default-radius",
    latitude: 26.6406,
    longitude: -82.15,
    builtYear: 1975,
    addressStreet: "DEMO — 40 West Cape Blvd",
    addressCity: "Cape Coral",
    gisMuni: null,
    distanceMiles: 17,
  },
];

/**
 * Hosted SPA shell: map search (pin / GPS / radius) over published Elephant parcels.
 * Public demo — no login gate. Default pin follows the first map-ready catalog
 * county (Lee while overlay Chester is listable but not searchable).
 */
export const SHELL_OPERATOR_LEDE = "Walk the radius. Convert a roof.";

export function App(): JSX.Element {
  const isLocalViteDemo = import.meta.env.DEV;
  const hostedApiBaseUrl = isLocalViteDemo ? null : readHostedApiBaseUrl();
  const localTrpcApiBaseUrl = isLocalViteDemo ? readLocalTrpcApiBaseUrl() : null;
  const [localTrpcReachable, setLocalTrpcReachable] = useState(false);

  useEffect(() => {
    if (localTrpcApiBaseUrl === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ping = await fetchTrpcQuery<{ ok: true }>(
          localTrpcApiBaseUrl,
          "health.ping",
        );
        if (!cancelled) {
          setLocalTrpcReachable(ping.ok === true);
        }
      } catch {
        if (!cancelled) {
          setLocalTrpcReachable(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [localTrpcApiBaseUrl]);

  const useLocalTrpc = isLocalViteDemo && localTrpcReachable;

  const leadRecordApiClient = useMemo((): LeadRecordApiClient => {
    if (useLocalTrpc && localTrpcApiBaseUrl !== null) {
      return createHttpLeadRecordApiClient(localTrpcApiBaseUrl);
    }
    if (hostedApiBaseUrl !== null) {
      return createHttpLeadRecordApiClient(hostedApiBaseUrl);
    }
    return createMemoryLeadRecordApiClient({ sharedStore: true });
  }, [hostedApiBaseUrl, localTrpcApiBaseUrl, useLocalTrpc]);

  const searchInRadiusApiClient = useMemo((): SearchInRadiusApiClient | undefined => {
    if (useLocalTrpc && localTrpcApiBaseUrl !== null) {
      return createHttpSearchInRadiusApiClient(localTrpcApiBaseUrl);
    }
    if (hostedApiBaseUrl !== null) {
      return createHttpSearchInRadiusApiClient(hostedApiBaseUrl);
    }
    return undefined;
  }, [hostedApiBaseUrl, localTrpcApiBaseUrl, useLocalTrpc]);

  const propertiesGetApiClient = useMemo((): PropertiesGetApiClient | undefined => {
    if (useLocalTrpc && localTrpcApiBaseUrl !== null) {
      return createHttpPropertiesGetApiClient(localTrpcApiBaseUrl);
    }
    if (hostedApiBaseUrl !== null) {
      return createHttpPropertiesGetApiClient(hostedApiBaseUrl);
    }
    return undefined;
  }, [hostedApiBaseUrl, localTrpcApiBaseUrl, useLocalTrpc]);

  const agentAskApiClient = useMemo((): AgentAskApiClient | undefined => {
    if (useLocalTrpc && localTrpcApiBaseUrl !== null) {
      return createHttpAgentAskApiClient(localTrpcApiBaseUrl);
    }
    if (hostedApiBaseUrl !== null) {
      return createHttpAgentAskApiClient(hostedApiBaseUrl);
    }
    return undefined;
  }, [hostedApiBaseUrl, localTrpcApiBaseUrl, useLocalTrpc]);

  const countiesListApiClient = useMemo(() => {
    if (useLocalTrpc && localTrpcApiBaseUrl !== null) {
      return createHttpCountiesListApiClient(localTrpcApiBaseUrl);
    }
    if (hostedApiBaseUrl !== null) {
      return createHttpCountiesListApiClient(hostedApiBaseUrl);
    }
    return undefined;
  }, [hostedApiBaseUrl, localTrpcApiBaseUrl, useLocalTrpc]);

  const publishedCountyCatalogListItems =
    usePublishedCountyCatalogList(countiesListApiClient);
  const [selectedCountyKey, setSelectedCountyKey] = useState("chester-demo");
  const operatorHasChosenCountyRef = useRef(false);
  const publishedCountyCatalogListItemsRef = useRef(publishedCountyCatalogListItems);

  useEffect(() => {
    publishedCountyCatalogListItemsRef.current = publishedCountyCatalogListItems;
  }, [publishedCountyCatalogListItems]);

  const handleSelectedCountyKeyChange = (countyKey: string): void => {
    operatorHasChosenCountyRef.current = true;
    setSelectedCountyKey(countyKey);
  };

  useEffect(() => {
    if (countiesListApiClient === undefined) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const defaultCounty = await countiesListApiClient.getDefaultCounty();
        if (cancelled || operatorHasChosenCountyRef.current) {
          return;
        }
        setSelectedCountyKey(
          resolveDefaultCountyKeyFromCatalog(
            defaultCounty.countyKey,
            publishedCountyCatalogListItemsRef.current,
          ),
        );
      } catch {
        // Keep the current selection; the list-fallback effect still names a served place.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [countiesListApiClient]);

  useEffect(() => {
    const mapSearchReadyCountyKey = resolveMapSearchReadyCountyKeyFallback(
      selectedCountyKey,
      publishedCountyCatalogListItems,
    );
    if (mapSearchReadyCountyKey !== selectedCountyKey) {
      setSelectedCountyKey(mapSearchReadyCountyKey);
    }
  }, [publishedCountyCatalogListItems, selectedCountyKey]);

  const selectedCatalogItem = publishedCountyCatalogListItems.find(
    (item) => item.countyKey === selectedCountyKey,
  );
  // Empty catalog list = counties.list still loading; make no coverage claim
  // (Chester or Lee) until the catalog names the served place.
  const publishedCountyCatalogLoading = publishedCountyCatalogListItems.length === 0;
  const coverageMode = publishedCountyCatalogLoading
    ? null
    : resolveCoverageModeForCountyKey(
        selectedCountyKey,
        selectedCatalogItem?.mapSearchReady !== false,
      );
  const mapSearchReady = selectedCatalogItem?.mapSearchReady !== false;

  const liveRadiusSearchConnected =
    (useLocalTrpc && localTrpcApiBaseUrl !== null) || hostedApiBaseUrl !== null;

  const searchInRadiusCandidates =
    isLocalViteDemo && !useLocalTrpc ? DEV_SEARCH_IN_RADIUS_CANDIDATES : [];

  const leadsListPersistenceNote = isLocalViteDemo
    ? useLocalTrpc
      ? LEADS_LIST_PERSISTENCE_LOCAL_API_COPY
      : LEADS_LIST_PERSISTENCE_LOCAL_MEMORY_COPY
    : null;

  return (
    <div className="flex h-full min-h-full flex-col bg-background">
      <OperateWorkspaceHeader
        operatorLede={SHELL_OPERATOR_LEDE}
        publishedCountyCatalogListItems={publishedCountyCatalogListItems}
        selectedCountyKey={selectedCountyKey}
        onSelectedCountyKeyChange={handleSelectedCountyKeyChange}
        coverageMode={coverageMode}
      />
      <div className="min-h-0 flex-1">
        <MapSearchShell
          defaultCountyKey={selectedCountyKey}
          MapLibreMapCanvasComponent={MapLibreMapCanvas}
          leadRecordApiClient={leadRecordApiClient}
          leadsListPersistenceNote={leadsListPersistenceNote}
          searchInRadiusCandidates={searchInRadiusCandidates}
          propertyPermitDetailsByPropertyId={
            isLocalViteDemo && !useLocalTrpc
              ? DEV_LONG_OPEN_PERMIT_DETAILS_BY_PROPERTY_ID
              : undefined
          }
          searchInRadiusApiClient={searchInRadiusApiClient}
          propertiesGetApiClient={propertiesGetApiClient}
          agentAskApiClient={agentAskApiClient}
          liveRadiusSearchConnected={liveRadiusSearchConnected}
          coverageMode={coverageMode}
          mapSearchReady={mapSearchReady}
          onSwitchToMapReadyCounty={() => {
            const mapReadyCounty =
              publishedCountyCatalogListItems.find((item) => item.mapSearchReady)
                ?.countyKey ?? "chester-demo";
            handleSelectedCountyKeyChange(mapReadyCounty);
          }}
        />
      </div>
    </div>
  );
}
