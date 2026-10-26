// The owner's mailing location from the two v1.2 columns. Each holds the distinct values of the
// current owners, sorted and '; '-separated, so the two lists pair up only when their counts match.
import type { CrmProperty } from "@crm/index-schema";

export type MailingLocation = {
  /** `TX 78660` or `TX 78660; CA 90210`; unpaired lists read `State TX, CA; ZIP 78660`. */
  readonly text: string;
};

const parts = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v !== "");

/** The mailing line, or null when neither column carries a value (the screen then states the
 *  reason from the row's `missing` entries). */
export function mailingLocation(
  property: Pick<CrmProperty, never> & {
    readonly ownerMailingStateCode?: string | null | undefined;
    readonly ownerMailingPostalCode?: string | null | undefined;
  },
): MailingLocation | null {
  const states = parts(property.ownerMailingStateCode);
  const zips = parts(property.ownerMailingPostalCode);
  if (states.length === 0 && zips.length === 0) return null;
  if (states.length === zips.length) {
    return { text: states.map((state, i) => `${state} ${zips[i] ?? ""}`.trim()).join("; ") };
  }
  const pieces = [
    states.length === 0 ? null : `State ${states.join(", ")}`,
    zips.length === 0 ? null : `ZIP ${zips.join(", ")}`,
  ].filter((p): p is string => p !== null);
  return { text: pieces.join("; ") };
}

/** The pill wording for an owner area class; null for `unknown` or absent (show the reason). */
export function ownerAreaPill(
  areaClass: CrmProperty["ownerAreaClass"] | undefined,
): { readonly text: string; readonly status: "info" | "warning" } | null {
  switch (areaClass) {
    case "in_county":
      return { text: "Local", status: "info" };
    case "regional":
      return { text: "Regional", status: "info" };
    case "out_of_area":
      return { text: "Out-of-area", status: "warning" };
    default:
      return null;
  }
}
