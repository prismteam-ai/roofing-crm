/**
 * Seed / refresh the assistant's knowledge index from `lib/agent/knowledge-docs.ts`.
 *
 * Usage: `npm run db:seed`
 */
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { KNOWLEDGE_DOCS } from "../lib/agent/knowledge-docs";
import { knowledgeChunks } from "../lib/db/schema";

async function main(): Promise<void> {
  // Same driver selection as lib/db/client.ts (which is server-only and cannot be
  // imported from a script): Neon HTTP for Neon URLs, `pg` for local Postgres.
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const useNeon = process.env.DB_DRIVER === "neon" || /neon\.tech/.test(url);
  const pool = useNeon ? null : new Pool({ connectionString: url, max: 1 });
  const db = useNeon ? drizzleNeon({ client: neon(url) }) : drizzlePg({ client: pool! });
  for (const doc of KNOWLEDGE_DOCS) {
    await db
      .insert(knowledgeChunks)
      .values({
        id: doc.id,
        source: doc.source,
        title: doc.title,
        section: doc.section,
        body: doc.body,
      })
      .onConflictDoUpdate({
        target: knowledgeChunks.id,
        set: {
          source: doc.source,
          title: doc.title,
          section: doc.section,
          body: doc.body,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`seeded ${KNOWLEDGE_DOCS.length} knowledge chunks`);
  await pool?.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
