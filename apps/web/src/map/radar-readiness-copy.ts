/**
 * Copy and helpers for the plat HUD radar-readiness meter.
 */

/** Shown while Elephant MCP / Lambda warms on first load. */
export const RADAR_READINESS_STARTING_COPY = "Starting up your radar…";

/** Shown after warmup succeeds before the operator drops a pin. */
export const RADAR_READINESS_READY_COPY = "Radar is live. Drop the pin on a block.";

/** Shown when warmup finished without a 2xx but the search gate is open. */
export const RADAR_READINESS_RELEASED_COPY =
  "Radar may take a moment on the first walk. Try again if roofs fail to load.";
