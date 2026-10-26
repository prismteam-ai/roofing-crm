// Dev-time: export the UI's two tables from the pipeline's DuckDB file to public/data/*.parquet.
// Usage: npm run export:parquet -- --db /path/to/nassau.duckdb [--out public/data]
// Opens the DB read-only (the harvester may still be writing; if the file is locked, retry or copy it).
import { DuckDBInstance } from "@duckdb/node-api";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Column names come from the pipeline's docs/schema.md (real schema, not assumed).
const TABLES = {
  // One row per mappable property. Roof age comes from property_roof_age (latest roofing permit, else the
  // NSI census-block estimate). Coordinates: state centroid point, else parcel-polygon centroid (labelled).
  properties: `
    SELECT p.property_key, p.print_key_code, p.sbl_key, p.situs_address, p.town_or_city,
           p.property_class, p.property_class_description,
           COALESCE(p.lat, p.polygon_lat) AS lat, COALESCE(p.lon, p.polygon_lon) AS lon,
           CASE WHEN p.lat IS NOT NULL THEN p.coord_method ELSE 'parcel_polygon_centroid' END AS coord_method,
           p.owner_name, p.owner_location_class, p.mailing_city, p.mailing_state,
           p.ownership_signal, p.last_deed_change_roll_year, p.full_market_value,
           r.roof_age_basis, r.roof_year, r.roof_age_years, r.confidence AS roof_age_confidence,
           r.caveat AS roof_age_caveat, r.evidence_permit_no, r.threshold_years AS pipeline_threshold_years,
           CAST(NULL AS DOUBLE) AS bbb_score  -- documented gap: no BBB data exists yet
    FROM properties p JOIN property_roof_age r USING (property_key)
    WHERE COALESCE(p.lat, p.polygon_lat) IS NOT NULL`,
  // One row per eTRAKiT permit linked to exactly one property (unlinked permits have no coordinates).
  permits: `
    SELECT f.permit_no, l.property_key, f.permit_type, f.permit_subtype, f.status, f.status_class, f.status_known,
           f.is_open, f.is_roofing, f.roofing_confidence, f.roofing_basis_summary,
           f.applied_date, f.issued_date, f.finaled_date, f.close_date, f.open_since, f.open_since_basis,
           f.years_open, f.expiration_date_valid, f.past_expiration,
           x.job_description, x.fees_charged,
           c.contractor_name, c.trade_contacts,
           CAST(NULL AS DOUBLE) AS bbb_score  -- documented gap: no BBB data exists yet
    FROM etrakit_permit_facts f
    JOIN etrakit_permit_property_link l ON l.permit_no = f.permit_no AND l.link_status = 'unique'
    LEFT JOIN etrakit_permits x ON x.permit_no = f.permit_no
    LEFT JOIN (
      SELECT permit_no,
             min(name) FILTER (WHERE upper(contact_type) = 'CONTRACTOR' AND coalesce(name,'') <> '') AS contractor_name,
             string_agg(contact_type || ': ' || name, '; ' ORDER BY seq) FILTER (WHERE upper(contact_type) <> 'OWNER' AND coalesce(name,'') <> '') AS trade_contacts
      FROM etrakit_contacts GROUP BY permit_no) c ON c.permit_no = f.permit_no`,
};

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const dbPath = arg("--db") ?? process.env.DUCKDB_PATH;
const outDir = resolve(arg("--out") ?? "public/data");
if (!dbPath) { console.error("Missing --db <file.duckdb> (or DUCKDB_PATH)"); process.exit(1); }

mkdirSync(outDir, { recursive: true });
const instance = await DuckDBInstance.create(resolve(dbPath), { access_mode: "READ_ONLY" });
const conn = await instance.connect();

for (const [t, sql] of Object.entries(TABLES)) {
  const file = `${outDir}/${t}.parquet`;
  await conn.run(`COPY (${sql}) TO '${file}' (FORMAT PARQUET, COMPRESSION ZSTD)`);
  const n = (await conn.runAndReadAll(`SELECT count(*) FROM read_parquet('${file}')`)).getRows()[0][0];
  console.log(`exported ${t}: ${n} rows -> ${file}`);
}
conn.closeSync();
