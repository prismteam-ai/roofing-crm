import {
  BROWARD_CENTER,
  DEFAULT_RADIUS_MILES,
  DEFAULT_ROOF_AGE_YEARS,
  type LatLon,
  type Layer,
  type PermitStatus,
} from "@crm/shared";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

export type CenterSource = "county" | "gps" | "pin" | "place" | "coords" | "agent";

export interface SearchState {
  center: LatLon;
  centerSource: CenterSource;
  /** Bumped whenever the center is set from outside the map, so the map re-fits to the radius. */
  fitKey: number;
  placeName: string | null;
  radiusMiles: number;
  minRoofAgeYears: number;
  minOpenYears: number;
  /** undefined = every status. */
  permitStatus: PermitStatus[] | undefined;
  layers: Layer[];
}

export const INITIAL_SEARCH: SearchState = {
  center: { ...BROWARD_CENTER },
  centerSource: "county",
  fitKey: 0,
  placeName: null,
  radiusMiles: DEFAULT_RADIUS_MILES,
  minRoofAgeYears: DEFAULT_ROOF_AGE_YEARS,
  minOpenYears: 0,
  permitStatus: undefined,
  layers: ["aged_roofs", "open_permits"],
};

export interface AgentResult {
  propertyId: string;
  lat: number;
  lon: number;
  label: string;
}

interface Ctx {
  search: SearchState;
  update(patch: Partial<SearchState>): void;
  setCenter(center: LatLon, source: CenterSource, placeName?: string | null): void;
  /** Agent answer results shown as their own map layer. */
  agentResults: AgentResult[];
  setAgentResults(r: AgentResult[]): void;
}

const SearchContext = createContext<Ctx | null>(null);

export function SearchProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<SearchState>;
}) {
  const [search, setSearch] = useState<SearchState>({ ...INITIAL_SEARCH, ...initial });
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);
  const value = useMemo<Ctx>(
    () => ({
      search,
      update: (patch) => setSearch((s) => ({ ...s, ...patch })),
      setCenter: (center, source, placeName = null) =>
        setSearch((s) => ({
          ...s,
          center,
          centerSource: source,
          placeName,
          fitKey: source === "pin" ? s.fitKey : s.fitKey + 1,
        })),
      agentResults,
      setAgentResults,
    }),
    [search, agentResults],
  );
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): Ctx {
  const c = useContext(SearchContext);
  if (!c) throw new Error("useSearch outside SearchProvider");
  return c;
}
