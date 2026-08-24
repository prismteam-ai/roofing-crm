/**
 * Copy for deferred CRM sheets (Campaigns, Inbox, Reports).
 *
 * Tease the job each sheet will do. Stay honest that it is not live.
 * Never open a working Campaigns, Inbox, or Reports workspace in this slice.
 */
export const PLAT_DEFERRED_COMING_LABEL = "Coming soon";

export const DISABLED_CRM_NAV_SECTIONS = [
  {
    id: "inbox",
    label: "Inbox",
    teaseCopy: "Write owners from your leads list without leaving the map.",
    nowCopy: "This walk does not message owners yet. Convert the roofs worth outreach.",
  },
  {
    id: "reports",
    label: "Reports",
    teaseCopy: "See the results of your walks on one page.",
    nowCopy: "Stats and results of your work will be displayed here.",
  },
  {
    id: "campaigns",
    label: "Campaigns",
    teaseCopy: "Take your leads list out as one pass on the block.",
    nowCopy: "Campaigns ride the list you build. Keep converting your leads.",
  },
] as const;

export type DisabledCrmNavSectionId = (typeof DISABLED_CRM_NAV_SECTIONS)[number]["id"];

export type DisabledCrmNavSection = (typeof DISABLED_CRM_NAV_SECTIONS)[number];
