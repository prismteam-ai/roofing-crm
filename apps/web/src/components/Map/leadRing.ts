// The "My leads" marker ring (CRM-HANDOFF E-52/E-72): an outline around a marker that already has
// a lead. The status is carried by line style as well as colour, never colour alone (prototype
// Explore1440 legend: solid New, dashed Contacted, double Qualified and Won, dotted Lost). It is
// an outline outside the dot, so the roof-age fill stays visible and the long-open permit ring
// (a border) and the triage ring (a box-shadow) can show with it.
import type { LeadStatus } from "@crm/shared";

export interface LeadRing {
  readonly style: "solid" | "dashed" | "double" | "dotted";
  /** Token reference, so the ring follows dark mode with no re-render. */
  readonly color: string;
  readonly label: string;
}

const LEAD_RING: Readonly<Record<LeadStatus, LeadRing>> = {
  new: { style: "solid", color: "var(--md-sys-color-tertiary)", label: "New" },
  contacted: { style: "dashed", color: "var(--md-sys-color-tertiary)", label: "Contacted" },
  qualified: { style: "double", color: "var(--md-sys-color-tertiary)", label: "Qualified" },
  won: { style: "double", color: "var(--md-sys-color-tertiary)", label: "Won" },
  lost: { style: "dotted", color: "var(--md-sys-color-on-surface-variant)", label: "Lost" },
};

export function leadRing(status: LeadStatus): LeadRing {
  return LEAD_RING[status];
}

/** The legend line, built from the same table the markers use. */
export const LEAD_RING_LEGEND =
  "Ringed = already a lead (solid New, dashed Contacted, double Qualified and Won, dotted Lost)";
