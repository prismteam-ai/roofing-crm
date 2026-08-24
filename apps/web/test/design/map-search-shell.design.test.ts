/**
 * Design tests for the map search shell: radius, pin drop, and GPS chrome.
 *
 * MapLibre WebGL is stubbed; these assert accessible controls and search-center state.
 * Imports avoid the map barrel so maplibre-gl never loads in jsdom.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type DragEvent, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";
import { SEARCH_PIN_DRAG_MIME_TYPE } from "../../src/map/search-pin-welcome-copy";
import {
  LEE_FALLBACK_SEARCH_MAP_CENTER,
  SEARCH_MAP_CENTER_BY_COUNTY_KEY,
} from "../../src/map/search-map-center";
import { SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY } from "../../src/map/search-in-radius-candidate-list-empty-copy";
import { SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY } from "../../src/map/search-in-radius-query-status-copy";
import type { SearchInRadiusApiClient } from "../../src/map/create-http-search-in-radius-api-client";
import { resetMapFirstRunTourForTests } from "../../src/map/MapFirstRunTour";
import { LEADS_LIST_PERSISTENCE_LOCAL_API_COPY } from "../../src/leads";

afterEach(() => {
  cleanup();
  resetMapFirstRunTourForTests();
});

/**
 * Stub canvas that exposes a pin-drop control so jsdom can update search center
 * without WebGL.
 */
function createMockDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  const types: string[] = [];
  return {
    dropEffect: "none",
    effectAllowed: "uninitialized",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types,
    setData(format: string, value: string) {
      data.set(format, value);
      if (!types.includes(format)) {
        types.push(format);
      }
    },
    getData(format: string) {
      return data.get(format) ?? "";
    },
    clearData() {
      data.clear();
      types.splice(0, types.length);
    },
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
}

function StubMapLibreMapCanvas(props: MapLibreMapCanvasProps): ReactElement {
  return createElement(
    "button",
    {
      type: "button",
      "data-testid": "map-pin-drop",
      "data-search-radius-miles": String(props.searchRadiusMiles),
      "data-camera-generation": String(props.mapCameraRecenterGeneration ?? 0),
      onClick: () => {
        props.onSearchMapCenterDrop({
          latitude: 26.7,
          longitude: -81.9,
        });
      },
      onDragOver: (event: DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
      },
      onDrop: (event: DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const payload =
          event.dataTransfer.getData(SEARCH_PIN_DRAG_MIME_TYPE) ||
          event.dataTransfer.getData("text/plain");
        if (payload !== "pin") {
          return;
        }
        props.onSearchMapCenterDrop({
          latitude: 26.55,
          longitude: -81.77,
        });
      },
    },
    "Drop pin",
  );
}

describe("MapSearchShell design", () => {
  it("renders a radius control when the shell mounts for Lee fallback", () => {
    // Given Lee is the default county (dev fallback)
    // When the map search shell renders
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    // Then a labeled radius control is available for search
    // Base UI Slider exposes a visually-hidden range input labeled via aria-labelledby.
    expect(
      screen.getByLabelText(/search radius/i, { selector: 'input[type="range"]' }),
    ).toBeTruthy();
  });

  it("updates the walk circle as soon as the radius slider moves", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    fireEvent.change(
      screen.getByLabelText(/search radius/i, { selector: 'input[type="range"]' }),
      { target: { value: "5" } },
    );

    expect(
      screen.getByTestId("map-pin-drop").getAttribute("data-search-radius-miles"),
    ).toBe("5");
    expect(screen.getByRole("button", { name: "5 mi" })).toBeTruthy();
  });

  it("updates search center state when a pin is dropped", () => {
    // Given the map search shell is showing the Lee default center
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );
    expect(screen.getByTestId("search-map-center").textContent).toBe("No pin");
    expect(screen.getByTestId("map-search-pin-welcome")).toBeTruthy();
    expect(screen.getByTestId("map-search-pin-hud-handle")).toBeTruthy();

    // When the user drops a pin at a new location
    fireEvent.click(screen.getByTestId("map-pin-drop"));

    // Then search center state reflects the dropped pin
    const center = screen.getByTestId("search-map-center");
    expect(center.textContent).toContain("26.7");
    expect(center.textContent).toContain("-81.9");
    expect(screen.queryByTestId("map-search-pin-welcome")).toBeNull();
  });

  it("drags the HUD pin as a move with a pin ghost, not a copy-plus", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );
    const handle = screen.getByTestId("map-search-pin-hud-handle");
    const dataTransfer = createMockDataTransfer();

    fireEvent.dragStart(handle, { dataTransfer });

    expect(dataTransfer.effectAllowed).toBe("move");
    expect(dataTransfer.effectAllowed).not.toMatch(/copy/i);
    expect(dataTransfer.setDragImage).toHaveBeenCalled();
    const [ghost] = (dataTransfer.setDragImage as ReturnType<typeof vi.fn>).mock
      .calls[0] as [HTMLElement, number, number];
    expect(ghost.querySelector("svg")).toBeTruthy();
    expect(ghost.textContent).not.toContain("+");

    fireEvent.dragEnd(handle);
    expect(document.querySelector('[data-testid="search-pin-drag-ghost"]')).toBeNull();
  });

  it("drops the HUD pin onto the map and recenters the filter circle there", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );
    const handle = screen.getByTestId("map-search-pin-hud-handle");
    const map = screen.getByTestId("map-pin-drop");
    const generationBefore = Number(map.getAttribute("data-camera-generation"));
    const dataTransfer = createMockDataTransfer();

    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.drop(map, { dataTransfer });

    const center = screen.getByTestId("search-map-center");
    expect(center.textContent).toContain("26.55");
    expect(center.textContent).toContain("-81.77");
    expect(
      Number(screen.getByTestId("map-pin-drop").getAttribute("data-camera-generation")),
    ).toBeGreaterThan(generationBefore);
  });

  it("shows a GPS control without requiring geolocation in jsdom", () => {
    // Given the map search shell is mounted
    // When controls render (geolocation is not exercised in jsdom)
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    // Then a GPS / use-my-location control is present
    expect(screen.getByRole("button", { name: /use my location|gps/i })).toBeTruthy();
  });

  it("starts with no search pin and a radar welcome while default county is lee", () => {
    // Given Lee is the served default county
    // When the shell mounts without a ping
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    // Then the plat is empty and Fort Myers remains the county camera, not a ping
    expect(screen.getByTestId("search-map-center").textContent).toBe("No pin");
    expect(screen.getByTestId("map-search-pin-welcome").textContent).toMatch(
      /radar is dark/i,
    );
    expect(LEE_FALLBACK_SEARCH_MAP_CENTER).toEqual({
      latitude: 26.6406,
      longitude: -81.8723,
    });
  });

  it("recenters the pin on the selected county when the target control is used", () => {
    // Given the operator has dropped a pin away from the Lee seat
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));
    expect(screen.getByTestId("search-map-center").textContent).toContain("26.7");

    // When they click the county-center target
    fireEvent.click(screen.getByTestId("recenter-search-map-on-county"));

    // Then the search pin returns to Fort Myers
    const center = screen.getByTestId("search-map-center");
    expect(center.textContent).toContain(
      String(LEE_FALLBACK_SEARCH_MAP_CENTER.latitude),
    );
    expect(center.textContent).toContain(
      String(LEE_FALLBACK_SEARCH_MAP_CENTER.longitude),
    );
  });

  it("moves the pin to the newly selected county without changing radius", () => {
    // Given Lee is selected at the default 2 mile radius
    const { rerender } = render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );
    expect(screen.getByRole("button", { name: "2 mi" })).toBeTruthy();

    // When the operator switches the catalog county to Miami-Dade
    rerender(
      createElement(MapSearchShell, {
        defaultCountyKey: "miami-dade",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    // Then the ping is cleared and the radius chip is still 2 mi
    expect(screen.getByTestId("search-map-center").textContent).toBe("No pin");
    expect(screen.getByTestId("map-search-pin-welcome")).toBeTruthy();
    expect(screen.getByRole("button", { name: "2 mi" })).toBeTruthy();
  });

  it("recenters on Norristown when Montgomery is the selected county", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "montgomery",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    const montgomeryCenter = SEARCH_MAP_CENTER_BY_COUNTY_KEY.montgomery;
    expect(screen.getByTestId("search-map-center").textContent).toBe("No pin");
    expect(montgomeryCenter).toEqual({
      latitude: 40.1215,
      longitude: -75.3399,
    });
  });

  it("stamps the map only when Lee fallback coverage needs Chester unpublished", () => {
    const { rerender } = render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        coverageMode: "lee_dev_fallback",
      }),
    );

    expect(
      screen.getByTestId("coverage-mode-banner").getAttribute("data-coverage-mode"),
    ).toBe("lee_dev_fallback");

    rerender(
      createElement(MapSearchShell, {
        defaultCountyKey: "miami-dade",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        coverageMode: null,
      }),
    );

    expect(screen.queryByTestId("coverage-mode-banner")).toBeNull();
  });

  it("clarifies Chester coverage under the roofs-in-radius title", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "chester",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        coverageMode: "chester_real_limited",
      }),
    );

    fireEvent.click(screen.getByTestId("plat-floating-bar-doors"));

    const heading = screen.getByRole("heading", { name: /roofs in this radius/i });
    const banner = screen.getByTestId("coverage-mode-banner");
    expect(banner.getAttribute("data-coverage-mode")).toBe("chester_real_limited");
    expect(
      heading.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(heading.parentElement?.contains(banner)).toBe(false);
    expect(heading.closest(".border-b")?.contains(banner)).toBe(true);
  });

  it("clarifies Montgomery coverage under the roofs-in-radius title", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "montgomery",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        coverageMode: "montgomery_roof_age_demo",
      }),
    );

    fireEvent.click(screen.getByTestId("plat-floating-bar-doors"));

    const heading = screen.getByRole("heading", { name: /roofs in this radius/i });
    const banner = screen.getByTestId("coverage-mode-banner");
    expect(banner.getAttribute("data-coverage-mode")).toBe("montgomery_roof_age_demo");
    expect(heading.closest(".border-b")?.contains(banner)).toBe(true);
  });

  it("parks the search HUD above the live sheet height when a sheet is open", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    fireEvent.click(screen.getByTestId("plat-floating-bar-doors"));

    const filters = screen.getByRole("group", { name: "Search filters" });
    const hudShift = filters.closest(".plat-hud-shift");
    expect(hudShift?.className).toMatch(/--plat-sheet-rise/);
  });

  it("expands the property filter form when the Filter chip is clicked", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    const filterToggle = screen.getByTestId("map-search-filter-hud-toggle");
    expect(filterToggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(filterToggle);

    expect(filterToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("map-search-property-filters-form")).toBeTruthy();
    expect(
      screen
        .getByRole("group", { name: "Search filters" })
        .contains(screen.getByTestId("map-search-property-filters-form")),
    ).toBe(true);
  });

  it("selecting overlay chester does not call search.inRadius", async () => {
    const searchInRadius = vi.fn(async () => []);
    const searchInRadiusApiClient: SearchInRadiusApiClient = {
      searchInRadius,
    };

    const { rerender } = render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        mapSearchReady: true,
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusApiClient,
        liveRadiusSearchConnected: true,
      }),
    );

    await waitFor(() => {
      expect(searchInRadius).toHaveBeenCalledTimes(1);
    });
    searchInRadius.mockClear();

    fireEvent.click(screen.getByTestId("map-pin-drop"));
    await waitFor(() => {
      expect(searchInRadius).toHaveBeenCalled();
    });
    searchInRadius.mockClear();

    rerender(
      createElement(MapSearchShell, {
        defaultCountyKey: "chester",
        mapSearchReady: false,
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusApiClient,
        liveRadiusSearchConnected: true,
      }),
    );

    await new Promise((resolve) => {
      window.setTimeout(resolve, 400);
    });
    expect(searchInRadius).not.toHaveBeenCalled();
  });

  it("recenters overlay chester onto the West Chester pin", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "chester",
        mapSearchReady: false,
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    const chesterCenter = SEARCH_MAP_CENTER_BY_COUNTY_KEY.chester;
    expect(screen.getByTestId("search-map-center").textContent).toBe("No pin");
    expect(chesterCenter).toEqual({
      latitude: 39.9607,
      longitude: -75.6055,
    });
  });

  it("successful empty radius copy is absent after overlay select", async () => {
    const searchInRadius = vi.fn(async () => []);
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "chester",
        mapSearchReady: false,
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusApiClient: { searchInRadius },
        liveRadiusSearchConnected: true,
      }),
    );

    await new Promise((resolve) => {
      window.setTimeout(resolve, 400);
    });
    expect(searchInRadius).not.toHaveBeenCalled();
    expect(screen.queryByText(SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY)).toBeNull();
  });

  it("shows unmappable empty copy when overlay chester is not map-ready", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "chester",
        mapSearchReady: false,
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        onSwitchToMapReadyCounty: () => {},
      }),
    );

    const emptyState = screen.getByTestId("search-in-radius-candidate-list-empty");
    expect(emptyState.textContent).toContain(
      SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY.split(". ")[0],
    );
    expect(emptyState.textContent).not.toContain(
      SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY,
    );
    expect(screen.getByTestId("switch-to-map-ready-county")).toBeTruthy();
  });

  it("switch control sets selected county to lee", () => {
    const onSwitchToMapReadyCounty = vi.fn();

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "chester",
        mapSearchReady: false,
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        onSwitchToMapReadyCounty,
      }),
    );

    fireEvent.click(screen.getByTestId("switch-to-map-ready-county"));
    expect(onSwitchToMapReadyCounty).toHaveBeenCalledTimes(1);
  });

  it("switch-to-lee control is keyboard activatable", () => {
    const onSwitchToMapReadyCounty = vi.fn();

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "chester",
        mapSearchReady: false,
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        onSwitchToMapReadyCounty,
      }),
    );

    fireEvent.click(screen.getByTestId("plat-floating-bar-doors"));

    const switchButton = screen.getByRole("button", { name: /walk lee county/i });
    switchButton.focus();
    expect(document.activeElement).toBe(switchButton);
    fireEvent.click(switchButton);
    expect(onSwitchToMapReadyCounty).toHaveBeenCalledTimes(1);
  });

  it("renders the leads persistence caveat as a title-block note, not a field", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        leadsListPersistenceNote: LEADS_LIST_PERSISTENCE_LOCAL_API_COPY,
      }),
    );

    fireEvent.click(screen.getByTestId("plat-floating-bar-leads"));

    const note = screen.getByTestId("leads-list-persistence-note");
    expect(note.textContent).toBe(LEADS_LIST_PERSISTENCE_LOCAL_API_COPY);
    expect(note.getAttribute("role")).toBe("note");
    expect(note.className).toContain("plat-sheet-notice");
    expect(note.className).not.toMatch(/\bborder-foreground\/30\b/);
    expect(note.className).not.toMatch(/\bbg-muted\/40\b/);
    expect(note.className).not.toMatch(/\brounded-sm\b/);
  });

  it("starts with the roofs sheet collapsed", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    const sheet = document.querySelector(".plat-sheet");
    expect(sheet?.getAttribute("data-open")).toBe("false");
    expect(screen.queryByRole("heading", { name: /roofs in this radius/i })).toBeNull();
  });

  it("opens roofs in this radius when a pin is dropped", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    fireEvent.click(screen.getByTestId("map-pin-drop"));

    expect(document.querySelector(".plat-sheet")?.getAttribute("data-open")).toBe(
      "true",
    );
    expect(screen.getByRole("heading", { name: /roofs in this radius/i })).toBeTruthy();
    expect(
      screen.getByTestId("plat-floating-bar-doors").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("opens roofs in this radius from the floating bar", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    fireEvent.click(screen.getByTestId("plat-floating-bar-doors"));

    expect(document.querySelector(".plat-sheet")?.getAttribute("data-open")).toBe(
      "true",
    );
    expect(screen.getByRole("heading", { name: /roofs in this radius/i })).toBeTruthy();
  });
});
