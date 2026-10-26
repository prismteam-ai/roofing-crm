// The shell's route/nav table. Primary destinations (bottom bar and rail) and the five
// Coming-soon sections with the icon and one line the boards draw (CrmShell1440, CrmBottomNav).
// Labels and section ids come from @crm/shared's ROADMAP_SECTIONS, so `/coming-soon/:section`
// and every `data-roadmap-section` stay in step with the Coming Soon route.
import { ROADMAP_SECTIONS, type RoadmapSection } from "@crm/shared";

/** The map screen's three modes, in the URL as `?mode=` (absent = map). The AI mode is the
 *  agent (CRM-HANDOFF 4.7): it lives inside the map, so Ask is not a page of its own. */
export type ShellMode = "map" | "filters" | "ai";

export interface Destination {
  /** Where the link goes (a path, with `?mode=` for the map's modes). */
  readonly to: string;
  /** The route the destination lives on, matched exactly. */
  readonly route: "/" | "/leads";
  /** For the map's destinations: which `mode` makes this one the current page. */
  readonly modes?: readonly ShellMode[];
  readonly label: string;
  /** Material Symbols Rounded glyph name (Atlas § 6). */
  readonly icon: string;
  /** Where it is drawn: "bar" = bottom bar only (below 600 px), "rail" = rail only (from 600 px),
   *  "both" = in either. */
  readonly where: "bar" | "rail" | "both";
  /** A child of Map in the rail (CrmShell1440): a smaller pill under Map. */
  readonly nested?: boolean;
}

/** CrmShell1440 / CrmBottomNav. Rail: Map with Filters and AI nested under it, then Leads.
 *  Bottom bar: Map, Leads, Ask, where Ask opens the map in AI mode (`/?mode=ai`), so the same
 *  destination is "AI" in the rail and "Ask" on a phone, as the boards draw it. */
export const DESTINATIONS: readonly Destination[] = [
  { to: "/", route: "/", modes: ["map", "filters"], label: "Map", icon: "map", where: "both" },
  {
    to: "/?mode=filters",
    route: "/",
    modes: ["filters"],
    label: "Filters",
    icon: "tune",
    where: "rail",
    nested: true,
  },
  {
    to: "/?mode=ai",
    route: "/",
    modes: ["ai"],
    label: "AI",
    icon: "auto_awesome",
    where: "rail",
    nested: true,
  },
  { to: "/leads", route: "/leads", label: "Leads", icon: "contact_page", where: "both" },
  // CrmBottomNav draws Ask with the robot glyph (Atlas § 6: `smart_toy` = agent).
  { to: "/?mode=ai", route: "/", modes: ["ai"], label: "Ask", icon: "smart_toy", where: "bar" },
];

/** The live top-level sections by name (Map, Leads), read from DESTINATIONS so the Coming-soon
 *  page never states a different set than the navigation draws. */
export const LIVE_SECTION_LABELS: readonly string[] = DESTINATIONS.filter(
  (d) => d.where !== "bar" && d.nested !== true,
).map((d) => d.label);

/** Reads the map mode out of a query string; anything else is the map. */
export function shellModeOf(search: string): ShellMode {
  const mode = new URLSearchParams(search).get("mode");
  return mode === "ai" || mode === "filters" ? mode : "map";
}

const ROADMAP_ICON_AND_LINE: Readonly<Record<RoadmapSection, { icon: string; line: string }>> = {
  campaigns: { icon: "campaign", line: "Plan outreach to groups of leads." },
  estimates: { icon: "request_quote", line: "Price a roof from the lead." },
  jobs: { icon: "construction", line: "Schedule and track roofing work." },
  invoices: { icon: "receipt_long", line: "Bill completed jobs." },
  outreach: { icon: "mail", line: "Email and SMS to owners." },
};

export interface RoadmapNavItem {
  readonly section: RoadmapSection;
  readonly label: string;
  readonly icon: string;
  readonly line: string;
}

export const ROADMAP_NAV: readonly RoadmapNavItem[] = ROADMAP_SECTIONS.map(
  ({ section, label }) => ({ section, label, ...ROADMAP_ICON_AND_LINE[section] }),
);

/** The one county the CRM serves (CountyLens publishes Travis only): the name for sentences and
 *  the label with its state for headers. Every screen imports these; none repeats the literal. */
export const COUNTY_NAME = "Travis County";
export const COUNTY_LABEL = `${COUNTY_NAME}, TX`;
