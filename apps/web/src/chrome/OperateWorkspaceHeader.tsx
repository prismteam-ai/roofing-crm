/**
 * Operate workspace title block: brand stamp, territory heading, coverage sentence.
 *
 * The coverage chip stacks under the h1 while the county listbox is open.
 */
import type { JSX } from "react";
import { Target } from "lucide-react";

import { CoverageModeBanner } from "./CoverageModeBanner";
import type { CoverageMode } from "./coverage-mode-banner-copy";
import {
  TerritoryCountyCatalogPicker,
  type TerritoryCountyCatalogPickerProps,
} from "./TerritoryCountyCatalogPicker";

/**
 * Props for the operate workspace header title block.
 */
export interface OperateWorkspaceHeaderProps extends TerritoryCountyCatalogPickerProps {
  operatorLede: string;
  coverageMode: CoverageMode | null;
}

/**
 * RoofRadar header with the county picker and a visible coverage sentence.
 */
export function OperateWorkspaceHeader({
  operatorLede,
  publishedCountyCatalogListItems,
  selectedCountyKey,
  onSelectedCountyKeyChange,
  coverageMode,
}: OperateWorkspaceHeaderProps): JSX.Element {
  return (
    <header
      data-testid="operate-workspace-header"
      className="relative z-20 flex items-center justify-between gap-x-4 border-b border-foreground/70 bg-[url('/plat/linen-tooth.png')] bg-repeat px-3 py-2"
    >
      <div className="min-w-0">
        <p
          data-testid="roof-radar-brand"
          className="font-heading m-0 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto] items-center gap-x-2 gap-y-0.5 text-[1.35rem] leading-none font-bold tracking-[0.08em] text-foreground uppercase"
        >
          <span
            aria-hidden="true"
            className="row-span-2 flex size-7 items-center justify-center"
          >
            <Target className="size-4 shrink-0" strokeWidth={2.25} />
          </span>
          <span>RoofRadar</span>
          <span
            className="min-w-0 text-[0.65rem] font-semibold leading-snug tracking-wide text-muted-foreground"
            data-testid="shell-operator-lede"
          >
            {operatorLede}
          </span>
        </p>
      </div>
      <div className="flex min-w-0 max-w-full flex-col items-start justify-center gap-y-0.5">
        <h1 className="m-0 shrink-0">
          <TerritoryCountyCatalogPicker
            publishedCountyCatalogListItems={publishedCountyCatalogListItems}
            selectedCountyKey={selectedCountyKey}
            onSelectedCountyKeyChange={onSelectedCountyKeyChange}
          />
        </h1>
        {coverageMode !== null ? (
          <CoverageModeBanner coverageMode={coverageMode} className="max-w-[12rem]" />
        ) : null}
      </div>
    </header>
  );
}
