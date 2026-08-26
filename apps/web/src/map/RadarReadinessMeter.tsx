/**
 * Plat HUD meter while hosted radius search warms.
 */
import { useEffect, useState, type JSX, type TransitionEvent } from "react";

import {
  RADAR_READINESS_READY_COPY,
  RADAR_READINESS_RELEASED_COPY,
  RADAR_READINESS_STARTING_COPY,
} from "./radar-readiness-copy";
import type { SearchInRadiusWarmupPhase } from "./search-in-radius-warmup";

export interface RadarReadinessMeterProps {
  phase: SearchInRadiusWarmupPhase;
  progressPercent: number;
  pinDropped: boolean;
}

type RadarReadinessMeterVisibility = "hidden" | "open" | "collapsing";

function resolveRadarReadinessStatusCopy(
  phase: SearchInRadiusWarmupPhase,
  pinDropped: boolean,
): string {
  if (phase === "warming") {
    return RADAR_READINESS_STARTING_COPY;
  }
  if (phase === "ready") {
    return pinDropped ? RADAR_READINESS_READY_COPY : RADAR_READINESS_READY_COPY;
  }
  if (phase === "released") {
    return RADAR_READINESS_RELEASED_COPY;
  }
  return RADAR_READINESS_STARTING_COPY;
}

/** Duration must match `.plat-radar-readiness-reveal` in index.css. */
const RADAR_READINESS_COLLAPSE_MS = 220;

function resolveInitialVisibility(
  phase: SearchInRadiusWarmupPhase,
): RadarReadinessMeterVisibility {
  return phase === "warming" ? "open" : "hidden";
}

/**
 * Honest warmup meter for the search-filters HUD (not a decorative ring).
 */
export function RadarReadinessMeter({
  phase,
  progressPercent,
  pinDropped,
}: RadarReadinessMeterProps): JSX.Element | null {
  const [visibility, setVisibility] = useState<RadarReadinessMeterVisibility>(() =>
    resolveInitialVisibility(phase),
  );

  useEffect(() => {
    if (phase === "warming") {
      setVisibility("open");
      return;
    }
    if (phase === "ready" || phase === "released") {
      setVisibility((current) => (current === "open" ? "collapsing" : current));
      return;
    }
    setVisibility("hidden");
  }, [phase]);

  useEffect(() => {
    if (visibility !== "collapsing") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setVisibility("hidden");
    }, RADAR_READINESS_COLLAPSE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [visibility]);

  const handleRevealTransitionEnd = (event: TransitionEvent<HTMLDivElement>): void => {
    if (event.propertyName !== "grid-template-rows") {
      return;
    }
    if (event.currentTarget !== event.target) {
      return;
    }
    if (visibility === "collapsing") {
      setVisibility("hidden");
    }
  };

  if (visibility === "hidden") {
    return null;
  }

  const statusCopy = resolveRadarReadinessStatusCopy(phase, pinDropped);
  const isOpen = visibility === "open";

  return (
    <div
      className="plat-radar-readiness-reveal pointer-events-auto w-full max-w-[min(17rem,calc(100vw-6.5rem))]"
      data-open={isOpen ? "true" : "false"}
      onTransitionEnd={handleRevealTransitionEnd}
    >
      <div>
        <div
          className="rounded-sm border border-foreground/40 bg-[color:var(--color-card)]/95 px-2.5 py-2"
          role="status"
          aria-live="polite"
          data-testid="radar-readiness-meter"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs leading-snug text-foreground/90">{statusCopy}</p>
            <span className="font-heading text-xs tabular-nums text-muted-foreground">
              {progressPercent}%
            </span>
          </div>
          <div
            className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/10"
            aria-hidden="true"
          >
            <div
              className="h-full bg-foreground transition-[width] duration-300 ease-out"
              style={{ width: `${String(progressPercent)}%` }}
              data-testid="radar-readiness-meter-fill"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
