import { NextResponse, type NextRequest } from "next/server";
import { jsonError, searchParamsToObject } from "@/lib/http";
import { existingLeadParcelIds } from "@/lib/db/leads";
import { hasDatabase } from "@/lib/db/client";
import { searchCandidates } from "@/lib/services/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/search?lat&lng&radiusMiles&roofAgeMin&openPermitsOnly&longOpenYears&ownerOutOfState&noSaleYears&sort&limit */
export async function GET(req: NextRequest) {
  try {
    const result = await searchCandidates(searchParamsToObject(req.nextUrl.searchParams));
    let leadIds: Record<string, number> = {};
    if (hasDatabase()) {
      try {
        leadIds = Object.fromEntries(
          await existingLeadParcelIds(result.rows.map((r) => r.parcelId)),
        );
      } catch (err) {
        console.warn("lead lookup failed", err);
      }
    }
    return NextResponse.json({ ...result, leadIds });
  } catch (err) {
    return jsonError(err);
  }
}
