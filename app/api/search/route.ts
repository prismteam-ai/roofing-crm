import { z } from "zod";
import { numbers, respond } from "@/lib/http";
import { callOracle, type PermitSearch, type PropertySearch } from "@/lib/oracle";

export const maxDuration = 60;

/**
 * Lead candidates around a point: older roofs and open roofing permits.
 * Both lists come from the Oracle pipeline's MCP tools, called in parallel.
 */
export async function GET(request: Request) {
  return respond(async () => {
    const q = numbers(request, ["lat", "lon", "miles", "minRoofAge", "minYearsOpen", "minYearsSinceSale"]);
    // A point outside the county or a missing coordinate is the caller's mistake: answer 400, not 500.
    const area = z
      .object({
        lat: z.number({ error: "lat is required" }).min(25.0, "The point is outside Miami-Dade County").max(26.1, "The point is outside Miami-Dade County"),
        lon: z.number({ error: "lon is required" }).min(-81.0, "The point is outside Miami-Dade County").max(-80.0, "The point is outside Miami-Dade County"),
        miles: z.number().default(1).transform((m) => Math.min(25, Math.max(0.1, m))),
      })
      .parse({ lat: q.lat, lon: q.lon, miles: q.miles });
    const params = new URL(request.url).searchParams;
    const ownerLocation = params.get("ownerLocation");
    const contractorLicence = params.get("contractorLicence");
    const [roofs, permits] = await Promise.all([
      callOracle<PropertySearch>("search_properties", {
        ...area,
        minRoofAge: q.minRoofAge ?? 15,
        ...(q.minYearsSinceSale ? { minYearsSinceSale: q.minYearsSinceSale } : {}),
        ...(ownerLocation ? { ownerLocation: ownerLocation.split(",") } : {}),
        limit: 50,
      }),
      callOracle<PermitSearch>("search_permits", {
        ...area,
        roofingOnly: true,
        openOnly: true,
        ...(q.minYearsOpen ? { minDaysOpen: Math.round(q.minYearsOpen * 365.25) } : {}),
        ...(contractorLicence ? { contractorLicence } : {}),
        limit: 50,
      }),
    ]);
    return { roofs, permits };
  });
}
