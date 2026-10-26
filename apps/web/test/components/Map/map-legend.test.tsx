// MapLegend (CRM-HANDOFF E-72 "Legend per layer"; prototype Explore1440 `atlas-legend`).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLegendChoice, writeLegendChoice } from "../../../src/components/Map/legendState.js";
import { MapLegend } from "../../../src/components/Map/MapLegend.js";

function stubWidth(wide: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wide && query.includes("600"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  sessionStorage.clear();
  stubWidth(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MapLegend", () => {
  it("in the overview, titles the roof scale per hexagon and lists the five roof-age steps", () => {
    render(<MapLegend mode="overview" roofs permits loadedCount={42} />);
    expect(screen.getByText("Median roof age per hexagon, yrs")).not.toBeNull();
    for (const step of ["0–9", "10–14", "15–19", "20–24", "25+"]) {
      expect(screen.getByText(step)).not.toBeNull();
    }
    expect(screen.getByText("Permit open, yrs · clusters")).not.toBeNull();
  });

  it("names an Atlas token for every swatch and paints it from the CSS module, not inline", () => {
    const { container } = render(<MapLegend mode="overview" roofs permits loadedCount={1} />);
    const swatches = [...container.querySelectorAll<HTMLElement>("[data-swatch]")];
    expect(swatches.length).toBeGreaterThanOrEqual(10);
    for (const s of swatches) {
      expect(s.getAttribute("data-swatch")).toMatch(/^--(viz|md-sys)-/);
      expect(s.getAttribute("style")).toBeNull();
      expect(s.className.split(" ").length).toBe(2);
    }
  });

  it("without a county overview, says the hexagons cover only the loaded results", () => {
    render(<MapLegend mode="overview" roofs permits={false} loadedCount={42} />);
    expect(screen.getByText(/42 properties loaded around your pin/)).not.toBeNull();
    expect(screen.queryByText(/Permit open/)).toBeNull();
  });

  it("with the county overview, says what the hexagons cover, what is left out and why, and the run", () => {
    const { container } = render(
      <MapLegend
        mode="overview"
        roofs
        permits
        loadedCount={0}
        county={{
          state: "ready",
          binned: 441_000,
          excludedNoCoordinates: 961,
          excludedNoRoofDate: 0,
          binnedWithoutRoofAge: 12_345,
          runId: "travis-202609-permits-20261021t103516z",
        }}
      />,
    );
    expect(
      container.querySelector("[data-overview-state]")?.getAttribute("data-overview-state"),
    ).toBe("ready");
    expect(screen.getByText(/whole county: 441,000 properties/)).not.toBeNull();
    expect(screen.getByText(/961 not on the map: no coordinates published/)).not.toBeNull();
    expect(
      screen.getByText(/12,345 counted but left out of the median: no roof age published/),
    ).not.toBeNull();
    expect(screen.getByText(/Source: travis-202609-permits-20261021t103516z/)).not.toBeNull();
    expect(screen.queryByText(/roof-age filter/)).toBeNull();
  });

  it("names the rows the roof-age filter dropped for having no roof date", () => {
    render(
      <MapLegend
        mode="overview"
        roofs
        permits={false}
        loadedCount={0}
        county={{
          state: "ready",
          binned: 10,
          excludedNoCoordinates: 0,
          excludedNoRoofDate: 4,
          binnedWithoutRoofAge: 0,
          runId: "travis-full-run3-20261025",
        }}
      />,
    );
    expect(
      screen.getByText(/4 left out by the roof-age filter: no roof date published/),
    ).not.toBeNull();
    expect(screen.queryByText(/not on the map/)).toBeNull();
    // The run is shown as its label, never the raw run id.
    expect(screen.getByText("Source: Run 3.")).not.toBeNull();
  });

  it("says when no property matches the filters", () => {
    render(
      <MapLegend
        mode="overview"
        roofs
        permits={false}
        loadedCount={0}
        county={{
          state: "ready",
          binned: 0,
          excludedNoCoordinates: 0,
          excludedNoRoofDate: 0,
          binnedWithoutRoofAge: 0,
          runId: null,
        }}
      />,
    );
    expect(screen.getByText(/No properties match these filters/)).not.toBeNull();
    expect(screen.getByText(/run id not published/)).not.toBeNull();
  });

  it("shows the loading and the failed county overview honestly", () => {
    const { container, rerender } = render(
      <MapLegend mode="overview" roofs permits loadedCount={0} county={{ state: "loading" }} />,
    );
    expect(screen.getByText(/Loading the county overview/)).not.toBeNull();
    expect(
      container.querySelector("[data-overview-state]")?.getAttribute("data-overview-state"),
    ).toBe("loading");
    rerender(
      <MapLegend mode="overview" roofs permits loadedCount={7} county={{ state: "error" }} />,
    );
    expect(screen.getByText(/county overview could not be read/)).not.toBeNull();
    expect(screen.getByText(/only the 7 properties loaded around your pin/)).not.toBeNull();
    rerender(
      <MapLegend mode="overview" roofs permits loadedCount={0} county={{ state: "error" }} />,
    );
    expect(screen.getByText(/county overview could not be read/)).not.toBeNull();
    expect(screen.queryByText(/loaded around your pin/)).toBeNull();
  });

  it("says why the overview is empty before any search", () => {
    render(<MapLegend mode="overview" roofs permits loadedCount={0} />);
    expect(screen.getByText(/No properties loaded yet/)).not.toBeNull();
  });

  it("in the marker view, titles the roof scale per property and explains the marker shapes", () => {
    render(<MapLegend mode="detail" roofs permits loadedCount={3} />);
    expect(screen.getByText("Roof age, yrs")).not.toBeNull();
    expect(screen.getByText("Permit open, yrs")).not.toBeNull();
    expect(screen.getByText(/dark ring = open over 5 yrs/)).not.toBeNull();
  });

  it("names the no-roof-age colour so a grey hexagon or marker is never unexplained", () => {
    render(<MapLegend mode="overview" roofs permits={false} loadedCount={3} />);
    expect(screen.getByText("No roof age published")).not.toBeNull();
  });

  it("renders nothing when both layers are off", () => {
    const { container } = render(
      <MapLegend mode="overview" roofs={false} permits={false} loadedCount={3} />,
    );
    expect(container.innerHTML).toBe("");
  });

  describe("the Legend button and card", () => {
    it("is open by default on a phone too, closes with its control and opens again from the Legend button", () => {
      stubWidth(false);
      render(<MapLegend mode="overview" roofs permits loadedCount={0} />);
      expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Close legend" }));
      expect(screen.queryByText("Median roof age per hexagon, yrs")).toBeNull();
      const button = screen.getByRole("button", { name: "Legend" });
      expect(button.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(button);
      expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
    });

    it("is open by default from 600 px (tablets and up), and can be closed", () => {
      render(<MapLegend mode="overview" roofs permits loadedCount={0} />);
      expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Close legend" }));
      expect(screen.queryByRole("region", { name: "Map legend" })).toBeNull();
    });

    it("closes with its button, with Escape, and with a tap outside; the choice is remembered", () => {
      stubWidth(false);
      writeLegendChoice(false);
      render(
        <div>
          <MapLegend mode="overview" roofs permits loadedCount={0} />
          <p data-testid="elsewhere">map</p>
        </div>,
      );
      const open = (): void => {
        fireEvent.click(screen.getByRole("button", { name: "Legend" }));
      };
      open();
      fireEvent.click(screen.getByRole("button", { name: "Close legend" }));
      expect(screen.queryByRole("region", { name: "Map legend" })).toBeNull();
      open();
      // Escape elsewhere on the page leaves the legend open ...
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
      // ... and closes it when focus is on the legend.
      screen.getByRole("button", { name: "Close legend" }).focus();
      fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
      expect(screen.queryByRole("region", { name: "Map legend" })).toBeNull();
      open();
      fireEvent.pointerDown(screen.getByTestId("elsewhere"));
      expect(screen.queryByRole("region", { name: "Map legend" })).toBeNull();
      open();
      expect(sessionStorage.getItem("crm.legend.v1")).toBe("open");
      cleanup();
      stubWidth(false);
      render(<MapLegend mode="overview" roofs permits loadedCount={0} />);
      expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
    });

    it("from 600 px a tap on the map does not close the docked card", () => {
      render(
        <div>
          <MapLegend mode="overview" roofs permits loadedCount={0} />
          <p data-testid="elsewhere">map</p>
        </div>,
      );
      fireEvent.pointerDown(screen.getByTestId("elsewhere"));
      expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
    });

    it("with toggle none it has no Legend button of its own and follows the shared state", () => {
      stubWidth(false);
      writeLegendChoice(false);
      render(<MapLegend mode="overview" roofs permits loadedCount={0} toggle="none" />);
      expect(screen.queryByRole("button", { name: "Legend" })).toBeNull();
      expect(screen.queryByRole("region", { name: "Map legend" })).toBeNull();
      act(() => writeLegendChoice(true));
      expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Close legend" }));
      expect(readLegendChoice()).toBe(false);
    });

    it("a tap inside the card does not close it", () => {
      stubWidth(false);
      writeLegendChoice(false);
      render(<MapLegend mode="overview" roofs permits loadedCount={0} />);
      fireEvent.click(screen.getByRole("button", { name: "Legend" }));
      fireEvent.pointerDown(screen.getByText("Median roof age per hexagon, yrs"));
      expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
    });

    it("is open when nothing was chosen at any width, and works without storage", () => {
      stubWidth(false);
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      render(<MapLegend mode="overview" roofs permits loadedCount={0} />);
      expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Close legend" }));
      expect(screen.queryByRole("region", { name: "Map legend" })).toBeNull();
      vi.restoreAllMocks();
    });
  });
});
