import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getEnv, hasAnthropicKey } from "@/lib/config/env";
import { getDb, hasDatabase } from "@/lib/db/client";
import { mcp } from "@/lib/mcp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health - dependency status for the demo/ops banner. */
export async function GET() {
  const env = getEnv();
  const [mcpStatus, dbStatus] = await Promise.all([
    mcp
      .getPropertySchema()
      .then((s) => ({ ok: true as const, county: s.county, columns: s.columnCount }))
      .catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      })),
    hasDatabase()
      ? getDb()
          .execute(sql`select 1`)
          .then(() => ({ ok: true as const }))
          .catch((e: unknown) => ({
            ok: false as const,
            error: e instanceof Error ? e.message : String(e),
          }))
      : Promise.resolve({ ok: false as const, error: "DATABASE_URL not set" }),
  ]);
  return NextResponse.json({
    mcp: { url: env.ORACLE_MCP_URL, county: env.ORACLE_MCP_COUNTY, ...mcpStatus },
    database: dbStatus,
    assistant: { enabled: hasAnthropicKey(), model: env.AGENT_MODEL },
  });
}
