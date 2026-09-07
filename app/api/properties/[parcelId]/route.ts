import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/http";
import { mcp } from "@/lib/mcp/client";
import { DEFAULT_THRESHOLDS, getPropertyDetail } from "@/lib/services/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Optional thresholds so the drawer classifies the property like the current search. */
const thresholdQuery = z.object({
  roofAgeMin: z.coerce.number().int().min(0).max(150).optional(),
  longOpenYears: z.coerce.number().min(0).max(50).optional(),
});

/** GET /api/properties/:parcelId?roofAgeMin&longOpenYears - property detail with permits (from MCP). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ parcelId: string }> }) {
  try {
    const { parcelId } = await ctx.params;
    const q = thresholdQuery.parse({
      roofAgeMin: req.nextUrl.searchParams.get("roofAgeMin") ?? undefined,
      longOpenYears: req.nextUrl.searchParams.get("longOpenYears") ?? undefined,
    });
    const thresholds = {
      roofAgeYears: q.roofAgeMin ?? DEFAULT_THRESHOLDS.roofAgeYears,
      longOpenDays:
        q.longOpenYears !== undefined
          ? Math.round(q.longOpenYears * 365)
          : DEFAULT_THRESHOLDS.longOpenDays,
    };
    const detail = await getPropertyDetail(decodeURIComponent(parcelId), mcp, thresholds);
    if (!detail) return NextResponse.json({ error: "Property not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    return jsonError(err);
  }
}
