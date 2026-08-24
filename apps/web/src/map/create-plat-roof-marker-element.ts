/**
 * Plat house marks for roofs in the radius.
 *
 * A 7px ink dot does not read as a prospect. The house is geometry (gable +
 * walls), not illustration: linen fill for unselected prospects, ring blue for
 * saved leads, muted ink for archived. Selection scales the mark only; color
 * stays prospect linen until the roof is saved as a lead.
 */
import type { PlatRoofMarkerLeadState } from "./plat-roof-marker-lead-state";
import type { PlatRoofMarkerAgeBandId } from "./plat-roof-marker-age-band";

const PLAT_ROOF_MARKER_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M3.2 11.1 12 3.5l8.8 7.6V20.6H15.1v-6.3H8.9v6.3H3.2Z"
      fill="currentColor"
      stroke="#2c2a26"
      stroke-width="1.6"
      stroke-linejoin="miter"
    />
  </svg>
`;

/**
 * Props for one plat roof marker element.
 */
export interface CreatePlatRoofMarkerElementOptions {
  isSelected: boolean;
  leadState?: PlatRoofMarkerLeadState;
  /** Prospect-only roof-age band; ignored when leadState is lead or archived. */
  ageBand?: PlatRoofMarkerAgeBandId;
}

/**
 * Builds the MapLibre marker element for one roof in the radius.
 */
export function createPlatRoofMarkerElement({
  isSelected,
  leadState = "prospect",
  ageBand,
}: CreatePlatRoofMarkerElementOptions): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "plat-roof-marker";
  element.setAttribute("role", "button");
  if (isSelected) {
    element.dataset.selected = "true";
    element.setAttribute("aria-current", "true");
  }
  if (leadState !== "prospect") {
    element.dataset.leadState = leadState;
  } else if (ageBand !== undefined) {
    element.dataset.ageBand = ageBand;
  }
  element.innerHTML = PLAT_ROOF_MARKER_SVG;
  return element;
}
