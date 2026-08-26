/**
 * Minimal MapLibre surface used to attach layers after the style is ready.
 */
export interface MapStyleReadyTarget {
  isStyleLoaded(): boolean | void;
  getCanvas(): { clientWidth: number; clientHeight: number };
  once(event: string, listener: () => void): unknown;
}

/**
 * Runs after the basemap style is ready — MapLibre markers/layers throw if added too early.
 *
 * Does not wait for MapLibre `idle`. Idle waits for tiles and camera, which made the
 * walk-radius circle lag the slider after pointer-up.
 */
export function runWhenMapStyleReady(
  map: MapStyleReadyTarget,
  callback: () => void,
): () => void {
  let cancelled = false;
  const run = (): void => {
    if (cancelled) {
      return;
    }
    if (map.isStyleLoaded() !== true) {
      map.once("load", run);
      return;
    }
    if (map.getCanvas().clientWidth === 0 || map.getCanvas().clientHeight === 0) {
      window.requestAnimationFrame(run);
      return;
    }
    callback();
  };
  run();
  return () => {
    cancelled = true;
  };
}
