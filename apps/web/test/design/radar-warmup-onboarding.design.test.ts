/**
 * Design tests: first-run HUD tour and radar gate on live search.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactElement, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import {
  MapFirstRunTour,
  resetMapFirstRunTourForTests,
} from "../../src/map/MapFirstRunTour";
import { MAP_FIRST_RUN_TOUR_STEPS } from "../../src/map/map-first-run-tour-copy";
import { MapSearchShell } from "../../src/map/MapSearchShell";
import type { SearchInRadiusApiClient } from "../../src/map/create-http-search-in-radius-api-client";

afterEach(() => {
  cleanup();
  resetMapFirstRunTourForTests();
  vi.useRealTimers();
});

function StubMapLibreMapCanvas(props: MapLibreMapCanvasProps): ReactElement {
  return createElement(
    "button",
    {
      type: "button",
      "data-testid": "map-pin-drop",
      onClick: () => {
        props.onSearchMapCenterDrop({
          latitude: 26.6406,
          longitude: -81.8723,
        });
      },
    },
    "Drop pin",
  );
}

function TourHarness(): ReactElement {
  const pinHandle = useRef<HTMLButtonElement>(null);
  const radiusChip = useRef<HTMLButtonElement>(null);
  const doorsHeading = useRef<HTMLHeadingElement>(null);

  return createElement("div", null, [
    createElement(
      "button",
      {
        key: "pin",
        type: "button",
        ref: pinHandle,
        "data-testid": "map-search-pin-hud-handle",
      },
      "Pin",
    ),
    createElement(
      "button",
      {
        key: "radius",
        type: "button",
        ref: radiusChip,
        "data-testid": "map-search-radius-chip",
      },
      "2 mi",
    ),
    createElement(
      "h2",
      {
        key: "doors",
        ref: doorsHeading,
        "data-testid": "search-in-radius-doors-heading",
      },
      "Roofs in this radius",
    ),
    createElement(MapFirstRunTour, {
      key: "tour",
      anchorRefs: {
        pinHandle,
        radiusChip,
        doorsHeading,
      },
    }),
  ]);
}

describe("MapFirstRunTour", () => {
  it("shows step 1 on first visit and skip persists", async () => {
    render(createElement(TourHarness));

    expect(screen.getByTestId("map-first-run-tour-step-pin")).toBeTruthy();
    expect(screen.getByText(MAP_FIRST_RUN_TOUR_STEPS[0].heading)).toBeTruthy();

    fireEvent.click(screen.getByTestId("map-first-run-tour-skip"));

    await waitFor(() => {
      expect(screen.queryByTestId("map-first-run-tour")).toBeNull();
    });

    cleanup();
    render(createElement(TourHarness));
    expect(screen.queryByTestId("map-first-run-tour")).toBeNull();
  });
});

describe("MapSearchShell radar gate", () => {
  it("does not call search.inRadius while warmup is pending", async () => {
    let resolveWarmup: ((value: never[]) => void) | undefined;
    let callCount = 0;
    const searchInRadius = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<never[]>((resolve) => {
          resolveWarmup = resolve;
        });
      }
      return Promise.resolve([]);
    });
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

    await waitFor(() => {
      expect(searchInRadius).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId("map-pin-drop"));

    await new Promise((resolve) => {
      window.setTimeout(resolve, 400);
    });
    expect(searchInRadius).toHaveBeenCalledTimes(1);

    resolveWarmup?.([]);
    await waitFor(() => {
      expect(searchInRadius.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows radar readiness meter while warming", async () => {
    let resolveWarmup: ((value: never[]) => void) | undefined;
    const searchInRadiusApiClient: SearchInRadiusApiClient = {
      searchInRadius: vi.fn(
        () =>
          new Promise<never[]>((resolve) => {
            resolveWarmup = resolve;
          }),
      ),
    };

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusApiClient,
        liveRadiusSearchConnected: true,
      }),
    );

    expect(screen.getByTestId("radar-readiness-meter")).toBeTruthy();
    expect(screen.getByText(/Starting up your radar/i)).toBeTruthy();

    resolveWarmup?.([]);
    await waitFor(() => {
      expect(screen.queryByTestId("radar-readiness-meter")).toBeNull();
    });
  });
});
