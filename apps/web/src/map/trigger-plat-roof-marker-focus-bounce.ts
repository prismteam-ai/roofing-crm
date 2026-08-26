const PLAT_ROOF_MARKER_FOCUS_BOUNCE_CLASS = "plat-roof-marker--focus-bounce";
const PLAT_ROOF_MARKER_FOCUS_BOUNCE_REDUCED_CLASS =
  "plat-roof-marker--focus-bounce-reduced";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Plays a bounded focus cue on the selected roof marker — two vertical bounces
 * by default, or an ink pulse when the user prefers reduced motion.
 */
export function triggerPlatRoofMarkerFocusBounce(
  element: HTMLElement | null | undefined,
): void {
  if (element === null || element === undefined) {
    return;
  }

  element.classList.remove(
    PLAT_ROOF_MARKER_FOCUS_BOUNCE_CLASS,
    PLAT_ROOF_MARKER_FOCUS_BOUNCE_REDUCED_CLASS,
  );
  void element.offsetWidth;

  element.classList.add(
    prefersReducedMotion()
      ? PLAT_ROOF_MARKER_FOCUS_BOUNCE_REDUCED_CLASS
      : PLAT_ROOF_MARKER_FOCUS_BOUNCE_CLASS,
  );

  const handleAnimationEnd = (): void => {
    element.classList.remove(
      PLAT_ROOF_MARKER_FOCUS_BOUNCE_CLASS,
      PLAT_ROOF_MARKER_FOCUS_BOUNCE_REDUCED_CLASS,
    );
    element.removeEventListener("animationend", handleAnimationEnd);
  };

  element.addEventListener("animationend", handleAnimationEnd);
}
