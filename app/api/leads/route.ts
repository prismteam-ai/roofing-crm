import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, searchParamsToObject } from "@/lib/http";
import { leadFilterSchema, listLeads } from "@/lib/db/leads";
import { createLeadsFromParcels } from "@/lib/services/leads";
import { DEFAULT_THRESHOLDS } from "@/lib/services/search";
import { mcp } from "@/lib/mcp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/leads?status&roofAgeMin&permitStatus&openDaysMin&lat&lng&radiusMiles */
export async function GET(req: NextRequest) {
  try {
    const filters = leadFilterSchema.parse(searchParamsToObject(req.nextUrl.searchParams));
    return NextResponse.json({ leads: await listLeads(filters) });
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  parcelIds: z.array(z.string().min(1).max(64)).min(1).max(100),
  /** Thresholds the user searched with, so the lead's signal matches the list. */
  roofAgeMin: z.number().int().min(0).max(150).optional(),
  longOpenYears: z.number().min(0).max(50).optional(),
});

/** POST /api/leads { parcelIds: string[], roofAgeMin?, longOpenYears? } - create leads from selected properties. */
export async function POST(req: NextRequest) {
  try {
    const { parcelIds, roofAgeMin, longOpenYears } = createSchema.parse(await req.json());
    const thresholds = {
      roofAgeYears: roofAgeMin ?? DEFAULT_THRESHOLDS.roofAgeYears,
      longOpenDays:
        longOpenYears !== undefined
          ? Math.round(longOpenYears * 365)
          : DEFAULT_THRESHOLDS.longOpenDays,
    };
    const result = await createLeadsFromParcels(parcelIds, mcp, thresholds);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
