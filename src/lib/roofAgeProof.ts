export const PENDING_ROOF_AGE_LABEL =
  "There is no publicly available data for the roof age.";

export type RoofAgeSnapshotRow = {
  parcel_identifier: string;
  builtYear: null;
  roof_date: string | null;
  roof_age_years: number | null;
  roof_age_source: "permit_updated" | "none";
  roof_age_confidence: "high" | "none";
  roof_age_permit_id: string | null;
  roof_age_eligibility_reason:
    | "accepted_completed_primary_roof_replacement"
    | "no_valid_anchor";
  olderThan15Years: boolean;
};

export type RoofAgeSnapshotFile = {
  parcels: Record<string, RoofAgeSnapshotRow>;
};

let roofAgeByUndashedApn: Readonly<Record<string, RoofAgeSnapshotRow>> = {};

export function undashedApn(apn: string) {
  return apn.replace(/-/g, "").trim();
}

export function roofAgeRowsWithDates(
  parcels: Record<string, RoofAgeSnapshotRow>
) {
  const dated: Record<string, RoofAgeSnapshotRow> = {};

  for (const [apn, row] of Object.entries(parcels)) {
    if (typeof row.roof_age_years === "number") dated[apn] = row;
  }

  return dated;
}

export function installRoofAgeSnapshot(
  parcels: Record<string, RoofAgeSnapshotRow>
) {
  const next: Record<string, RoofAgeSnapshotRow> = {};

  for (const [key, row] of Object.entries(parcels)) {
    next[undashedApn(key)] = row;
  }

  roofAgeByUndashedApn = next;
}

export function roofAgeSnapshotRow(apn: string) {
  return roofAgeByUndashedApn[undashedApn(apn)];
}

export function roofAgeCardLabel(apn: string) {
  const proof = roofAgeSnapshotRow(apn);
  if (!proof) return PENDING_ROOF_AGE_LABEL;

  if (
    proof.roof_age_eligibility_reason === "no_valid_anchor" ||
    proof.roof_age_years === null
  ) {
    return PENDING_ROOF_AGE_LABEL;
  }

  const years = proof.roof_age_years;
  const age = `${years} ${years === 1 ? "year" : "years"} old`;
  const replaced = proof.roof_date
    ? `replaced ${proof.roof_date}`
    : "replacement date unavailable";
  const permit = proof.roof_age_permit_id
    ? `permit ${proof.roof_age_permit_id}`
    : "permit number unavailable";

  return `${age}, ${replaced}, ${permit}`;
}

export function roofAgeSourceLabel(apn: string) {
  const proof = roofAgeSnapshotRow(apn);
  if (
    !proof ||
    proof.roof_age_source !== "permit_updated" ||
    proof.roof_age_years === null
  ) {
    return "Roof age source: the published snapshot has no dated roof replacement for this parcel.";
  }

  return "Roof age source: the published snapshot of a completed San Jose re-roof permit.";
}

export function meetsMinimumRoofAge(apn: string, minimumYears: number) {
  const years = roofAgeSnapshotRow(apn)?.roof_age_years;
  return typeof years === "number" && years >= minimumYears;
}

export function parcelsMeetingMinimumRoofAge<T extends { apn: string }>(
  parcels: readonly T[],
  minimumYears: number
) {
  return parcels.filter((parcel) =>
    meetsMinimumRoofAge(parcel.apn, minimumYears)
  );
}
