/**
 * Design tests for search.inRadius pending and failure affordances.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";
import {
  SEARCH_IN_RADIUS_QUERY_API_NOT_WIRED_COPY,
  SEARCH_IN_RADIUS_QUERY_COLD_START_COPY,
  SEARCH_IN_RADIUS_QUERY_PENDING_COPY,
  SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY,
  SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY,
  resolveSearchInRadiusQueryErrorMessage,
} from "../../src/map/search-in-radius-query-status-copy";
import { SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY } from "../../src/map/search-in-radius-candidate-list-empty-copy";
import type { SearchInRadiusApiClient } from "../../src/map/create-http-search-in-radius-api-client";
import { createSearchInRadiusClientAfterWarmup } from "./search-in-radius-mock-client";
import { resetMapFirstRunTourForTests } from "../../src/map/MapFirstRunTour";

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

describe("search.inRadius query status copy", () => {
  it("maps unconfigured MCP transport to honest API copy", () => {
    expect(
      resolveSearchInRadiusQueryErrorMessage(
        new Error(
          "search.inRadius failed: Property bbox search transport is not configured; inject listPropertiesInBoundingBox in createSearchRouter or wire MCP in the Lambda handler",
        ),
      ),
    ).toBe(SEARCH_IN_RADIUS_QUERY_API_NOT_WIRED_COPY);
  });

  it("message containing 503 maps to SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY or equivalent retry copy", () => {
    expect(
      resolveSearchInRadiusQueryErrorMessage(
        new Error("search.inRadius failed with HTTP 503"),
      ),
    ).toBe(SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY);
    expect(resolveSearchInRadiusQueryErrorMessage("503 from execute-api")).toBe(
      SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY,
    );
    expect(
      resolveSearchInRadiusQueryErrorMessage(
        new Error(
          "search.inRadius failed with HTTP 503 requestId=abc-123 errorType=InternalServerErrorException",
        ),
      ),
    ).toBe(SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY);
  });

  it("Service Unavailable maps to retry copy", () => {
    expect(
      resolveSearchInRadiusQueryErrorMessage(new Error("Service Unavailable")),
    ).toBe(SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY);
  });

  it("retry copy is not the zero-candidate radius string", () => {
    const retryCopy = resolveSearchInRadiusQueryErrorMessage(
      new Error("HTTP 503 Service Unavailable"),
    );
    expect(retryCopy).toBe(SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY);
    expect(retryCopy).not.toBe(SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY);
  });

  it("unmappable empty copy does not equal zero-candidate radius copy", () => {
    expect(SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY).toMatch(
      /not searchable yet/i,
    );
    expect(SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY).not.toBe(
      SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY,
    );
    expect(SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY).not.toMatch(
      /widen the walk/i,
    );
  });
});

describe("search.inRadius doors sheet status", () => {
  it("shows pending copy while the first live search is in flight", async () => {
    let resolveSearch: ((value: never[]) => void) | undefined;
    const searchInRadiusApiClient = createSearchInRadiusClientAfterWarmup(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );

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
        screen.getByTestId("search-in-radius-query-pending").textContent,
      ).toContain(SEARCH_IN_RADIUS_QUERY_PENDING_COPY);
    });
    expect(screen.queryByTestId("search-in-radius-candidate-list-empty")).toBeNull();
    expect(screen.getByTestId("search-in-radius-query-pending-rules")).toBeTruthy();
    expect(
      screen
        .getByTestId("search-in-radius-query-pending-rules")
        .querySelectorAll(".plat-index-pending-row"),
    ).toHaveLength(3);
    expect(
      screen
        .queryByTestId("search-in-radius-query-pending")
        .querySelector('[data-slot="spinner"]'),
    ).toBeNull();

    await waitFor(() => {
      expect(resolveSearch).toBeDefined();
    });
    resolveSearch?.([]);
    await waitFor(() => {
      expect(screen.queryByTestId("search-in-radius-query-pending")).toBeNull();
    });
  });

  it("shows cold-start copy after a slow first search", async () => {
    const searchInRadiusApiClient = createSearchInRadiusClientAfterWarmup(
      () => new Promise(() => {}),
    );

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusApiClient,
        liveRadiusSearchConnected: true,
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));

    await waitFor(
      () => {
        expect(
          screen.getByTestId("search-in-radius-query-pending").textContent,
        ).toContain(SEARCH_IN_RADIUS_QUERY_COLD_START_COPY);
      },
      { timeout: 13_000 },
    );
  }, 16_000);

  it("shows mapped failure copy instead of raw tRPC errors", async () => {
    const searchInRadiusApiClient = createSearchInRadiusClientAfterWarmup(async () => {
      throw new Error(
        "search.inRadius failed: Property bbox search transport is not configured; inject listPropertiesInBoundingBox in createSearchRouter or wire MCP in the Lambda handler",
      );
    });

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
      expect(screen.getByTestId("search-in-radius-doors-sheet-error")).toBeTruthy();
    });
    expect(screen.getByTestId("search-in-radius-doors-sheet-error").textContent).toBe(
      SEARCH_IN_RADIUS_QUERY_API_NOT_WIRED_COPY,
    );
    expect(
      screen.getByTestId("search-in-radius-doors-sheet-error").textContent,
    ).not.toContain("listPropertiesInBoundingBox");
    expect(screen.queryByTestId("search-in-radius-candidate-list-empty")).toBeNull();
  });

  it("shows retry copy for HTTP 503 instead of zero-candidate empty state", async () => {
    const searchInRadiusApiClient = createSearchInRadiusClientAfterWarmup(async () => {
      throw new Error("search.inRadius failed with HTTP 503");
    });

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
      expect(screen.getByTestId("search-in-radius-doors-sheet-error")).toBeTruthy();
    });
    expect(screen.getByTestId("search-in-radius-doors-sheet-error").textContent).toBe(
      SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY,
    );
    expect(
      screen.getByTestId("search-in-radius-doors-sheet-error").textContent,
    ).not.toBe(SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY);
    expect(screen.queryByTestId("search-in-radius-candidate-list-empty")).toBeNull();
  });

  it("does not claim an empty radius while a live lookup is still in flight after the pin moves", async () => {
    let resolveSecondSearch: ((value: never[]) => void) | undefined;
    let searchCallCount = 0;
    const searchInRadiusApiClient: SearchInRadiusApiClient = {
      searchInRadius: () => {
        searchCallCount += 1;
        if (searchCallCount === 1) {
          return Promise.resolve([]);
        }
        if (searchCallCount === 2) {
          return Promise.resolve([
            {
              propertyId: "lee-api-near",
              parcelIdentifier: "near",
              latitude: 26.64,
              longitude: -81.87,
              builtYear: 1988,
              addressStreet: "1 Palm",
              addressCity: "Fort Myers",
              gisMuni: null,
              distanceMiles: 0.2,
            },
          ]);
        }
        return new Promise((resolve) => {
          resolveSecondSearch = resolve;
        });
      },
    };

    let pinDropCount = 0;
    function PinDropStubMapLibreMapCanvas(props: MapLibreMapCanvasProps): ReactElement {
      return createElement(
        "button",
        {
          type: "button",
          "data-testid": "map-pin-drop",
          onClick: () => {
            pinDropCount += 1;
            props.onSearchMapCenterDrop(
              pinDropCount === 1
                ? { latitude: 26.6406, longitude: -81.8723 }
                : { latitude: 40.0, longitude: -75.16 },
            );
          },
        },
        "Drop pin",
      );
    }

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: PinDropStubMapLibreMapCanvas,
        searchInRadiusApiClient,
        liveRadiusSearchConnected: true,
      }),
    );

    fireEvent.click(screen.getByTestId("map-pin-drop"));
    await waitFor(() => {
      expect(
        screen.getByTestId("search-in-radius-candidate-row-lee-api-near"),
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("map-pin-drop"));

    await waitFor(() => {
      expect(
        screen.getByTestId("search-in-radius-query-pending").textContent,
      ).toContain(SEARCH_IN_RADIUS_QUERY_PENDING_COPY);
    });
    expect(screen.queryByTestId("search-in-radius-candidate-list-empty")).toBeNull();
    expect(screen.queryByTestId("search-in-radius-query-refreshing")).toBeNull();
    expect(screen.getByText(/… in 2 mi/)).toBeTruthy();

    await waitFor(() => {
      expect(resolveSecondSearch).toBeDefined();
    });
    resolveSecondSearch?.([]);
    await waitFor(() => {
      expect(
        screen.getByTestId("search-in-radius-candidate-list-empty").textContent,
      ).toMatch(/no roofs in this radius/i);
    });
    expect(screen.queryByTestId("search-in-radius-query-pending")).toBeNull();
  });
});
