/**
 * Design tests for plat roof markers on the map.
 */
import { describe, expect, it } from "vitest";

import { createPlatRoofMarkerElement } from "../../src/map/create-plat-roof-marker-element";
import { triggerPlatRoofMarkerFocusBounce } from "../../src/map/trigger-plat-roof-marker-focus-bounce";

describe("plat roof marker", () => {
  it("renders a house mark instead of an ink dot", () => {
    // Given an unselected prospect roof marker
    const marker = createPlatRoofMarkerElement({ isSelected: false });

    // Then the element reads as an interactive house mark, not a bare dot
    expect(marker.className).toBe("plat-roof-marker");
    expect(marker.getAttribute("role")).toBe("button");
    expect(marker.querySelector("svg")).toBeTruthy();
  });

  it("createPlatRoofMarkerElement({ isSelected: false }) has undefined dataset.selected", () => {
    // Given an unselected roof marker built with CreatePlatRoofMarkerElementOptions
    const marker = createPlatRoofMarkerElement({ isSelected: false });

    // Then the marker does not advertise a selected state on the element
    expect(marker.dataset.selected).toBeUndefined();
  });

  it("createPlatRoofMarkerElement({ isSelected: true }) has dataset.selected true", () => {
    // Given the open roof in the radius
    const marker = createPlatRoofMarkerElement({ isSelected: true });

    // Then the marker exposes selected state for scale emphasis (color unchanged for prospects)
    expect(marker.dataset.selected).toBe("true");
  });

  it("selected marker sets aria-current true", () => {
    // Given the roof the user has opened in the drawer
    const marker = createPlatRoofMarkerElement({ isSelected: true });

    // Then assistive tech can identify the current roof in the list
    expect(marker.getAttribute("aria-current")).toBe("true");
  });

  it("prospect markers expose roof-age band metadata", () => {
    const marker = createPlatRoofMarkerElement({
      isSelected: false,
      ageBand: "age-40-to-49",
    });

    expect(marker.dataset.ageBand).toBe("age-40-to-49");
    expect(marker.dataset.leadState).toBeUndefined();
  });

  it("saved leads keep lead-state styling over age bands", () => {
    const marker = createPlatRoofMarkerElement({
      isSelected: false,
      leadState: "lead",
      ageBand: "age-50-plus",
    });

    expect(marker.dataset.leadState).toBe("lead");
    expect(marker.dataset.ageBand).toBeUndefined();
  });

  it("focus bounce applies a transient motion class on selection", () => {
    const marker = createPlatRoofMarkerElement({ isSelected: true });

    triggerPlatRoofMarkerFocusBounce(marker);

    expect(
      marker.classList.contains("plat-roof-marker--focus-bounce") ||
        marker.classList.contains("plat-roof-marker--focus-bounce-reduced"),
    ).toBe(true);
  });
});
