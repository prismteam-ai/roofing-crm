import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LeadsPage } from "./features/leads/LeadsPage.tsx";
import { MapPage } from "./features/map/MapPage.tsx";
import { SnapshotBanner } from "./features/map/SnapshotBanner.tsx";
import { type Route, Sidebar } from "./layout/Sidebar.tsx";
import { type ApiClient, createApiClient, TRPCProvider, useTRPC } from "./lib/trpc.ts";
import { SearchProvider, type SearchState } from "./state.tsx";

const routeOf = (hash: string): Route => (hash.startsWith("#/leads") ? "leads" : "map");

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(routeOf(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

function Shell({ debounceMs }: { debounceMs?: number }) {
  const route = useHashRoute();
  const trpc = useTRPC();
  const leads = useQuery(trpc.leads.list.queryOptions());
  return (
    <div className="app">
      <Sidebar route={route} leadCount={leads.data?.length} />
      <main>
        <SnapshotBanner />
        {route === "map" ? <MapPage debounceMs={debounceMs} /> : <LeadsPage />}
      </main>
    </div>
  );
}

export function App({
  client,
  queryClient,
  initialSearch,
  debounceMs,
}: {
  client?: ApiClient;
  queryClient?: QueryClient;
  initialSearch?: Partial<SearchState>;
  debounceMs?: number;
}) {
  const [qc] = useState(
    () =>
      queryClient ??
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } },
      }),
  );
  const [api] = useState(() => client ?? createApiClient());
  return (
    <QueryClientProvider client={qc}>
      <TRPCProvider trpcClient={api} queryClient={qc}>
        <SearchProvider initial={initialSearch}>
          <Shell debounceMs={debounceMs} />
        </SearchProvider>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
