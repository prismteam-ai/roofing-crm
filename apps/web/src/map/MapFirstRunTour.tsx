/**
 * Three-step first-run tour anchored to real plat HUD controls.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type JSX,
  type RefObject,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  MAP_FIRST_RUN_TOUR_STEPS,
  MAP_FIRST_RUN_TOUR_STORAGE_KEY,
  type MapFirstRunTourStepId,
} from "./map-first-run-tour-copy";

export interface MapFirstRunTourAnchorRefs {
  pinHandle: RefObject<HTMLElement | null>;
  radiusChip: RefObject<HTMLElement | null>;
  doorsHeading: RefObject<HTMLElement | null>;
}

export interface MapFirstRunTourProps {
  anchorRefs: MapFirstRunTourAnchorRefs;
}

function readTourCompleted(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    return window.localStorage.getItem(MAP_FIRST_RUN_TOUR_STORAGE_KEY) === "done";
  } catch {
    return true;
  }
}

function writeTourCompleted(): void {
  try {
    window.localStorage.setItem(MAP_FIRST_RUN_TOUR_STORAGE_KEY, "done");
  } catch {
    // ignore quota / private mode
  }
}

function resolveAnchorElement(
  stepId: MapFirstRunTourStepId,
  anchorRefs: MapFirstRunTourAnchorRefs,
): HTMLElement | null {
  switch (stepId) {
    case "pin":
      return anchorRefs.pinHandle.current;
    case "radius":
      return anchorRefs.radiusChip.current;
    case "doors":
      return anchorRefs.doorsHeading.current;
  }
}

/**
 * Skippable HUD popovers for first-time operators (once per browser).
 */
export function MapFirstRunTour({
  anchorRefs,
}: MapFirstRunTourProps): JSX.Element | null {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [cardStyle, setCardStyle] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!readTourCompleted()) {
      setActive(true);
    }
  }, []);

  const step = MAP_FIRST_RUN_TOUR_STEPS[stepIndex];

  const dismissTour = useCallback(() => {
    writeTourCompleted();
    setActive(false);
  }, []);

  const positionCard = useCallback(() => {
    if (!active || step === undefined) {
      setCardStyle(null);
      return;
    }
    const anchor = resolveAnchorElement(step.id, anchorRefs);
    if (anchor === null) {
      setCardStyle(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const cardWidth = 272;
    /** Approximate card height so bottom-HUD anchors stay on-screen. */
    const estimatedCardHeight = 140;
    const gap = 12;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - cardWidth - 12);
    // Prefer above the anchor (pin + bottom HUD radius/doors). Fall below
    // only when there is not enough room above.
    const aboveTop = rect.top - gap - estimatedCardHeight;
    const belowTop = rect.bottom + gap;
    const top =
      aboveTop >= 12
        ? aboveTop
        : Math.min(belowTop, window.innerHeight - estimatedCardHeight - 12);
    setCardStyle({ top: Math.max(12, top), left });
  }, [active, anchorRefs, step]);

  useLayoutEffect(() => {
    positionCard();
  }, [positionCard, stepIndex]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const onLayout = (): void => {
      positionCard();
    };
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [active, positionCard]);

  if (!active || step === undefined || cardStyle === null) {
    return null;
  }

  const isLastStep = stepIndex >= MAP_FIRST_RUN_TOUR_STEPS.length - 1;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40"
      data-testid="map-first-run-tour"
    >
      <div
        className={cn(
          "pointer-events-auto absolute w-[min(17rem,calc(100vw-1.5rem))] rounded-sm border border-foreground/50 bg-[color:var(--color-card)]/98 bg-[url('/plat/linen-tooth.png')] bg-repeat p-3 shadow-md",
          step.id === "doors" && "md:translate-x-0",
        )}
        style={{
          top: cardStyle.top,
          left: cardStyle.left,
        }}
        role="dialog"
        aria-labelledby={`map-first-run-tour-heading-${step.id}`}
        data-testid={`map-first-run-tour-step-${step.id}`}
      >
        <p
          id={`map-first-run-tour-heading-${step.id}`}
          className="font-heading text-sm font-semibold tracking-wide"
        >
          {step.heading}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/80">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            {stepIndex + 1} of {MAP_FIRST_RUN_TOUR_STEPS.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="rounded-sm"
              data-testid="map-first-run-tour-skip"
              onClick={dismissTour}
            >
              Skip
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="rounded-sm font-heading"
              data-testid="map-first-run-tour-next"
              onClick={() => {
                if (isLastStep) {
                  dismissTour();
                  return;
                }
                setStepIndex((index) => index + 1);
              }}
            >
              {isLastStep ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Test helper: clears the tour completion flag. */
export function resetMapFirstRunTourForTests(): void {
  try {
    window.localStorage.removeItem(MAP_FIRST_RUN_TOUR_STORAGE_KEY);
  } catch {
    // ignore
  }
}
