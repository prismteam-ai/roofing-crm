import "server-only";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import { getEnv } from "@/lib/config/env";
import * as schema from "./schema";

/**
 * Drizzle database handle. `DB_DRIVER=neon` uses the Neon HTTP driver (Vercel);
 * the default `pg` driver works against any Postgres, including the local Docker one.
 *
 * @module db/client
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: Db | null = null;
let transactional = true;

/** Error thrown when `DATABASE_URL` is not configured. */
export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

/** Lazily create the process-wide database handle. */
export function getDb(): Db {
  if (cached) return cached;
  const env = getEnv();
  if (!env.DATABASE_URL) throw new DatabaseNotConfiguredError();
  if (env.DB_DRIVER === "neon" || /neon\.tech/.test(env.DATABASE_URL)) {
    // neon-http: one HTTP request per statement, no interactive transactions.
    transactional = false;
    cached = drizzleNeon({ client: neon(env.DATABASE_URL), schema }) as unknown as Db;
  } else {
    transactional = true;
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
    cached = drizzlePg({ client: pool, schema }) as unknown as Db;
  }
  return cached;
}

/**
 * True when the active driver supports `db.transaction` (node-postgres). The Neon HTTP
 * driver does not; callers must use idempotent multi-step writes instead.
 */
export function supportsTransactions(): boolean {
  getDb();
  return transactional;
}

/** True when a database URL is configured (used for graceful UI notices). */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
