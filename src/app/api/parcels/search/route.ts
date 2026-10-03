import { NextRequest, NextResponse } from "next/server";
import { searchSantaClaraParcelsInRadius } from "@/lib/santaClaraParcels";

const ALLOWED_RADII = new Set([1, 3, 5, 10, 25]);
const PARCEL_PAGE_LIMIT = 500;

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lng"));
  const radiusMiles = Number(request.nextUrl.searchParams.get("radiusMiles"));

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json(
      { error: "A valid latitude and longitude are required." },
      { status: 400 }
    );
  }

  if (!ALLOWED_RADII.has(radiusMiles)) {
    return NextResponse.json(
      { error: "radiusMiles must be one of 1, 3, 5, 10, or 25." },
      { status: 400 }
    );
  }

  try {
    const { parcels, truncated } = await searchSantaClaraParcelsInRadius({
      latitude,
      longitude,
      radiusMeters: radiusMiles * 1609.344,
      limit: PARCEL_PAGE_LIMIT,
    });

    return NextResponse.json({
      search: {
        latitude,
        longitude,
        radiusMiles,
      },
      count: parcels.length,
      truncated,
      pageLimit: PARCEL_PAGE_LIMIT,
      truncatedAt: PARCEL_PAGE_LIMIT,
      parcels,
      provenance: {
        source: "County of Santa Clara open data",
        datasetId: "ubcd-cewv",
        geometryFilter: "within_circle",
        note:
          "Parcel geography is source-backed. Roofing age and permit enrichment are not inferred here.",
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Santa Clara parcel search is temporarily unavailable." },
      { status: 502 }
    );
  }
}
