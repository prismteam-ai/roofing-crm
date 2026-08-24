import type { JSX } from "react";

import { cn } from "@/lib/utils";
import { PLAT_ROOF_MARKER_AGE_BANDS } from "./plat-roof-marker-age-band";

export interface RoofAgeLegendProps {
  className?: string;
}

/**
 * Compact floating reference for prospect roof marker age coloring.
 */
export function RoofAgeLegend({ className }: RoofAgeLegendProps): JSX.Element {
  return (
    <div
      className={cn(
        "pointer-events-none flex w-full items-center gap-1.5 rounded-sm border border-foreground/50 bg-[color:var(--color-card)]/95 bg-[url('/plat/linen-tooth.png')] bg-repeat px-2 py-1 shadow-sm",
        className,
      )}
      data-testid="roof-age-legend"
      role="img"
      aria-label="Roof age color key: lighter is newer, darker is older"
    >
      <span className="shrink-0 font-heading text-[0.55rem] font-bold tracking-wider text-muted-foreground uppercase">
        Roof age
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="shrink-0 text-[0.55rem] text-muted-foreground">new</span>
        <div
          className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-[1px] border border-foreground/40"
          aria-hidden="true"
        >
          {PLAT_ROOF_MARKER_AGE_BANDS.map((band) => (
            <span
              key={band.id}
              className="min-w-0 flex-1"
              style={{ backgroundColor: band.color }}
              title={band.label}
            />
          ))}
        </div>
        <span className="shrink-0 text-[0.55rem] text-muted-foreground">50+</span>
      </div>
    </div>
  );
}
