import type { JSX } from "react";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { AgingRoofLayerControl } from "./AgingRoofLayerControl";
import {
  AGING_ROOF_STRUCTURE_YEAR_UNAVAILABLE_CHIP_COPY,
  resolveAgingRoofLayerLabel,
} from "./aging-roof-layer-label";
import { PropertyPermitLayerControl } from "./PropertyPermitLayerControl";
import { formatPropertyPermitLayerFilterLabel } from "./property-permit-layer-summary";
import {
  SEARCH_IN_RADIUS_DISPLAY_CAP_SLIDER_MAX,
  SEARCH_IN_RADIUS_DISPLAY_CAP_SLIDER_MIN,
  SEARCH_IN_RADIUS_DISPLAY_CAP_SLIDER_STEP,
} from "./search-in-radius-display-cap";

/** Minimum structure-age threshold (years) for the HUD filter slider. */
export const MIN_STRUCTURE_AGE_YEARS_SLIDER_MIN = 10;

/** Maximum structure-age threshold (years) for the HUD filter slider. */
export const MIN_STRUCTURE_AGE_YEARS_SLIDER_MAX = 30;

/** Minimum open-permit duration (years) for the HUD filter slider. */
export const MIN_OPEN_PERMIT_YEARS_SLIDER_MIN = 1;

/** Maximum open-permit duration (years) for the HUD filter slider. */
export const MIN_OPEN_PERMIT_YEARS_SLIDER_MAX = 15;

/**
 * Props for the HUD property filter form (roof-age proxy + long-open permits).
 */
export interface MapSearchPropertyFiltersFormProps {
  agingRoofLayerEnabled: boolean;
  minStructureAgeYears: number;
  propertyPermitLayerEnabled: boolean;
  minOpenPermitYears: number;
  structureYearUnavailableOnTable: boolean;
  /** True while permit rows are loading for visible radius candidates. */
  permitLayerScanPending?: boolean;
  onAgingRoofLayerEnabledChange: (enabled: boolean) => void;
  onMinStructureAgeYearsChange: (years: number) => void;
  onPropertyPermitLayerEnabledChange: (enabled: boolean) => void;
  onMinOpenPermitYearsChange: (years: number) => void;
  /** Max candidates rendered on the map + list; omit to hide the control. */
  searchInRadiusDisplayCap?: number;
  onSearchInRadiusDisplayCapChange?: (displayCap: number) => void;
}

/**
 * Inline HUD form for roof-age and long-open permit filters.
 */
export function MapSearchPropertyFiltersForm({
  agingRoofLayerEnabled,
  minStructureAgeYears,
  propertyPermitLayerEnabled,
  minOpenPermitYears,
  structureYearUnavailableOnTable,
  permitLayerScanPending = false,
  onAgingRoofLayerEnabledChange,
  onMinStructureAgeYearsChange,
  onPropertyPermitLayerEnabledChange,
  onMinOpenPermitYearsChange,
  searchInRadiusDisplayCap,
  onSearchInRadiusDisplayCapChange,
}: MapSearchPropertyFiltersFormProps): JSX.Element {
  const agingRoofLabel = resolveAgingRoofLayerLabel(minStructureAgeYears);
  const permitLayerLabel = formatPropertyPermitLayerFilterLabel(minOpenPermitYears);

  return (
    <div className="flex flex-col gap-3" data-testid="map-search-property-filters-form">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <AgingRoofLayerControl
            agingRoofLayerEnabled={agingRoofLayerEnabled}
            onAgingRoofLayerEnabledChange={onAgingRoofLayerEnabledChange}
          />
          <Label
            id="min-structure-age-years-label"
            htmlFor="aging-roof-layer"
            className="cursor-pointer text-[0.65rem] leading-snug font-normal text-muted-foreground"
          >
            {agingRoofLabel}
          </Label>
        </div>
        {structureYearUnavailableOnTable ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="aging-roof-year-unavailable-chip"
          >
            {AGING_ROOF_STRUCTURE_YEAR_UNAVAILABLE_CHIP_COPY}
          </p>
        ) : null}
        <div
          className={
            !agingRoofLayerEnabled || structureYearUnavailableOnTable
              ? "pointer-events-none opacity-50"
              : undefined
          }
        >
          <Slider
            className="plat-radius-slider w-full"
            min={MIN_STRUCTURE_AGE_YEARS_SLIDER_MIN}
            max={MIN_STRUCTURE_AGE_YEARS_SLIDER_MAX}
            step={1}
            value={[minStructureAgeYears]}
            disabled={!agingRoofLayerEnabled || structureYearUnavailableOnTable}
            onValueChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              if (typeof next === "number") {
                onMinStructureAgeYearsChange(next);
              }
            }}
            aria-labelledby="min-structure-age-years-label"
            aria-valuetext={`${String(minStructureAgeYears)} years`}
            data-testid="min-structure-age-years-slider"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <PropertyPermitLayerControl
            propertyPermitLayerEnabled={propertyPermitLayerEnabled}
            describedBy="property-permit-layer-helper"
            onPropertyPermitLayerEnabledChange={onPropertyPermitLayerEnabledChange}
          />
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Label
              id="min-open-permit-years-label"
              htmlFor="property-permit-layer"
              className="cursor-pointer text-[0.65rem] leading-snug font-normal text-muted-foreground"
            >
              {permitLayerLabel}
            </Label>
            {permitLayerScanPending ? (
              <Spinner
                className="size-3 shrink-0 text-muted-foreground motion-reduce:animate-none"
                data-testid="permit-layer-scan-pending"
              />
            ) : null}
          </div>
        </div>
        <p id="property-permit-layer-helper" className="sr-only">
          Lee may show none until permits publish — honest empty is expected.
        </p>
        <div
          className={
            !propertyPermitLayerEnabled ? "pointer-events-none opacity-50" : undefined
          }
        >
          <Slider
            className="plat-radius-slider w-full"
            min={MIN_OPEN_PERMIT_YEARS_SLIDER_MIN}
            max={MIN_OPEN_PERMIT_YEARS_SLIDER_MAX}
            step={1}
            value={[minOpenPermitYears]}
            disabled={!propertyPermitLayerEnabled}
            onValueChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              if (typeof next === "number") {
                onMinOpenPermitYearsChange(next);
              }
            }}
            aria-labelledby="min-open-permit-years-label"
            aria-valuetext={`${String(minOpenPermitYears)} years`}
            data-testid="min-open-permit-years-slider"
          />
        </div>
      </div>

      {searchInRadiusDisplayCap !== undefined &&
      onSearchInRadiusDisplayCapChange !== undefined ? (
        <div className="flex flex-col gap-1.5">
          <Label
            id="search-in-radius-display-cap-label"
            className="text-[0.65rem] leading-snug font-normal text-muted-foreground"
          >
            Show up to {searchInRadiusDisplayCap} roofs
          </Label>
          <Slider
            className="plat-radius-slider w-full"
            min={SEARCH_IN_RADIUS_DISPLAY_CAP_SLIDER_MIN}
            max={SEARCH_IN_RADIUS_DISPLAY_CAP_SLIDER_MAX}
            step={SEARCH_IN_RADIUS_DISPLAY_CAP_SLIDER_STEP}
            value={[searchInRadiusDisplayCap]}
            onValueChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              if (typeof next === "number") {
                onSearchInRadiusDisplayCapChange(next);
              }
            }}
            aria-labelledby="search-in-radius-display-cap-label"
            aria-valuetext={`${String(searchInRadiusDisplayCap)} roofs`}
            data-testid="search-in-radius-display-cap-slider"
          />
        </div>
      ) : null}
    </div>
  );
}
