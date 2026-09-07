/**
 * Apply the checked-in Drizzle migrations to `DATABASE_URL`.
 *
 * - Neon (`DB_DRIVER=neon` or a `*.neon.tech` URL): uses the Neon HTTP driver, so
 *   it works from networks that block the Postgres port (VPNs, CI egress).
 * - Anything else (local Docker Postgres): standard `pg` pool.
 *
 * Usage: `npm run db:migrate`
 */
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const useNeon = process.env.DB_DRIVER === "neon" || /neon\.tech/.test(url);
  if (useNeon) {
    const db = drizzleNeon({ client: neon(url) });
    await migrateNeon(db, { migrationsFolder: "./drizzle" });
    console.log("migrations applied (neon-http)");
    return;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzlePg({ client: pool });
  await migratePg(db, { migrationsFolder: "./drizzle" });
  console.log("migrations applied (pg)");
  await pool.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
