import type { JSX } from "react";

import { cn } from "@/lib/utils";
import {
  resolveCoverageModeBannerCopy,
  type CoverageMode,
} from "./coverage-mode-banner-copy";

/**
 * Where the coverage sentence or Lee map stamp is placed.
 *
 * Chip is the readable title-block sentence under the h1. Stamp stays on the map as
 * secondary texture and does not replace the header copy.
 */
export type CoverageModeBannerPlacement = "chip" | "stamp";

/**
 * Props for coverage honesty: title-block sentence under the h1, or Lee stamp on the map.
 */
export interface CoverageModeBannerProps {
  /** Catalog-derived coverage mode from counties.defaultCounty. */
  coverageMode: CoverageMode;
  /** Extra classes for HUD stamp or sheet title-block placement. */
  className?: string;
  /** Header sentence (default) or decorative Lee map stamp. */
  placement?: CoverageModeBannerPlacement;
}

const COVERAGE_CHIP_CLASS_NAME =
  "max-w-full text-left font-heading text-[0.65rem] font-semibold leading-snug tracking-wide text-muted-foreground uppercase";

/**
 * Coverage honesty chrome.
 *
 * The chip is a visible sentence under the territory heading. Lee also keeps
 * a rubber stamp on the map as secondary texture. Chester and Montgomery copy
 * still sits under the doors-sheet title.
 */
export function CoverageModeBanner({
  coverageMode,
  className,
  placement = "chip",
}: CoverageModeBannerProps): JSX.Element {
  const copy = resolveCoverageModeBannerCopy(coverageMode);

  if (placement === "stamp" && coverageMode === "lee_dev_fallback") {
    return (
      <span
        role="status"
        data-testid="coverage-mode-banner"
        data-coverage-mode={coverageMode}
        data-placement={placement}
        aria-live="polite"
        className={cn("inline-flex shrink-0 items-center", className)}
      >
        <img
          src="/plat/stamp-chester.png"
          alt=""
          width={80}
          height={80}
          className="size-20 object-contain mix-blend-multiply rotate-[-7deg]"
        />
        <span className="sr-only">{copy}</span>
      </span>
    );
  }

  return (
    <p
      role="status"
      data-testid="coverage-mode-banner"
      data-coverage-mode={coverageMode}
      data-placement="chip"
      aria-live="polite"
      className={cn(COVERAGE_CHIP_CLASS_NAME, className)}
    >
      {copy}
    </p>
  );
}
