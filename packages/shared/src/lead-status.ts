/**
 * Outreach lifecycle for a CRM LeadRecord.
 *
 * Matches the persisted lead state machine: create → new, then user updates,
 * ending at archived (soft-delete). Elephant property facts are never mutated.
 */
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "lost",
  "won",
  "archived",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Returns true when the value is a documented LeadStatus.
 */
export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}
