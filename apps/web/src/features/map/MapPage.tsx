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
            {r.capped.map((l) => cappedText(l, r.rowLimit, r.totals[l])).join(" ")} Narrow the radius or raise
            the threshold to see them all.
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
        <CandidateList
          candidates={candidates}
          selectedId={selectedId}
          onOpen={setSelectedId}
          busy={q.isFetching || input !== debounced}
        />
        <AgentPanel />
      </div>
      {selectedId ? <DetailDrawer propertyId={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}

/** "Showing 2,000 of 108,889 aged roofs, …" for a layer that hit the row limit. */
export function cappedText(layer: "aged_roofs" | "open_permits", limit: number, total?: number) {
  const of = total && total > limit ? ` of ${total.toLocaleString()}` : "";
  return layer === "aged_roofs"
    ? `Showing ${limit.toLocaleString()}${of} aged roofs, spread across the radius (the oldest in each part of it).`
    : `Showing the ${limit.toLocaleString()} longest-open${of} open roofing permits.`;
}
