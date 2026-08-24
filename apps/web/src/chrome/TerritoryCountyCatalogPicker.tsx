/**
 * Territory heading that opens a filterable list of published catalog counties.
 *
 * Selecting a county notifies the shell so the map pin recenters with the
 * current radius. Keys come only from counties.list (or the Lee fallback).
 */
import { useEffect, useId, useMemo, useRef, useState, type JSX } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  filterPublishedCountyCatalogListItems,
  formatTerritoryCountyHeading,
  type PublishedCountyCatalogListItem,
} from "./published-county-catalog-list-item";

/** Quiet picker-row note when a county is listed but not searchable on the map. */
const TERRITORY_COUNTY_NOT_MAP_READY_NOTE = "not on the published map yet";

/**
 * Props for the territory county catalog picker in the title block.
 */
export interface TerritoryCountyCatalogPickerProps {
  publishedCountyCatalogListItems: PublishedCountyCatalogListItem[];
  selectedCountyKey: string;
  onSelectedCountyKeyChange: (countyKey: string) => void;
}

/**
 * Clickable territory heading with a filterable county listbox.
 */
export function TerritoryCountyCatalogPicker({
  publishedCountyCatalogListItems,
  selectedCountyKey,
  onSelectedCountyKeyChange,
}: TerritoryCountyCatalogPickerProps): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [countyFilterQuery, setCountyFilterQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const filterInputId = useId();

  const selectedItem =
    publishedCountyCatalogListItems.find(
      (item) => item.countyKey === selectedCountyKey,
    ) ?? publishedCountyCatalogListItems[0];

  // An empty catalog list means counties.list has not answered yet — never
  // claim a county (Lee or otherwise) before the catalog names one.
  const heading = selectedItem
    ? formatTerritoryCountyHeading(selectedItem)
    : "Locating territory…";

  const filteredItems = useMemo(
    () =>
      filterPublishedCountyCatalogListItems(
        publishedCountyCatalogListItems,
        countyFilterQuery,
      ),
    [countyFilterQuery, publishedCountyCatalogListItems],
  );

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    filterInputRef.current?.focus();
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const container = containerRef.current;
      if (container === null || event.target instanceof Node === false) {
        return;
      }
      if (!container.contains(event.target)) {
        setPickerOpen(false);
        setCountyFilterQuery("");
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPickerOpen(false);
        setCountyFilterQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        className="font-heading inline-flex shrink-0 items-baseline gap-1 text-[1.45rem] leading-none font-bold tracking-[0.04em] text-foreground uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        aria-haspopup="listbox"
        aria-expanded={pickerOpen}
        aria-controls={listboxId}
        aria-label={`Change served county. Current: ${heading}`}
        data-testid="territory-county-catalog-picker"
        onClick={() => {
          setPickerOpen((open) => {
            const nextOpen = !open;
            if (!nextOpen) {
              setCountyFilterQuery("");
            }
            return nextOpen;
          });
        }}
      >
        <span>{heading}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-foreground/70 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            pickerOpen && "rotate-180",
          )}
        />
      </button>
      <div
        className="plat-dropdown absolute top-full right-0 z-50 mt-1.5 w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-sm border border-foreground/50 bg-[color:var(--color-card)]/95 bg-[url('/plat/linen-tooth.png')] bg-repeat p-2"
        data-open={pickerOpen}
        inert={!pickerOpen}
        aria-hidden={!pickerOpen}
        role="presentation"
      >
        <label className="sr-only" htmlFor={filterInputId}>
          Filter published counties
        </label>
        <input
          ref={filterInputRef}
          id={filterInputId}
          type="search"
          value={countyFilterQuery}
          onChange={(event) => {
            setCountyFilterQuery(event.target.value);
          }}
          placeholder="Filter counties"
          autoComplete="off"
          data-testid="territory-county-catalog-filter"
          className="mb-1.5 w-full rounded-sm border border-foreground/40 bg-transparent px-2 py-1 font-heading text-xs tracking-wide text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Published counties"
          className="max-h-56 overflow-y-auto"
        >
          {filteredItems.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">
              No published counties match.
            </li>
          ) : (
            filteredItems.map((item) => {
              const selected = item.countyKey === selectedCountyKey;
              return (
                <li key={item.countyKey} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className="flex w-full flex-col gap-0.5 px-2 py-1.5 text-left font-heading text-xs font-semibold tracking-wide text-foreground uppercase hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:outline-none"
                    onClick={() => {
                      onSelectedCountyKeyChange(item.countyKey);
                      setPickerOpen(false);
                      setCountyFilterQuery("");
                    }}
                  >
                    <span>{formatTerritoryCountyHeading(item)}</span>
                    {item.mapSearchReady === false ? (
                      <span className="font-normal text-[0.65rem] leading-snug tracking-wide text-muted-foreground uppercase">
                        {TERRITORY_COUNTY_NOT_MAP_READY_NOTE}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
