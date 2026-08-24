/**
 * Design tests for the search-candidate list and property drawer.
 *
 * MapLibre is stubbed; asserts list rows from search results, empty state,
 * drawer address fields, and BBB chrome only when a contractor profile exists.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";
import {
  SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY,
  SEARCH_IN_RADIUS_CANDIDATE_LIST_NO_PIN_COPY,
  type SearchInRadiusCandidate,
} from "../../src/map/SearchInRadiusCandidateList";
import {
  SEARCH_PIN_WELCOME_BODY,
  SEARCH_PIN_WELCOME_HEADING,
} from "../../src/map/search-pin-welcome-copy";
import { LEE_FALLBACK_SEARCH_MAP_CENTER } from "../../src/map/search-map-center";
import type { PublishedPropertyDrawerDetail } from "../../src/map/PublishedPropertyDrawer";

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
          latitude: LEE_FALLBACK_SEARCH_MAP_CENTER.latitude,
          longitude: LEE_FALLBACK_SEARCH_MAP_CENTER.longitude,
        });
      },
    },
    "Drop pin",
  );
}

const SAMPLE_SEARCH_IN_RADIUS_CANDIDATES: SearchInRadiusCandidate[] = [
  {
    propertyId: "lee-prop-101",
    parcelIdentifier: "101",
    latitude: 26.64,
    longitude: -81.87,
    builtYear: 1998,
    addressStreet: "123 Palm Ave",
    addressCity: "Fort Myers",
    gisMuni: null,
    distanceMiles: 0.4,
  },
  {
    propertyId: "lee-prop-202",
    parcelIdentifier: "202",
    latitude: 26.65,
    longitude: -81.86,
    builtYear: 2005,
    addressStreet: "456 Oak St",
    addressCity: "Fort Myers",
    gisMuni: null,
    distanceMiles: 1.2,
  },
];

describe("Candidate list and property drawer design", () => {
  // Given radius search returned published property candidates
  // When the candidate list renders
  // Then each row shows the property_id from those search results
  it("list renders property_id from search results", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: SAMPLE_SEARCH_IN_RADIUS_CANDIDATES,
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));

    const list = screen.getByTestId("search-in-radius-candidate-list");
    expect(list.textContent).toContain("lee-prop-101");
    expect(list.textContent).toContain("lee-prop-202");
    expect(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-101"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-202"),
    ).toBeTruthy();
    expect(list.textContent).toMatch(/\d+\.\dm/i);
    expect(list.textContent).toContain("Fort Myers structure 1998");
    expect(list.textContent).toContain("roof 28y/o");
    expect(list.textContent).toContain("Fort Myers structure 2005");
    expect(list.textContent).toContain("roof 21y/o");
  });

  // Given a selected property with has_bbb_contractor false and no BBB profile
  // When the property drawer opens
  // Then BBB chrome is hidden (no invented rating)
  it("drawer hides BBB when has_bbb_contractor is false", () => {
    const drawerDetail: PublishedPropertyDrawerDetail = {
      propertyId: "lee-prop-101",
      addressStreet: "123 Palm Ave",
      addressCity: "Fort Myers",
      addressZip: null,
      builtYear: 1998,
      hasBbbContractor: false,
      bbb: null,
    };

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: SAMPLE_SEARCH_IN_RADIUS_CANDIDATES,
        publishedPropertyDrawerDetailsByPropertyId: {
          "lee-prop-101": drawerDetail,
        },
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));

    fireEvent.click(screen.getByTestId("search-in-radius-candidate-row-lee-prop-101"));

    const drawer = screen.getByTestId("published-property-drawer");
    expect(drawer.textContent).toContain("123 Palm Ave");
    expect(drawer.textContent).toContain("lee-prop-101");
    expect(screen.queryByTestId("published-property-drawer-bbb")).toBeNull();
    expect(drawer.textContent).not.toMatch(/\bA\+\b/);
    expect(drawer.textContent).not.toMatch(/BBB rating/i);
  });

  // Given radius search returned zero candidates
  // When the candidate list renders
  // Then an honest empty state is shown (valid, not an error)
  it("empty search list is a valid empty state", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [],
      }),
    );

    const idleEmpty = screen.getByTestId("search-in-radius-candidate-list-empty");
    const welcome = screen.getByTestId("map-search-pin-welcome");
    expect(idleEmpty.textContent).toBe(SEARCH_IN_RADIUS_CANDIDATE_LIST_NO_PIN_COPY);
    expect(idleEmpty.textContent).not.toMatch(/drag the pin/i);
    expect(idleEmpty.textContent).not.toContain(SEARCH_PIN_WELCOME_HEADING);
    expect(idleEmpty.textContent).not.toContain(SEARCH_PIN_WELCOME_BODY);
    expect(welcome.textContent).toContain(SEARCH_PIN_WELCOME_HEADING);
    expect(welcome.textContent).toMatch(/drag a pin onto the plat/i);

    fireEvent.click(screen.getByTestId("map-pin-drop"));

    expect(
      screen.getByTestId("search-in-radius-candidate-list-empty").textContent,
    ).toBe(SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY);
    expect(screen.queryByTestId("search-in-radius-candidate-list")).toBeNull();
    expect(screen.queryByTestId("published-property-drawer")).toBeNull();
  });

  // Given search candidates with street addresses
  // When the user activates a list row
  // Then the drawer opens with that address_street
  it("clicking a list row opens the drawer with address_street", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: SAMPLE_SEARCH_IN_RADIUS_CANDIDATES,
        publishedPropertyDrawerDetailsByPropertyId: {
          "lee-prop-202": {
            propertyId: "lee-prop-202",
            addressStreet: "456 Oak St",
            addressCity: "Fort Myers",
            addressZip: null,
            builtYear: null,
            hasBbbContractor: true,
            bbb: { ratingLetter: "A+", ratingScore: 97 },
          },
        },
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));

    fireEvent.click(screen.getByTestId("search-in-radius-candidate-row-lee-prop-202"));

    const drawer = screen.getByTestId("published-property-drawer");
    expect(drawer.textContent).toContain("456 Oak St");
    expect(screen.getByTestId("published-property-drawer-bbb").textContent).toMatch(
      /A\+/,
    );
  });
});
