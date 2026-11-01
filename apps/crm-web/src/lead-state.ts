import { LeadSchema, type Lead } from "../../../packages/contracts/src/index";

/** A synchronous guard also blocks two events before React renders disabled controls. */
export class LeadMutationGate {
  private active: symbol | null = null;
  start(): symbol | null {
    if (this.active) return null;
    const ticket = Symbol("lead mutation");
    this.active = ticket;
    return ticket;
  }
  finish(ticket: symbol): boolean {
    if (this.active !== ticket) return false;
    this.active = null;
    return true;
  }
  reset(): void {
    this.active = null;
  }
}
export interface LeadBinding {
  sessionId: string;
  propertyId: string;
  snapshotId: string;
  id?: string;
  previousVersion?: number;
  previousEventCount?: number;
  change?: { status?: Lead["status"]; note?: string };
}
function parseLead(input: unknown): Lead {
  const parsed = LeadSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      "The lead reply was invalid. Reload saved leads before trying again.",
    );
  return parsed.data;
}
export function confirmedLead(input: unknown, expected: LeadBinding): Lead {
  const lead = parseLead(input);
  if (
    lead.sessionId !== expected.sessionId ||
    lead.propertyId !== expected.propertyId ||
    lead.snapshotId !== expected.snapshotId ||
    (expected.id !== undefined && lead.id !== expected.id) ||
    (expected.previousVersion !== undefined &&
      lead.version !== expected.previousVersion + 1)
  )
    throw new Error(
      "The saved lead reply did not match this selection and version. Reload saved leads before trying again.",
    );
  const change = expected.change;
  if (change) {
    const event = lead.events.at(-1);
    if (
      (expected.previousEventCount !== undefined &&
        lead.events.length !== expected.previousEventCount + 1) ||
      (change.status !== undefined && lead.status !== change.status) ||
      event?.kind !== (change.status ? `status:${change.status}` : "note") ||
      (change.note !== undefined && event?.note !== change.note.trim())
    )
      throw new Error(
        "The lead reply did not confirm the submitted change. Your note was retained; reload saved leads before trying again.",
      );
  }
  return lead;
}
export function parsedLeadRows(input: unknown, sessionId: string): Lead[] {
  if (!Array.isArray(input)) throw new Error("Saved leads were unavailable.");
  const rows = input.map(parseLead);
  if (rows.some((lead) => lead.sessionId !== sessionId))
    throw new Error("Saved leads did not match this review session.");
  return rows;
}
/** Leads are archived rather than deleted. A stale list must not remove or regress confirmed records. */
export function mergeLeadRows(
  current: Lead[],
  incoming: Lead[],
  sessionId: string,
): Lead[] {
  const rows = new Map<string, Lead>();
  for (const lead of [...incoming, ...current]) {
    if (lead.sessionId !== sessionId)
      throw new Error("Saved leads did not match this review session.");
    const previous = rows.get(lead.id);
    if (
      previous &&
      (previous.propertyId !== lead.propertyId ||
        previous.snapshotId !== lead.snapshotId)
    )
      throw new Error("Saved lead identity changed unexpectedly.");
    if (!previous || lead.version >= previous.version) rows.set(lead.id, lead);
  }
  return [...rows.values()];
}
export interface NoteDraft {
  value: string;
  revision: number;
}
export function unchangedSubmittedDraft(
  submitted: NoteDraft,
  current: NoteDraft,
): boolean {
  return (
    submitted.value === current.value && submitted.revision === current.revision
  );
}
