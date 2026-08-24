/**
 * Design tests: pin and radius clip injected parcels with Haversine.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";
import type { SearchInRadiusCandidate } from "../../src/map/SearchInRadiusCandidateList";

afterEach(() => {
  cleanup();
});

function StubMapLibreMapCanvas(props: MapLibreMapCanvasProps): ReactElement {
  return createElement("div", null, [
    createElement(
      "button",
      {
        key: "lee",
        type: "button",
        "data-testid": "map-pin-drop-lee",
        onClick: () => {
          props.onSearchMapCenterDrop({
            latitude: 26.6406,
            longitude: -81.8723,
          });
        },
      },
      "Drop Lee pin",
    ),
    createElement(
      "button",
      {
        key: "far",
        type: "button",
        "data-testid": "map-pin-drop",
        onClick: () => {
          props.onSearchMapCenterDrop({
            latitude: 40.0,
            longitude: -75.16,
          });
        },
      },
      "Drop pin",
    ),
  ]);
}

const NEAR_AND_FAR_SEARCH_IN_RADIUS_CANDIDATES: SearchInRadiusCandidate[] = [
  {
    propertyId: "lee-prop-near-pin",
    parcelIdentifier: "near",
    latitude: 26.64,
    longitude: -81.87,
    builtYear: 1988,
    addressStreet: "1 Palm",
    addressCity: "Fort Myers",
    gisMuni: null,
    distanceMiles: 0.2,
  },
  {
    propertyId: "lee-prop-far-from-pin",
    parcelIdentifier: "far",
    latitude: 26.6406,
    longitude: -82.15,
    builtYear: 1975,
    addressStreet: "40 West Cape",
    addressCity: "Cape Coral",
    gisMuni: null,
    distanceMiles: 17,
  },
];

describe("Pin radius Haversine clip", () => {
  // Given parcels near Fort Myers and west of the default 2 mile circle
  // When the shell mounts on the Lee pin
  // Then only the in-radius parcel is listed
  it("hides parcels outside the default search radius", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: NEAR_AND_FAR_SEARCH_IN_RADIUS_CANDIDATES,
        liveRadiusSearchConnected: true,
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop-lee"));

    expect(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-near-pin"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("search-in-radius-candidate-row-lee-prop-far-from-pin"),
    ).toBeNull();
  });

  // Given a Fort Myers parcel is listed
  // When the user drops the pin in Pennsylvania
  // Then the candidate list is empty because the circle moved
  it("clears listed parcels when the pin moves outside their radius", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: NEAR_AND_FAR_SEARCH_IN_RADIUS_CANDIDATES,
        liveRadiusSearchConnected: true,
      }),
    );

    fireEvent.click(screen.getByTestId("map-pin-drop"));

    expect(
      screen.queryByTestId("search-in-radius-candidate-row-lee-prop-near-pin"),
    ).toBeNull();
    expect(
      screen.getByTestId("search-in-radius-candidate-list-empty").textContent,
    ).toMatch(/no roofs in this radius/i);
  });
});
