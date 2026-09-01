// Emits the SQL + bound params that the real builder produces, so the Python
// harness can execute exactly what the app would run against DuckDB.
import { buildRadiusQuery } from '../packages/shared/dist/query.js';

const [table, lat, lon, radius, minAge, bases] = process.argv.slice(2);
const q = buildRadiusQuery(table, {
  center: { lat: Number(lat), lon: Number(lon) },
  radiusMiles: Number(radius),
  minRoofAgeYears: minAge === 'null' ? null : Number(minAge),
  roofAgeBases: bases ? bases.split(',').filter(Boolean) : [],
  limit: 500,
});
process.stdout.write(JSON.stringify(q));
