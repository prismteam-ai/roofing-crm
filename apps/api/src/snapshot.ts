import { TRPCError } from "@trpc/server";
import type { LeadInput, LeadSnapshot } from "@crm/leads-db";
import type { OracleData } from "@crm/oracle-data";

/** What a lead stores from the pinned run: its signals and where the property is. */
export async function snapshotFor(oracle: OracleData, propertyId: string): Promise<LeadSnapshot> {
  const d = await oracle.property(propertyId);
  if (!d)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `no property ${propertyId} in run ${oracle.manifestCid}`,
    });
  const p = d.property;
  if (p.lat === null || p.lon === null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `property ${propertyId} has no location in this run`,
    });
  }
  const roofing = d.permits.filter((x) => x.is_roofing);
  return {
    roofAgeYears: p.roof_age_years,
    roofAgeBasis: p.roof_age_basis ?? "unknown",
    maxOpenDays: p.max_open_days,
    bbbGrade: null,
    ownerLocationClass: p.owner_location_class ?? "unknown",
    permitStatuses: [...new Set(roofing.map((x) => x.status))],
    lat: p.lat,
    lon: p.lon,
    address: p.address,
    city: p.city,
  };
}

export async function leadInputFor(
  oracle: OracleData,
  propertyId: string,
  permitId?: string,
): Promise<LeadInput> {
  return {
    propertyId,
    permitId,
    manifestCid: oracle.manifestCid,
    signals: await snapshotFor(oracle, propertyId),
  };
}
