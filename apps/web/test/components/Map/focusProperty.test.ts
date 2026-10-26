// Selecting a property centres the map on it, close enough to see it, in the part of the map the rep
// can actually see (not under the drawer or the results sheet), and jumps instead of flying when the
// person prefers reduced motion.
import { describe, expect, it } from "vitest";
import {
  DRAWER_WIDTH_PX,
  FOCUS_ZOOM,
  focusCamera,
  focusPadding,
} from "../../../src/components/Map/focusProperty.js";

describe("focusPadding", () => {
  it("from 1280 px the drawer (440 px, right edge) is the only overlay: pad the right", () => {
    expect(focusPadding({ wide: true, mapWidth: 900, mapHeight: 700, sheetHeight: 0 })).toEqual({
      top: 0,
      right: DRAWER_WIDTH_PX,
      bottom: 0,
      left: 0,
    });
  });

  it("pads only the part of the drawer that reaches past the results pane", () => {
    expect(
      focusPadding({ wide: true, mapWidth: 680, mapHeight: 700, sheetHeight: 0, drawerOverlap: 80 })
        .right,
    ).toBe(80);
    expect(
      focusPadding({ wide: true, mapWidth: 680, mapHeight: 700, sheetHeight: 0, drawerOverlap: 0 })
        .right,
    ).toBe(0);
  });

  it("keeps at least a third of a narrow map visible", () => {
    expect(focusPadding({ wide: true, mapWidth: 600, mapHeight: 700, sheetHeight: 0 }).right).toBe(
      400,
    );
    expect(focusPadding({ wide: true, mapWidth: 300, mapHeight: 700, sheetHeight: 0 }).right).toBe(
      200,
    );
  });

  it("with an unknown map size it still reserves the drawer", () => {
    expect(focusPadding({ wide: true, mapWidth: 0, mapHeight: 0, sheetHeight: 0 }).right).toBe(
      DRAWER_WIDTH_PX,
    );
  });

  it("below 1280 px the drawer is a full-height sheet: centre in the strip the results sheet leaves", () => {
    expect(focusPadding({ wide: false, mapWidth: 390, mapHeight: 600, sheetHeight: 240 })).toEqual({
      top: 0,
      right: 0,
      bottom: 240,
      left: 0,
    });
  });

  it("caps the sheet padding so the marker stays on screen, and is zero with no sheet", () => {
    expect(
      focusPadding({ wide: false, mapWidth: 390, mapHeight: 500, sheetHeight: 480 }).bottom,
    ).toBe(300);
    expect(
      focusPadding({ wide: false, mapWidth: 390, mapHeight: 500, sheetHeight: 0 }).bottom,
    ).toBe(0);
  });
});

describe("focusCamera", () => {
  const point = { lat: 30.4431, lng: -97.6182 };
  const padding = { top: 0, right: 440, bottom: 0, left: 0 };

  it("zooms to at least 16, flying smoothly, centred on the property with the padding", () => {
    const camera = focusCamera({ point, currentZoom: 9.2, padding, reducedMotion: false });
    expect(camera).toMatchObject({
      kind: "fly",
      center: [-97.6182, 30.4431],
      zoom: FOCUS_ZOOM,
      padding,
    });
    expect(FOCUS_ZOOM).toBe(16);
    expect(camera.duration).toBeGreaterThan(0);
  });

  it("keeps the current zoom when it is already closer", () => {
    expect(focusCamera({ point, currentZoom: 17.6, padding, reducedMotion: false }).zoom).toBe(
      17.6,
    );
    expect(focusCamera({ point, currentZoom: 16, padding, reducedMotion: false }).zoom).toBe(16);
  });

  it("jumps for a deep link or reload (instant), whatever the motion preference", () => {
    const camera = focusCamera({
      point,
      currentZoom: 9,
      padding,
      reducedMotion: false,
      instant: true,
    });
    expect(camera.kind).toBe("jump");
    expect(camera.duration).toBe(0);
    expect(camera.zoom).toBe(FOCUS_ZOOM);
  });

  it("jumps (no animation) with reduced motion", () => {
    const camera = focusCamera({ point, currentZoom: 9, padding, reducedMotion: true });
    expect(camera.kind).toBe("jump");
    expect(camera.duration).toBe(0);
    expect(camera.center).toEqual([-97.6182, 30.4431]);
    expect(camera.zoom).toBe(FOCUS_ZOOM);
  });
});
