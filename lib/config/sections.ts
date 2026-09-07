/**
 * Navigation and the disabled "future" product sections (acceptance criterion:
 * show disabled sections that would expand the CRM beyond lead identification).
 *
 * @module config/sections
 */
export interface NavItem {
  href: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface FutureSection extends NavItem {
  slug: string;
  wouldDo: readonly string[];
  dependsOn: readonly string[];
}

export const PRIMARY_NAV: readonly NavItem[] = [
  {
    href: "/",
    label: "Map CRM",
    description: "Radius search for aging roofs and open permits",
    enabled: true,
  },
  {
    href: "/leads",
    label: "Leads",
    description: "Lead pipeline, notes and permit snapshots",
    enabled: true,
  },
  {
    href: "/assistant",
    label: "Assistant",
    description: "Tool-using SQL agent with a documentation knowledge index",
    enabled: true,
  },
];

export const FUTURE_SECTIONS: readonly FutureSection[] = [
  {
    slug: "outreach",
    href: "/coming-soon/outreach",
    label: "Outreach",
    description: "Email and SMS sequences to property owners",
    enabled: false,
    wouldDo: [
      "Template-based email and SMS sequences triggered from a lead's stage.",
      "Owner mailing address merge fields from the appraiser roll (no phone/email exists in the open dataset, so contact enrichment would be a separate integration).",
      "Consent, opt-out and quiet-hours handling before any message is sent.",
    ],
    dependsOn: [
      "Messaging provider integration (e.g. SES / Twilio)",
      "Contact enrichment source",
      "Compliance review (TCPA / CAN-SPAM)",
    ],
  },
  {
    slug: "quotes",
    href: "/coming-soon/quotes",
    label: "Quotes & Proposals",
    description: "Roof measurements, pricing and e-signature",
    enabled: false,
    wouldDo: [
      "Roof area estimate from the parcel's heated area and building footprint as a starting point for pricing.",
      "Material and labour price books, margins and financing options.",
      "PDF proposal generation and e-signature with status pushed back to the lead (quoted -> won/lost).",
    ],
    dependsOn: ["Aerial measurement provider", "Price book configuration", "E-signature provider"],
  },
  {
    slug: "crews",
    href: "/coming-soon/crews",
    label: "Crews & Scheduling",
    description: "Crew calendars, job routing and permit tracking",
    enabled: false,
    wouldDo: [
      "Crew calendars and drive-time-aware job routing from the lead's coordinates.",
      "Permit application tracking so a won job never becomes the next long-open permit.",
      "Weather holds and homeowner notifications.",
    ],
    dependsOn: ["Calendar integration", "Permit portal submission workflow"],
  },
  {
    slug: "reporting",
    href: "/coming-soon/reporting",
    label: "Reporting",
    description: "Funnel, territory and source-quality dashboards",
    enabled: false,
    wouldDo: [
      "Funnel conversion by lead signal (aged roof vs open permit vs long-open permit).",
      "Territory heat maps of lead density and win rate by ZIP / subdivision.",
      "Data-quality reports: roof-age basis mix, BBB match rate, dataset freshness per pipeline run.",
    ],
    dependsOn: [
      "Warehouse or materialised views over the leads tables",
      "Pipeline run history feed",
    ],
  },
];

/** Look up a future section by slug. */
export function findFutureSection(slug: string): FutureSection | undefined {
  return FUTURE_SECTIONS.find((s) => s.slug === slug);
}
