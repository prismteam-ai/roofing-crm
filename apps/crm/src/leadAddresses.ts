/**
 * The leads list's addresses, looked up at display time: one parcels.detail read per shown lead at most (the
 * answer, or its absence, is kept in memory for the page's life), at most ADDRESS_MAX_IN_FLIGHT reads at once,
 * and only while the list is open. Nothing is stored with a lead or sent to the leads API: a lead holds the
 * parcel only. The list passes one pacer to this lookup and to its permit-status reads (leadPermits.ts), so the
 * two together never have more than ADDRESS_MAX_IN_FLIGHT reads in flight.
 */
import { useEffect, useRef, useState } from "react";
import { Pacer } from "./leadsInSearch.ts";

export const ADDRESS_MAX_IN_FLIGHT = 4;

/** The pacer of the leads list's data API reads (addresses and permit statuses): at most 4 at once, no gap. */
export const newLeadReadPacer = () => new Pacer(ADDRESS_MAX_IN_FLIGHT, 0);

/** Reads one parcel's address; null when the parcel has none. */
export type AddressLookup = (parcelId: string) => Promise<string | null>;

/** The address of a parcels.detail answer's property, or null. */
export const addressOf = (property: Record<string, unknown>) =>
  typeof property.address === "string" && property.address.trim()
    ? property.address
    : null;

/**
 * The addresses of the given parcels: a parcel is read once (a failed read shows no address and is not
 * retried); undefined until its read answered. No read while `on` is false or without a lookup. `pacer`: the
 * list's shared pacer (one of its own when not given).
 */
export function useLeadAddresses(
  lookup: AddressLookup | undefined,
  ids: string[],
  on: boolean,
  pacer?: Pacer,
): ReadonlyMap<string, string | null> {
  const asked = useRef(new Set<string>());
  const [ownPacer] = useState(newLeadReadPacer);
  const reads = pacer ?? ownPacer;
  const [found, setFound] = useState<ReadonlyMap<string, string | null>>(
    () => new Map(),
  );
  // A stable string, so a new array with the same parcels starts nothing.
  const wanted = on && lookup ? ids.join(",") : "";
  useEffect(() => {
    if (!lookup || !wanted) return;
    for (const id of wanted.split(",")) {
      if (asked.current.has(id)) continue;
      asked.current.add(id);
      void reads
        .run(() => lookup(id))
        .then(
          (a) => a,
          () => null,
        )
        .then((a) => setFound((m) => new Map(m).set(id, a)));
    }
  }, [lookup, wanted, reads]);
  return found;
}
