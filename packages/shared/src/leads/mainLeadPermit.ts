// The one rule for "the permit a lead is about": among a property's permits, the live (open or
// stalled, and not finaled) one open longest. The agent path (apps/api routers/agent.ts) uses it to save a lead's permit
// signals; the map's why-this-lead and the Candidate list state the same rule.

export interface LeadPermitLike {
  readonly statusClass?: string | null | undefined;
  readonly openDays?: number | null | undefined;
  readonly finalDate?: string | null | undefined;
}

/** The `statusClass` values that can be a live permit: a stalled permit is an open one that is
 *  not progressing, so "open" always includes it. A permit with a `finalDate` is finished whatever
 *  its class says (Task A derives "stalled" from a missing status plus an old issue date and
 *  ignores the final date: 952 of the 1,674 stalled permits in Run 3.1 carry one), so a live
 *  permit is one of these classes AND has no `finalDate`. */
export const LIVE_PERMIT_STATUS_CLASSES = ["open", "stalled"] as const;

/** The permit-status filter chips (Open, Stalled, Any) as the `statusClass` values to send:
 *  Open = open or stalled, Stalled = stalled only, Any = no filter (undefined). */
export function permitStatusClassesFor(
  status: "open" | "stalled" | "any" | undefined,
): ("open" | "stalled")[] | undefined {
  if (status === "open") return [...LIVE_PERMIT_STATUS_CLASSES];
  if (status === "stalled") return ["stalled"];
  return undefined;
}

/** A permit that is finished because it has a final date, whatever its status class says. */
export function isFinaledPermit(permit: LeadPermitLike): boolean {
  return permit.finalDate !== null && permit.finalDate !== undefined && permit.finalDate !== "";
}

/** An open or stalled permit with no final date; a closed one, a finaled one, or one with no
 *  status, is not a live signal. */
export function isLivePermit(permit: LeadPermitLike): boolean {
  return (
    (permit.statusClass === "open" || permit.statusClass === "stalled") && !isFinaledPermit(permit)
  );
}

/** The live (open or stalled, not finaled) permit open longest (no published `openDays` ranks last), else null. The
 *  first of equal candidates wins, so the result does not depend on a sort's stability. */
export function mainLeadPermit<T extends LeadPermitLike>(
  permits: readonly T[] | undefined,
): T | null {
  let best: T | null = null;
  for (const permit of permits ?? []) {
    if (!isLivePermit(permit)) continue;
    if (best === null || (permit.openDays ?? -1) > (best.openDays ?? -1)) best = permit;
  }
  return best;
}

/** What a lead's signals snapshot keeps about the main permit's contractor. The name is exactly as
 *  the permit prints it (unverified); `bbbStatus` is Task A's BBB state. `contractorRecorded` is
 *  true whenever the snapshot was taken with a permit and these fields were read, so a lead with no
 *  name can say "no contractor printed" while an older lead (no flag) says "not saved". */
export interface ContractorSnapshotSource {
  readonly contractorNameAsPrinted?: string | null | undefined;
  readonly bbbStatus?: "rated" | "not_found" | "blocked" | "not_checked" | null | undefined;
}

export interface ContractorSnapshot {
  contractor?: string;
  bbbStatus?: "rated" | "not_found" | "blocked" | "not_checked";
  contractorRecorded?: true;
}

export function contractorSnapshot(
  permit: ContractorSnapshotSource | null | undefined,
): ContractorSnapshot {
  if (permit === null || permit === undefined) return {};
  const name = permit.contractorNameAsPrinted?.trim();
  return {
    ...(name === undefined || name === "" ? {} : { contractor: name }),
    ...(permit.bbbStatus == null ? {} : { bbbStatus: permit.bbbStatus }),
    contractorRecorded: true,
  };
}
