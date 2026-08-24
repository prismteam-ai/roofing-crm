/**
 * Design tests for the aging-roof layer chrome (structure-year / roof-age proxy).
 *
 * MapLibre is stubbed; asserts honest label wording and toggle affordance.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  formatAgingRoofLayerLabel,
  resolveAgingRoofLayerLabel,
} from "../../src/map/aging-roof-layer-label";
import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";

afterEach(() => {
  cleanup();
});

/**
 * Stub canvas so jsdom never loads MapLibre GL.
 */
function StubMapLibreMapCanvas(props: MapLibreMapCanvasProps): ReactElement {
  return createElement(
    "button",
    {
      type: "button",
      "data-testid": "map-pin-drop",
      onClick: () => {
        props.onSearchMapCenterDrop({
          latitude: props.mapViewCenter.latitude,
          longitude: props.mapViewCenter.longitude,
        });
      },
    },
    "Drop pin",
  );
}

function dropSearchPin(): void {
  fireEvent.click(screen.getByTestId("map-pin-drop"));
}

function openMapSearchFilterHud(): void {
  fireEvent.click(screen.getByTestId("map-search-filter-hud-toggle"));
}

describe("Aging-roof layer design", () => {
  // Given the default structure-age threshold of 15 years in UTC 2026
  // When the aging-roof label is formatted
  // Then copy names the cutoff year and roof-age proxy wording
  it("label includes roof-age proxy wording", () => {
    const label = formatAgingRoofLayerLabel({
      currentUtcYear: 2026,
      minStructureAgeYears: 15,
    });

    expect(label).toBe("Structure built before 2011 (roof-age proxy)");
    expect(label).toMatch(/roof-age proxy/i);
    expect(label).toMatch(/structure built before/i);
    expect(label).not.toMatch(/roof installed/i);
  });

  // Given the map search shell mounts for Lee fallback
  // When aging-roof chrome renders
  // Then the control shows the proxy label and is checked by default
  it("renders an aging-roof control with structure-year proxy label", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    openMapSearchFilterHud();

    const expectedLabel = resolveAgingRoofLayerLabel(15);
    const checkbox = screen.getByRole("checkbox", {
      name: new RegExp(expectedLabel.replace(/[()]/g, "\\$&"), "i"),
    });

    expect(checkbox).toBeTruthy();
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByTestId("map-search-property-filters-form").textContent,
    ).toContain("roof-age proxy");
  });

  // Given the aging-roof layer is enabled
  // When the user unchecks the control
  // Then the checkbox reflects the disabled layer state
  it("toggles the aging-roof layer checkbox", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    openMapSearchFilterHud();

    const checkbox = screen.getByRole("checkbox", {
      name: /structure built before/i,
    });

    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
  });
  // Given mixed search results including a parcel with no structure year
  // When the aging-roof layer stays on
  // Then the null built_year row is hidden (not treated as an old roof)
  it("hides parcels with no published built year when the aging-roof layer is on", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [
          {
            propertyId: "lee-prop-old",
            parcelIdentifier: "old",
            latitude: 26.64,
            longitude: -81.87,
            builtYear: 1988,
            addressStreet: "1 Palm",
            addressCity: "Fort Myers",
            gisMuni: null,
            distanceMiles: 0.2,
          },
          {
            propertyId: "lee-prop-unknown-year",
            parcelIdentifier: "unknown",
            latitude: 26.65,
            longitude: -81.86,
            builtYear: null,
            addressStreet: "2 New",
            addressCity: "Fort Myers",
            gisMuni: null,
            distanceMiles: 0.4,
          },
        ],
      }),
    );
    dropSearchPin();

    expect(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-old"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("search-in-radius-candidate-row-lee-prop-unknown-year"),
    ).toBeNull();

    openMapSearchFilterHud();

    const checkbox = screen.getByRole("checkbox", {
      name: /structure built before/i,
    }) as HTMLInputElement;
    fireEvent.click(checkbox);

    expect(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-unknown-year"),
    ).toBeTruthy();
  });

  // Given mixed search results including a parcel the year filter hides
  // When the aging-roof layer stays on
  // Then a chip names how many doors are hidden and restores them on click
  it("shows a hidden-doors chip that turns the year filter off", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [
          {
            propertyId: "lee-prop-old",
            parcelIdentifier: "old",
            latitude: 26.64,
            longitude: -81.87,
            builtYear: 1988,
            addressStreet: "1 Palm",
            addressCity: "Fort Myers",
            gisMuni: null,
            distanceMiles: 0.2,
          },
          {
            propertyId: "lee-prop-unknown-year",
            parcelIdentifier: "unknown",
            latitude: 26.65,
            longitude: -81.86,
            builtYear: null,
            addressStreet: "2 New",
            addressCity: "Fort Myers",
            gisMuni: null,
            distanceMiles: 0.4,
          },
        ],
      }),
    );
    dropSearchPin();

    const hiddenChip = screen.getByTestId("aging-roof-hidden-count");
    expect(hiddenChip.textContent).toBe("1 roof hidden");

    fireEvent.click(hiddenChip);

    expect(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-unknown-year"),
    ).toBeTruthy();
    expect(screen.queryByTestId("aging-roof-hidden-count")).toBeNull();
  });

  // Given only parcels with no published structure year on the query table
  // When the aging-roof layer stays on
  // Then all rows stay visible and the year-unavailable chip explains why
  it("shows all parcels when every built year is null on the table", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "chester",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [
          {
            propertyId: "chester-prop-unknown-year",
            parcelIdentifier: "unknown",
            latitude: 39.96,
            longitude: -75.6,
            builtYear: null,
            addressStreet: "219 LACEY ST",
            addressCity: "WEST CHESTER, PA",
            gisMuni: null,
            distanceMiles: 0.4,
          },
        ],
      }),
    );
    dropSearchPin();

    openMapSearchFilterHud();
    expect(screen.getByTestId("aging-roof-year-unavailable-chip").textContent).toBe(
      "Year not published on this surface",
    );
    expect(
      screen.getByTestId("search-in-radius-candidate-row-chester-prop-unknown-year"),
    ).toBeTruthy();
    expect(screen.queryByTestId("search-in-radius-candidate-list-empty")).toBeNull();
  });

  it("shows structure-age and permit duration sliders in the HUD filter form", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    openMapSearchFilterHud();

    expect(
      screen
        .getByTestId("min-structure-age-years-slider")
        .getAttribute("aria-valuetext"),
    ).toBe("15 years");
    expect(
      screen.getByTestId("min-open-permit-years-slider").getAttribute("aria-valuetext"),
    ).toBe("5 years");
  });
});
