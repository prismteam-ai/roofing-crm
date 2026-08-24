/**
 * First-run HUD tour copy (three steps on the real plat chrome).
 */

export const MAP_FIRST_RUN_TOUR_STORAGE_KEY = "plat-map-first-run-tour-v1";

export const MAP_FIRST_RUN_TOUR_STEPS = [
  {
    id: "pin",
    heading: "Pick today’s walk",
    body: "Drag the pin onto a block you want to canvass. We sweep that circle for aging roofs and long-open permits.",
  },
  {
    id: "radius",
    heading: "Set your loop",
    body: "Two miles is a tight canvassing loop. Widen the walk only when the block is thin.",
  },
  {
    id: "doors",
    heading: "Read the doors",
    body: "Roofs in this radius lists candidates worth knocking. Open one, judge the facts, convert the keepers to leads.",
  },
] as const;

export type MapFirstRunTourStepId = (typeof MAP_FIRST_RUN_TOUR_STEPS)[number]["id"];
