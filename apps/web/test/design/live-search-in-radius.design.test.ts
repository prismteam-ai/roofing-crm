/**
 * Design tests: live search.inRadius client refetches when the pin moves.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";
import type { SearchInRadiusApiClient } from "../../src/map/create-http-search-in-radius-api-client";

afterEach(() => {
  cleanup();
});

function StubMapLibreMapCanvas(props: MapLibreMapCanvasProps): ReactElement {
  return createElement(
    "button",
    {
      type: "button",
      "data-testid": "map-pin-drop",
      onClick: () => {
        props.onSearchMapCenterDrop({
          latitude: 26.7,
          longitude: -81.9,
        });
      },
    },
    "Drop pin",
  );
}

describe("Live search.inRadius client", () => {
  it("lists API candidates and refetches after a pin drop", async () => {
    const searchInRadius = vi.fn(async (input: { center: { lat: number } }) => [
      {
        propertyId: "lee-api-1",
        parcelIdentifier: "api-1",
        latitude: input.center.lat,
        longitude: -81.87,
        builtYear: 1980,
        addressStreet: "10 Live MCP St",
        addressCity: "Fort Myers",
        gisMuni: null,
        distanceMiles: 0.2,
      },
    ]);
    const searchInRadiusApiClient: SearchInRadiusApiClient = {
      searchInRadius,
    };

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusApiClient,
        liveRadiusSearchConnected: true,
      }),
    );

    fireEvent.click(screen.getByTestId("map-pin-drop"));

    await waitFor(() => {
      expect(
        screen.getByTestId("search-in-radius-candidate-row-lee-api-1"),
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("map-pin-drop"));

    await waitFor(() => {
      expect(searchInRadius.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(searchInRadius.mock.calls.at(-1)?.[0]).toMatchObject({
      county: "lee",
      center: { lat: 26.7, lng: -81.9 },
    });
  });
});
