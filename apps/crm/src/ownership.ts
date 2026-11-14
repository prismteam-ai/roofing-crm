/**
 * The ownership filter on the search: what each basis means and its weakness, in the data API contract's own
 * words. The texts are typed against the contract's literal-typed constants (OWNERSHIP_BASIS,
 * OWNERSHIP_PROXY_NOTE), so any other wording fails the typecheck. The client declares those constants as
 * types only (no runtime value), so the CRM keeps its own copies.
 */
import type {
  OWNERSHIP_BASIS,
  OWNERSHIP_PROXY_NOTE,
  OwnershipBasis,
} from "@oracle-la/api-client";

export const OWNERSHIP_TEXTS: typeof OWNERSHIP_BASIS = {
  recording: {
    text: "Owner unchanged for 10 years or more, by recorded documents: no document recorded on the parcel in the 10 years before the run's reference date.",
    weakness:
      "Any recorded document resets it, not only a sale: a refinance or a lien drops a long-time owner.",
  },
  base_year: {
    text: "Owner unchanged for 10 years or more, by reassessment: the parcel's land base year is 10 or more years before the run's reference date (no reassessment since).",
    weakness:
      "Transfers that do not reassess escape it: a transfer between spouses or from parent to child keeps the old base year, so a new owner can pass.",
  },
  both: {
    text: "Owner unchanged for 10 years or more, by both: no recorded document and no reassessment in the 10 years before the run's reference date.",
    weakness:
      "The strictest of the three: a parcel must pass both, so a refinance or a lien still drops a long-time owner, and the fewest parcels pass.",
  },
};
export const PROXY_NOTE: typeof OWNERSHIP_PROXY_NOTE =
  "All three bases are proxies from the County assessor roll, not sales records: neither date is a sale date.";

/** The bases in the control's order, with short labels; "both" is preselected when the filter is turned on. */
export const BASES: ReadonlyArray<[OwnershipBasis, string]> = [
  ["both", "Both (no recorded document and no reassessment)"],
  ["recording", "No recorded document in 10 years"],
  ["base_year", "No reassessment in 10 years (land base year)"],
];
export const DEFAULT_BASIS: OwnershipBasis = "both";
/** The ownership filter as the app keeps it: off by default; the basis is kept while it is off. */
export interface OwnershipFilter {
  on: boolean;
  basis: OwnershipBasis;
}
export const OWNERSHIP_OFF: OwnershipFilter = {
  on: false,
  basis: DEFAULT_BASIS,
};
const KNOWN = new Set<string>(BASES.map(([b]) => b));
/** A basis read back from a search key; anything else is no filter. */
export const basisOf = (v: string | undefined): OwnershipBasis | undefined =>
  v !== undefined && KNOWN.has(v) ? (v as OwnershipBasis) : undefined;
