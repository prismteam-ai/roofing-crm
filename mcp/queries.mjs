// Server-side port of src/lib/queries.ts (same SQL, same tool names/params as shared/tools.json).
// Keep the two in step: test/smoke.mjs checks this against the browser app's numbers.
import { DuckDBInstance } from "@duckdb/node-api";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const tools = JSON.parse(readFileSync(path.join(here, "../shared/tools.json"), "utf8"));
const published = JSON.parse(readFileSync(path.join(here, "../shared/data-cids.json"), "utf8"));

const EARTH_RADIUS_MILES = 3958.8;
export const MAX_ROWS = 1500;
const SHOWN_ROWS = 15;

const haversineSql = (pin, latCol = "lat", lonCol = "lon") =>
  `(2 * ${EARTH_RADIUS_MILES} * asin(sqrt(pow(sin(radians(${latCol} - (${pin.lat})) / 2), 2) + ` +
  `cos(radians(${pin.lat})) * cos(radians(${latCol})) * pow(sin(radians(${lonCol} - (${pin.lon})) / 2), 2))))`;

const bboxSql = (pin, miles, latCol = "lat", lonCol = "lon") => {
  const dLat = miles / 69;
  const dLon = miles / (69 * Math.max(0.01, Math.cos((pin.lat * Math.PI) / 180)));
  return `${latCol} BETWEEN ${pin.lat - dLat} AND ${pin.lat + dLat} AND ${lonCol} BETWEEN ${pin.lon - dLon} AND ${pin.lon + dLon}`;
};

const PROP_COLS = `property_key, print_key_code, sbl_key, situs_address, town_or_city, property_class, property_class_description,
  lat, lon, coord_method, owner_name, owner_location_class, mailing_city, mailing_state, ownership_signal,
  last_deed_change_roll_year, full_market_value, roof_age_basis, roof_year, roof_age_years, roof_age_confidence,
  roof_age_caveat, evidence_permit_no, bbb_score`;

/** Where the Parquet comes from: IPFS gateway + CIDs (default), or PARQUET_DIR for offline/local files. */
export function dataUrls(env = process.env) {
  if (env.PARQUET_DIR) return { properties: path.join(env.PARQUET_DIR, "properties.parquet"), permits: path.join(env.PARQUET_DIR, "permits.parquet") };
  const gw = (env.IPFS_GATEWAY ?? published.gateway).replace(/\/$/, "");
  const cids = { properties: env.PROPERTIES_CID ?? published.cids.properties, permits: env.PERMITS_CID ?? published.cids.permits };
  return { properties: `${gw}/ipfs/${cids.properties}`, permits: `${gw}/ipfs/${cids.permits}` };
}

export async function openDb(urls = dataUrls()) {
  const inst = await DuckDBInstance.create(":memory:");
  const conn = await inst.connect();
  if (/^https?:/.test(urls.properties)) await conn.run("INSTALL httpfs; LOAD httpfs;");
  for (const t of ["properties", "permits"]) {
    await conn.run(`CREATE VIEW ${t} AS SELECT * FROM read_parquet('${urls[t].replace(/'/g, "''")}')`);
  }
  return conn;
}

// DuckDB returns BIGINT as bigint and DATE/TIMESTAMP as wrapper objects; make rows plain JSON.
const plain = (v) => (typeof v === "bigint" ? Number(v) : v !== null && typeof v === "object" ? String(v) : v);
async function rows(conn, sql) {
  const r = await conn.runAndReadAll(sql);
  return r.getRowObjects().map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, plain(v)])));
}

function permitWhere(f) {
  if (f === "roofing") return "p.is_open AND p.is_roofing";
  if (f === "roofing_low") return "p.is_open AND p.roofing_confidence IN ('low','medium','high')";
  return "p.is_open";
}
const esc = (s) => String(s).replace(/'/g, "''");
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`${name} must be a number`); return n; };
const pinOf = (v) => {
  const lat = num(v?.lat, "pin.lat"), lon = num(v?.lon, "pin.lon");
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("pin out of range");
  return { lat, lon };
};
const radiusOf = (v) => { const n = num(v, "radiusMiles"); if (n <= 0) throw new Error("radiusMiles must be positive"); return Math.min(n, 25); };
const keyOf = (v) => { if (typeof v?.propertyKey !== "string" || !v.propertyKey) throw new Error("propertyKey must be a string"); return v.propertyKey; };
const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

export const handlers = {
  async agingRoofs(conn, a) {
    const pin = pinOf(a.pin), miles = radiusOf(a.radiusMiles), minAge = num(a.minAgeYears, "minAgeYears");
    const noPermit = a.withoutOpenPermit === true
      ? "AND NOT EXISTS (SELECT 1 FROM permits op WHERE op.property_key = properties.property_key AND op.is_open)" : "";
    const inner = `SELECT ${PROP_COLS}, ${haversineSql(pin)} AS miles FROM properties WHERE ${bboxSql(pin, miles)} AND roof_age_years >= ${minAge} ${noPermit}`;
    const [list, count] = await Promise.all([
      rows(conn, `SELECT * FROM (${inner}) WHERE miles <= ${miles} ORDER BY roof_age_years DESC, miles LIMIT ${SHOWN_ROWS}`),
      rows(conn, `SELECT count(*) AS n FROM (${inner}) WHERE miles <= ${miles}`),
    ]);
    const shown = list.map((p) => ({ property_key: p.property_key, address: p.situs_address, town: p.town_or_city, roof_age_years: p.roof_age_years,
      roof_age_confidence: p.roof_age_confidence, roof_age_basis: p.roof_age_basis, owner: p.owner_name, owner_location: p.owner_location_class, bbb_score: p.bbb_score, miles: r2(p.miles) }));
    return { total: count[0].n, shown: shown.length, rows: shown };
  },
  async openPermits(conn, a) {
    const pin = pinOf(a.pin), miles = radiusOf(a.radiusMiles);
    if (!["roofing", "roofing_low", "all_open"].includes(a.filter)) throw new Error("filter must be roofing, roofing_low or all_open");
    const inner = `SELECT p.*, pr.situs_address, pr.lat, pr.lon, pr.roof_age_years, ${haversineSql(pin, "pr.lat", "pr.lon")} AS miles
        FROM permits p JOIN properties pr USING (property_key)
        WHERE ${bboxSql(pin, miles, "pr.lat", "pr.lon")} AND ${permitWhere(a.filter)}`;
    // LIMIT above only bounds what we fetch for display; the real total needs its own count query
    // (all.length would silently cap at MAX_ROWS once an area has more open permits than that).
    const [all, count] = await Promise.all([
      rows(conn, `SELECT * FROM (${inner}) WHERE miles <= ${miles} ORDER BY years_open DESC NULLS LAST, miles LIMIT ${MAX_ROWS}`),
      rows(conn, `SELECT count(*) AS n FROM (${inner}) WHERE miles <= ${miles}`),
    ]);
    const shown = all.slice(0, SHOWN_ROWS).map((p) => ({ permit_no: p.permit_no, property_key: p.property_key, address: p.situs_address, status: p.status,
      years_open: r2(p.years_open), open_since: p.open_since, roofing_confidence: p.roofing_confidence, contractor: p.contractor_name, bbb_score: p.bbb_score,
      roof_age_years: p.roof_age_years, description: p.job_description?.slice(0, 100) ?? null, miles: r2(p.miles) }));
    return { total: count[0].n, shown: shown.length, rows: shown };
  },
  async permitCounts(conn, a) {
    const pin = pinOf(a.pin), miles = radiusOf(a.radiusMiles);
    const r = await rows(conn, `SELECT roofing_confidence AS k, count(*) AS n FROM (
        SELECT p.roofing_confidence, ${haversineSql(pin, "pr.lat", "pr.lon")} AS miles
        FROM permits p JOIN properties pr USING (property_key)
        WHERE ${bboxSql(pin, miles, "pr.lat", "pr.lon")} AND p.is_open) WHERE miles <= ${miles} GROUP BY 1`);
    return Object.fromEntries(r.map((x) => [x.k, x.n]));
  },
  async permitsForProperty(conn, a) {
    const all = await rows(conn, `SELECT * FROM permits WHERE property_key = '${esc(keyOf(a))}' ORDER BY coalesce(issued_date, applied_date) DESC NULLS LAST`);
    const shown = all.slice(0, SHOWN_ROWS).map(({ trade_contacts, ...p }) => ({ ...p, job_description: p.job_description?.slice(0, 160) ?? null }));
    return { total: all.length, rows: shown };
  },
  async propertyByKey(conn, a) {
    const r = await rows(conn, `SELECT ${PROP_COLS} FROM properties WHERE property_key = '${esc(keyOf(a))}'`);
    return r[0] ?? null;
  },
};
