import { NextRequest, NextResponse } from "next/server";
import { searchSanJoseRoofingPermits } from "@/lib/sanJosePermits";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      apns?: unknown;
      permitStatus?: unknown;
    };

    if (
      !Array.isArray(body.apns) ||
      body.apns.length === 0 ||
      body.apns.length > 100 ||
      !body.apns.every((value) => typeof value === "string")
    ) {
      return NextResponse.json(
        { error: "apns must contain between 1 and 100 APN strings." },
        { status: 400 }
      );
    }

    if (body.permitStatus !== "open" && body.permitStatus !== "all") {
      return NextResponse.json(
        { error: 'permitStatus must be "open" or "all".' },
        { status: 400 }
      );
    }

    const permits = await searchSanJoseRoofingPermits({
      apns: body.apns,
      permitStatus: body.permitStatus,
    });

    return NextResponse.json({
      count: permits.length,
      permits,
      provenance: {
        source: "City of San Jose ArcGIS",
        system: "PLN_PermitsAndComplaints",
        roofingMatch:
          "Source WORKDESC/SUBDESC contains roofing terminology.",
        contractorIdentity:
          "Contractor names are source text only; corporate identity is not asserted.",
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "San Jose permit search is unavailable.",
      },
      { status: 502 }
    );
  }
}
