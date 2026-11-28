import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useDebounced } from "../../lib/useDebounced.ts";
import { useTRPC } from "../../lib/trpc.ts";
import { useSearch } from "../../state.tsx";
import { AgentPanel } from "../agent/AgentPanel.tsx";
import { CandidateList } from "../candidates/CandidateList.tsx";
import { DetailDrawer } from "../candidates/DetailDrawer.tsx";
import { Filters } from "../candidates/Filters.tsx";
import { CenterControl } from "./CenterControl.tsx";
import { MapView } from "./MapView.tsx";
import { SearchControls } from "./SearchControls.tsx";

const LAYER_NAME = { aged_roofs: "aged roofs", open_permits: "open permits" } as const;

export function MapPage({ debounceMs = 300 }: { debounceMs?: number }) {
  const trpc = useTRPC();
  const { search, update, setCenter, agentResults } = useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const input = useMemo(
    () => ({
      center: search.center,
      radiusMiles: search.radiusMiles,
      minRoofAgeYears: search.minRoofAgeYears,
      minOpenYears: search.minOpenYears,
      layers: search.layers,
      permitStatus: search.permitStatus,
    }),
    [search],
  );
  const debounced = useDebounced(input, debounceMs);
  const q = useQuery({ ...trpc.map.search.queryOptions(debounced), placeholderData: keepPreviousData });
  const r = q.data;
  const candidates = r?.candidates ?? [];
  const errorCode = (q.error as { data?: { code?: string } } | null)?.data?.code;

  return (
    <div className="map-page">
      <div className="map-column">
        <CenterControl />
        <SearchControls />
        <Filters value={search} onChange={update} idPrefix="map" />
        <MapView
          center={search.center}
          radiusMiles={search.radiusMiles}
          candidates={candidates}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onPinDrop={(c) => setCenter(c, "pin")}
          agentResults={agentResults}
          fitKey={search.fitKey}
        />
        {r?.outsideCoverage ? (
          <div className="banner warn" role="alert" data-testid="outside-coverage">
            <strong>Outside Broward coverage.</strong> This CRM covers Broward County, FL only; the search
            center is outside it. Drop the pin inside the county or search a Broward city.
          </div>
        ) : null}
        {r && r.permitGaps.length ? (
          <p className="notice" data-testid="permit-gaps">
            No permit data in this run for {r.permitGaps.join(", ")}: properties there show roof age only.
          </p>
        ) : null}
        {r && r.capped.length ? (
          <p className="notice" data-testid="capped">
            Showing the first {r.rowLimit.toLocaleString()} {r.capped.map((l) => LAYER_NAME[l]).join(" and ")}
            {r.capped.includes("aged_roofs") ? " (the oldest roofs first)" : ""}. Narrow the radius or raise
            the roof-age threshold to see the rest.
          </p>
        ) : null}
        {q.error ? (
          <div className="banner degraded" role="alert">
            {errorCode === "PRECONDITION_FAILED"
              ? "Search refused: the Oracle serves a different data run than the CRM expects."
              : errorCode === "SERVICE_UNAVAILABLE"
                ? "Property search is unavailable: the Oracle is not answering. Leads still work."
                : `Search failed: ${q.error.message}`}
          </div>
        ) : null}
      </div>
      <div className="list-column">
        {q.isFetching && !r ? <p className="muted">Searching…</p> : null}
        <CandidateList candidates={candidates} selectedId={selectedId} onOpen={setSelectedId} />
        <AgentPanel />
      </div>
      {selectedId ? <DetailDrawer propertyId={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}
