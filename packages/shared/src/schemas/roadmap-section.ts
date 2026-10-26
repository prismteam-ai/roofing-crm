// T026 (data-model.md "RoadmapSection (static enum, no storage)"): the fixed list of five
// not-yet-built CRM sections, rendered as disabled NavRows (packages/ui/src/NavRow) and as the
// Coming Soon route's `:section` param. No table — this is a Zod enum, not data.
import { z } from "zod";

export const RoadmapSection = z.enum(["campaigns", "estimates", "jobs", "invoices", "outreach"]);
export type RoadmapSection = z.infer<typeof RoadmapSection>;

export interface RoadmapSectionMeta {
  readonly section: RoadmapSection;
  readonly label: string;
}

export const ROADMAP_SECTIONS: readonly RoadmapSectionMeta[] = Object.freeze([
  { section: "campaigns", label: "Campaigns" },
  { section: "estimates", label: "Estimates" },
  { section: "jobs", label: "Jobs" },
  { section: "invoices", label: "Invoices" },
  { section: "outreach", label: "Outreach" },
]);
