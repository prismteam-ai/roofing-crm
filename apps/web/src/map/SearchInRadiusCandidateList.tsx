/**
 * Search-in-radius candidate list — accessible twin of map markers.
 *
 * Renders published parcel rows from `search.inRadius` (or an injected
 * equivalent). Empty radius results are a valid state, not an error.
 */
import type { JSX } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPublishedPropertyStreetLabel } from "./format-published-property-street-label";
import {
  formatSearchInRadiusCandidateDistanceCopy,
  formatSearchInRadiusCandidateRoofAgeCopy,
  formatSearchInRadiusCandidateStructureLineCopy,
} from "./format-search-in-radius-candidate-row-meta";
import {
  resolveSearchInRadiusCandidateListEmptyCopy,
  splitSearchInRadiusCandidateListEmptyCopy,
  type SearchInRadiusCandidateListEmptyReason,
} from "./search-in-radius-candidate-list-empty-copy";

export {
  SEARCH_IN_RADIUS_CANDIDATE_LIST_AGING_FILTER_EMPTY_COPY,
  SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY,
  SEARCH_IN_RADIUS_CANDIDATE_LIST_NO_PIN_COPY,
  SEARCH_IN_RADIUS_CANDIDATE_LIST_PERMIT_FILTER_EMPTY_COPY,
  SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_NOT_CONNECTED_COPY,
  resolveSearchInRadiusCandidateListEmptyCopy,
  type SearchInRadiusCandidateListEmptyReason,
} from "./search-in-radius-candidate-list-empty-copy";

/**
 * One parcel candidate from radius search (mirrors API SearchInRadiusCandidate).
 *
 * Markers and list rows share this shape so the map never invents fixture pins.
 */
export interface SearchInRadiusCandidate {
  propertyId: string;
  parcelIdentifier: string | null;
  latitude: number;
  longitude: number;
  builtYear: number | null;
  /** `synthetic_demo` on chester-demo rows; null/undefined on sourced counties. */
  builtYearSource?: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  gisMuni: number | null;
  distanceMiles: number;
  /**
   * Published has-permits flag; lets the permit layer scan parcels that
   * actually have permits first. Undefined on older API responses.
   */
  hasPermits?: boolean | null;
}

/**
 * Props for the search-in-radius candidate list.
 */
export interface SearchInRadiusCandidateListProps {
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  selectedPropertyId: string | null;
  onSearchInRadiusCandidateSelect: (propertyId: string) => void;
  emptyReason?: SearchInRadiusCandidateListEmptyReason;
  longOpenPermitChipLabelByPropertyId?: Record<string, string>;
  onSwitchToMapReadyCounty?: () => void;
}

/**
 * Renders search candidates as an accessible list, or honest empty when none.
 */
export function SearchInRadiusCandidateList({
  searchInRadiusCandidates,
  selectedPropertyId,
  onSearchInRadiusCandidateSelect,
  emptyReason = "no_radius_results",
  longOpenPermitChipLabelByPropertyId = {},
  onSwitchToMapReadyCounty,
}: SearchInRadiusCandidateListProps): JSX.Element {
  if (searchInRadiusCandidates.length === 0) {
    const emptyCopy = resolveSearchInRadiusCandidateListEmptyCopy(emptyReason);
    const { fact, recovery } = splitSearchInRadiusCandidateListEmptyCopy(emptyCopy);
    const isFailed = emptyReason === "search_failed";
    const isCountyNotMapReady = emptyReason === "county_not_map_ready";
    const isIdleNoPin = emptyReason === "no_pin";

    return (
      <div
        className="flex flex-col gap-2 py-3"
        data-testid="search-in-radius-candidate-list-empty"
        role="status"
      >
        {isIdleNoPin ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{emptyCopy}</p>
        ) : (
          <p className="flex flex-col gap-1">
            <span
              className={cn(
                "font-heading text-base font-bold tracking-wide uppercase",
                isFailed ? "text-destructive" : "text-foreground",
              )}
            >
              {fact}
            </span>
            {recovery !== "" && !isCountyNotMapReady ? (
              <>
                {" "}
                <span className="text-sm font-normal normal-case tracking-normal text-muted-foreground">
                  {recovery}
                </span>
              </>
            ) : null}
          </p>
        )}
        {isCountyNotMapReady && onSwitchToMapReadyCounty !== undefined ? (
          <Button
            type="button"
            variant="outline"
            className="w-fit rounded-none border-foreground/70 bg-card font-heading text-xs tracking-wide uppercase"
            data-testid="switch-to-map-ready-county"
            onClick={onSwitchToMapReadyCounty}
          >
            Walk Lee County
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <ul
      className="flex flex-col"
      data-testid="search-in-radius-candidate-list"
      aria-label="Roofs in this radius"
    >
      {searchInRadiusCandidates.map((candidate) => {
        const isSelected = candidate.propertyId === selectedPropertyId;
        const streetLabel = formatPublishedPropertyStreetLabel({
          addressStreet: candidate.addressStreet,
          fallbackLabel: candidate.parcelIdentifier ?? candidate.propertyId,
        });
        const permitChipLabel =
          longOpenPermitChipLabelByPropertyId[candidate.propertyId];

        return (
          <li key={candidate.propertyId}>
            <button
              type="button"
              className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-0 border-b border-foreground/25 px-0 py-1.5 text-left",
                isSelected
                  ? "bg-[#c4a574]/40 text-foreground"
                  : "bg-transparent hover:bg-foreground/5",
              )}
              data-testid={`search-in-radius-candidate-row-${candidate.propertyId}`}
              aria-pressed={isSelected}
              onClick={() => {
                onSearchInRadiusCandidateSelect(candidate.propertyId);
              }}
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {streetLabel}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatSearchInRadiusCandidateDistanceCopy(candidate.distanceMiles)}
              </span>
              <span className="col-span-2 flex items-baseline justify-between gap-x-3 text-xs tabular-nums text-muted-foreground">
                <span className="min-w-0 truncate">
                  {formatSearchInRadiusCandidateStructureLineCopy({
                    addressCity: candidate.addressCity,
                    builtYear: candidate.builtYear,
                  })}
                </span>
                <span className="shrink-0 text-right">
                  {formatSearchInRadiusCandidateRoofAgeCopy({
                    builtYear: candidate.builtYear,
                    builtYearSource: candidate.builtYearSource,
                  })}
                </span>
              </span>
              {permitChipLabel !== undefined ? (
                <span className="col-span-2">
                  <Badge
                    variant="secondary"
                    className="plat-permit-chip w-fit rounded-none border border-[#8b2942] bg-transparent px-1 py-0 text-[0.65rem] font-heading tracking-wide text-[#8b2942] uppercase"
                    data-testid={`search-in-radius-candidate-permit-chip-${candidate.propertyId}`}
                  >
                    {permitChipLabel}
                  </Badge>
                </span>
              ) : null}
              <span className="sr-only">{candidate.propertyId}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
