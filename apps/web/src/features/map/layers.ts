import type { LeadCandidate } from "@crm/shared";
import type { FeatureCollection, Point } from "geojson";
import { isLongOpen, years } from "../../lib/format.ts";
import type { AgentResult } from "../../state.tsx";

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const CANDIDATE_LAYERS = ["aged-roofs", "open-permits"] as const;

export interface CandidateProps {
  id: string;
  kind: "aged" | "permit";
  roofAge: number;
  openYears: number;
  longOpen: boolean;
  selected: boolean;
}

export function maxOpenDays(c: LeadCandidate): number | null {
  const d = c.openRoofPermits.map((p) => p.openDays).filter((x): x is number => x !== null);
  return d.length ? Math.max(...d) : null;
}

/** Candidates as map features: open-permit properties get their own, emphasized style. */
export function candidateFeatures(
  cs: LeadCandidate[],
  selectedId?: string | null,
): FeatureCollection<Point, CandidateProps> {
  return {
    type: "FeatureCollection",
    features: cs.map((c) => {
      const open = maxOpenDays(c);
      return {
        type: "Feature",
        id: c.propertyId,
        geometry: { type: "Point", coordinates: [c.lon, c.lat] },
        properties: {
          id: c.propertyId,
          kind: c.openRoofPermits.length ? "permit" : "aged",
          roofAge: c.roofAgeYears ?? 0,
          openYears: years(open) ?? 0,
          longOpen: isLongOpen(open),
          selected: c.propertyId === selectedId,
        },
      };
    }),
  };
}

export function agentFeatures(rs: AgentResult[]): FeatureCollection<Point, { id: string; label: string }> {
  return {
    type: "FeatureCollection",
    features: rs.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lon, r.lat] },
      properties: { id: r.propertyId, label: r.label },
    })),
  };
}

export const ROOF_AGE_COLORS = [
  { from: 0, color: "#f2c14e", label: "< 25 y" },
  { from: 25, color: "#f08a24", label: "25–39 y" },
  { from: 40, color: "#c8342b", label: "40 y +" },
] as const;
export const PERMIT_COLOR = "#6d28d9";
export const AGENT_COLOR = "#0d9488";

/** MapLibre layer specs (kept here so the style rules are testable without WebGL). */
export const LAYER_SPECS = [
  {
    id: "aged-roofs",
    type: "circle",
    source: "candidates",
    filter: ["==", ["get", "kind"], "aged"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 6],
      "circle-color": [
        "step",
        ["get", "roofAge"],
        ROOF_AGE_COLORS[0].color,
        25,
        ROOF_AGE_COLORS[1].color,
        40,
        ROOF_AGE_COLORS[2].color,
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 0.5,
      "circle-opacity": 0.85,
    },
  },
  {
    id: "open-permits",
    type: "circle",
    source: "candidates",
    filter: ["==", ["get", "kind"], "permit"],
    paint: {
      // Grows with zoom and with years open; long-open permits get a heavy dark ring.
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        ["+", 2, ["*", 0.25, ["get", "openYears"]]],
        14,
        ["+", 5, ["*", 0.8, ["get", "openYears"]]],
      ],
      "circle-color": PERMIT_COLOR,
      "circle-opacity": 0.9,
      "circle-stroke-color": ["case", ["get", "longOpen"], "#111827", "#ffffff"],
      "circle-stroke-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        ["case", ["get", "longOpen"], 1, 0.5],
        14,
        ["case", ["get", "longOpen"], 3, 1],
      ],
    },
  },
  {
    id: "selected",
    type: "circle",
    source: "candidates",
    filter: ["==", ["get", "selected"], true],
    paint: {
      "circle-radius": 14,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": "#2563eb",
      "circle-stroke-width": 3,
    },
  },
  {
    id: "agent-results",
    type: "circle",
    source: "agent",
    paint: {
      "circle-radius": 9,
      "circle-color": AGENT_COLOR,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  },
] as const;
