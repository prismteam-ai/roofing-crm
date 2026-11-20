/**
 * The leads list's permit-status filter: the status class of a lead's OWN permit (source_permit, the permit row a
 * lead was created from), read at display time from the data API's permits.forParcel for the lead's parcel and
 * picked out by permit number. One read per lead at most (the answer, or its failure, is kept in memory for the
 * page's life), through the list's shared pacer (at most 4 data API reads at once with the address lookup), and
 * only while a status choice is set. Nothing is stored with a lead or sent to the leads API or the agent.
 */
import { useEffect, useRef, useState } from "react";
import type { ParcelPermits, PermitStatusClass } from "./permitsApi.ts";
import { statusClassLabel } from "./permitDisplay.ts";
import type { Pacer } from "./leadsInSearch.ts";

/** A choice of the permit-status filter: every lead, a status class of the lead's permit, or no permit. */
export type PermitChoice =
  "all" | "open-issued" | "open-application" | "closed" | "unclear" | "none";

/** The status classes a lead's permit can be filtered by (the data API's own; "unmapped" is not offered). */
const CHOICE_CLASSES = [
  "open-issued",
  "open-application",
  "closed",
  "unclear",
] as const satisfies readonly PermitStatusClass[];

/** The filter's options in order, with their screen texts (the status labels the permit panels already show). */
export const PERMIT_CHOICES: ReadonlyArray<{
  value: PermitChoice;
  text: string;
}> = [
  { value: "all", text: "all permit statuses" },
  ...CHOICE_CLASSES.map((c) => ({ value: c, text: statusClassLabel(c) })),
  { value: "none", text: "no permit on the lead" },
];

/** Shown beside a lead's permit when its status could not be read. */
export const PERMIT_STATUS_NOT_AVAILABLE = "status not available";

/** Reads the status class of a parcel's permit; null when the parcel's permits do not include that number. */
export type PermitStatusLookup = (
  parcelId: string,
  permitNumber: string,
) => Promise<PermitStatusClass | null>;

/** The status class of one permit in a permits.forParcel answer, or null when the answer does not list it. */
export const statusOfPermit = (data: ParcelPermits, permitNumber: string) =>
  data.permits.find((p) => p.permit_number === permitNumber)
    ?.permit_status_class ?? null;

/** What the list knows of a lead's permit: its class, or "unavailable" (the read failed or did not list it). */
export type PermitRead = PermitStatusClass | "unavailable";

/** The lead fields the filter uses. */
export interface PermitLead {
  parcel_id: string;
  source_permit?: string;
}

/** The key of a lead's permit read (a lead's permit is set at creation and never changes). */
export const permitKey = (l: PermitLead) =>
  `${l.parcel_id}|${l.source_permit ?? ""}`;

/** The choice reads the data API (a status class); "all" and "none" are decided from the lead alone. */
export const choiceReads = (c: PermitChoice) => c !== "all" && c !== "none";

/**
 * Whether a lead passes the choice: undefined while its permit's read has not answered. A lead without a permit
 * passes "none" only; a lead whose permit could not be read passes every status choice (it is never dropped).
 */
export function passesPermitChoice(
  lead: PermitLead,
  choice: PermitChoice,
  reads: ReadonlyMap<string, PermitRead>,
): boolean | undefined {
  if (choice === "all") return true;
  if (!lead.source_permit) return choice === "none";
  if (choice === "none") return false;
  const r = reads.get(permitKey(lead));
  if (r === undefined) return undefined;
  return r === "unavailable" || r === choice;
}

/** The text shown beside a lead's permit once read: its status label, or "status not available". */
export const permitReadText = (r: PermitRead) =>
  r === "unavailable" ? PERMIT_STATUS_NOT_AVAILABLE : statusClassLabel(r);

/**
 * The permit reads of the given leads (those with a permit): each read once; a failed read, or an answer that
 * does not list the permit, is "unavailable" and is not retried. No read while `on` is false or without a lookup.
 */
export function useLeadPermits(
  lookup: PermitStatusLookup | undefined,
  leads: readonly PermitLead[],
  on: boolean,
  pacer: Pacer,
): ReadonlyMap<string, PermitRead> {
  const asked = useRef(new Set<string>());
  const [found, setFound] = useState<ReadonlyMap<string, PermitRead>>(
    () => new Map(),
  );
  // A stable string, so a new array with the same leads starts nothing.
  const wanted =
    on && lookup
      ? leads
          .filter((l) => l.source_permit)
          .map(permitKey)
          .join(",")
      : "";
  useEffect(() => {
    if (!lookup || !wanted) return;
    for (const key of wanted.split(",")) {
      if (asked.current.has(key)) continue;
      asked.current.add(key);
      const [parcelId, permitNumber] = key.split("|") as [string, string];
      void pacer
        .run(() => lookup(parcelId, permitNumber))
        .then(
          (c): PermitRead => c ?? "unavailable",
          (): PermitRead => "unavailable",
        )
        .then((r) => setFound((m) => new Map(m).set(key, r)));
    }
  }, [lookup, wanted, pacer]);
  return found;
}
