/**
 * Design tests: radius circle must draw as soon as the style is loaded.
 *
 * Waiting for MapLibre `idle` (tiles + camera) made the walk circle lag the slider.
 */
import { describe, expect, it, vi } from "vitest";

import { runWhenMapStyleReady } from "../../src/map/run-when-map-style-ready";

describe("runWhenMapStyleReady", () => {
  it("runs immediately when the style is loaded and the canvas has size", () => {
    const once = vi.fn();
    const callback = vi.fn();
    const map = {
      isStyleLoaded: () => true,
      getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
      once,
    };

    runWhenMapStyleReady(map, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(once).not.toHaveBeenCalledWith("idle", expect.any(Function));
  });

  it("waits for load when the style is not ready yet", () => {
    const loadListeners: Array<() => void> = [];
    const callback = vi.fn();
    const map = {
      isStyleLoaded: () => false,
      getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
      once: (event: string, listener: () => void) => {
        if (event === "load") {
          loadListeners.push(listener);
        }
      },
    };

    runWhenMapStyleReady(map, callback);

    expect(callback).not.toHaveBeenCalled();
    expect(loadListeners).toHaveLength(1);
    map.isStyleLoaded = () => true;
    loadListeners[0]?.();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
