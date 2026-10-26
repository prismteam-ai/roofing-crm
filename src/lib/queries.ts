import { bboxSql, haversineSql } from "./geo";
import { query } from "./db";
import type { Permit, PermitFilter, PermitLead, Pin, Property } from "./types";

export const MAX_ROWS = 1500;

const PROP_COLS = `property_key, print_key_code, sbl_key, situs_address, town_or_city, property_class, property_class_description,
  lat, lon, coord_method, owner_name, owner_location_class, mailing_city, mailing_state, ownership_signal,
  last_deed_change_roll_year, full_market_value, roof_age_basis, roof_year, roof_age_years, roof_age_confidence,
  roof_age_caveat, evidence_permit_no, bbb_score`;

/**
 * Properties inside the radius whose roof age is at least `minAge` years (oldest first).
 * `withoutOpenPermit` drops properties that have any open permit (used by the agent's "aged roof, no open permit" questions).
 */
export async function agingRoofs(pin: Pin, miles: number, minAge: number, withoutOpenPermit = false): Promise<{ rows: Property[]; total: number }> {
  const noPermit = withoutOpenPermit
    ? "AND NOT EXISTS (SELECT 1 FROM permits op WHERE op.property_key = properties.property_key AND op.is_open)"
    : "";
  const inner = `SELECT ${PROP_COLS}, ${haversineSql(pin)} AS miles FROM properties
                 WHERE ${bboxSql(pin, miles)} AND roof_age_years >= ${Number(minAge)} ${noPermit}`;
  const [rows, count] = await Promise.all([
    query<Property>(`SELECT * FROM (${inner}) WHERE miles <= ${Number(miles)} ORDER BY roof_age_years DESC, miles LIMIT ${MAX_ROWS}`),
    query<{ n: number }>(`SELECT count(*) AS n FROM (${inner}) WHERE miles <= ${Number(miles)}`),
  ]);
  return { rows, total: count[0]?.n ?? 0 };
}

function permitWhere(f: PermitFilter): string {
  if (f === "roofing") return "p.is_open AND p.is_roofing";
  if (f === "roofing_low") return "p.is_open AND p.roofing_confidence IN ('low','medium','high')";
  return "p.is_open";
}

/** Open permits inside the radius, longest-open first (null years_open last). */
export async function openPermits(pin: Pin, miles: number, filter: PermitFilter): Promise<{ rows: PermitLead[]; total: number }> {
  const inner = `SELECT p.*, pr.situs_address, pr.lat, pr.lon, pr.roof_age_years, pr.roof_age_confidence, pr.roof_age_basis,
             ${haversineSql(pin, "pr.lat", "pr.lon")} AS miles
      FROM permits p JOIN properties pr USING (property_key)
      WHERE ${bboxSql(pin, miles, "pr.lat", "pr.lon")} AND ${permitWhere(filter)}`;
  // The LIMIT below only bounds how many rows we fetch for display; the real total needs its own count
  // query -- rows.length would silently cap at MAX_ROWS once an area has more open permits than that.
  const [rows, count] = await Promise.all([
    query<PermitLead>(`SELECT * FROM (${inner}) WHERE miles <= ${Number(miles)} ORDER BY years_open DESC NULLS LAST, miles LIMIT ${MAX_ROWS}`),
    query<{ n: number }>(`SELECT count(*) AS n FROM (${inner}) WHERE miles <= ${Number(miles)}`),
  ]);
  return { rows, total: count[0]?.n ?? 0 };
}

/** How many open permits in the radius sit at each roofing-confidence level (for the empty-state hint). */
export async function permitCounts(pin: Pin, miles: number): Promise<Record<string, number>> {
  const rows = await query<{ k: string; n: number }>(`SELECT roofing_confidence AS k, count(*) AS n FROM (
      SELECT p.roofing_confidence, ${haversineSql(pin, "pr.lat", "pr.lon")} AS miles
      FROM permits p JOIN properties pr USING (property_key)
      WHERE ${bboxSql(pin, miles, "pr.lat", "pr.lon")} AND p.is_open) WHERE miles <= ${Number(miles)} GROUP BY 1`);
  return Object.fromEntries(rows.map((r) => [r.k, r.n]));
}

/** All permits (any status) on one property, for the detail panel. */
export async function permitsForProperty(propertyKey: string): Promise<Permit[]> {
  const key = propertyKey.replace(/'/g, "''");
  return query<Permit>(`SELECT * FROM permits WHERE property_key = '${key}' ORDER BY coalesce(issued_date, applied_date) DESC NULLS LAST`);
}

/** One property by key, with miles = 0 (used by the detail panel when the selection came from a permit). */
export async function propertyByKey(propertyKey: string): Promise<Property | null> {
  const key = propertyKey.replace(/'/g, "''");
  const rows = await query<Property>(`SELECT ${PROP_COLS}, 0.0 AS miles FROM properties WHERE property_key = '${key}'`);
  return rows[0] ?? null;
}
