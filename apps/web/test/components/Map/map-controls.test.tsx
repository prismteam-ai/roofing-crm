// MapControls (boards CrmMap768): zoom in, zoom out, the fit control and drop pin.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapControls } from "../../../src/components/Map/MapControls";
import type { CrmMapHandle } from "../../../src/components/Map/CrmMap";

afterEach(cleanup);

describe("MapControls", () => {
  it("has a fit control with the fit icon that re-fits the ring, or the county with no pin", () => {
    const recenter = vi.fn();
    const mapRef = { current: { recenter } as unknown as CrmMapHandle };
    render(<MapControls mapRef={mapRef} />);
    const fit = screen.getByRole("button", { name: "Recentre" });
    expect(fit.querySelector('[data-icon="center_focus_strong"]')).not.toBeNull();
    fireEvent.click(fit);
    expect(recenter).toHaveBeenCalledTimes(1);
  });

  it("lists zoom in, zoom out, fit and drop pin", () => {
    render(<MapControls mapRef={{ current: null }} onDropPin={() => undefined} />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Zoom in",
      "Zoom out",
      "Recentre",
      "Drop pin",
    ]);
  });
});
