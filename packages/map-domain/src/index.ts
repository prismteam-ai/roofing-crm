import { QuerySchema, type QueryInput } from "../../contracts/src/index";
export const OAKLAND_CENTER = { lat: 42.66, lng: -83.29 };
export const METERS_PER_MILE = 1609.344;
export function milesToMeters(miles: number): number {
  if (!Number.isFinite(miles) || miles <= 0 || miles > 20)
    throw new Error("Radius must be greater than zero and at most 20 miles");
  return miles * METERS_PER_MILE;
}
export function queryFromUrl(
  search: string,
  defaultSnapshot = "demo-oakland-v1",
): QueryInput {
  const p = new URLSearchParams(search);
  const base: QueryInput = {
    snapshotId: p.get("snapshot") ?? defaultSnapshot,
    lat: Number(p.get("lat") ?? 42.66),
    lng: Number(p.get("lng") ?? -83.29),
    radiusMeters: Number(p.get("radius") ?? 8046.72),
    permitStatus: (p.get("permit") ?? "any") as "any",
    minOpenDays: Number(p.get("days") ?? 0),
    minConfidence: (p.get("confidence") ?? "any") as "any",
    limit: Number(p.get("limit") ?? 50),
    includeUnknown: p.get("unknownRoof") === "1",
  };
  if (p.has("age")) base.roofMinAgeYears = Number(p.get("age"));
  if (p.has("owner"))
    base.ownerRegion = p.get("owner") as QueryInput["ownerRegion"];
  if (p.has("tenure")) base.minOwnershipYears = Number(p.get("tenure"));
  if (p.has("reportedSaleYears"))
    base.minReportedSaleAgeYears = Number(p.get("reportedSaleYears"));
  if (p.has("place")) base.placeId = p.get("place")!;
  if (p.has("placeDigest")) base.placeIndexDigest = p.get("placeDigest")!;
  if (p.has("sort")) base.sort = p.get("sort") as QueryInput["sort"];
  for (const field of [
    "requiresContractor",
    "requiresVerifiedLicense",
    "requiresBbbRating",
  ] as const)
    if (p.has(field)) base[field] = p.get(field) === "1";
  const parsed = QuerySchema.safeParse(base);
  return parsed.success
    ? parsed.data
    : QuerySchema.parse({
        snapshotId: defaultSnapshot,
        ...OAKLAND_CENTER,
        radiusMeters: 8046.72,
      });
}
export function queryToUrl(query: QueryInput): string {
  const p = new URLSearchParams({
    snapshot: query.snapshotId,
    lat: query.placeId ? String(query.lat) : query.lat.toFixed(6),
    lng: query.placeId ? String(query.lng) : query.lng.toFixed(6),
    radius: String(query.radiusMeters),
    permit: query.permitStatus ?? "any",
    days: String(query.minOpenDays ?? 0),
    confidence: query.minConfidence ?? "any",
    limit: String(query.limit ?? 50),
    unknownRoof: query.includeUnknown ? "1" : "0",
  });
  if (query.roofMinAgeYears !== undefined)
    p.set("age", String(query.roofMinAgeYears));
  if (query.ownerRegion && query.ownerRegion !== "any")
    p.set("owner", query.ownerRegion);
  if (query.minOwnershipYears !== undefined)
    p.set("tenure", String(query.minOwnershipYears));
  if (query.minReportedSaleAgeYears !== undefined)
    p.set("reportedSaleYears", String(query.minReportedSaleAgeYears));
  if (query.placeId) p.set("place", query.placeId);
  if (query.placeIndexDigest) p.set("placeDigest", query.placeIndexDigest);
  if (query.sort) p.set("sort", query.sort);
  for (const field of [
    "requiresContractor",
    "requiresVerifiedLicense",
    "requiresBbbRating",
  ] as const)
    if (query[field] !== undefined) p.set(field, query[field] ? "1" : "0");
  return `?${p}`;
}

/** Manual pin/GPS movement invalidates an earlier official-place binding. */
export function updateQueryContext(
  query: QueryInput,
  fields: Partial<QueryInput>,
): QueryInput {
  const moved = Object.hasOwn(fields, "lat") || Object.hasOwn(fields, "lng");
  return {
    ...query,
    ...fields,
    ...(moved ? { placeId: undefined, placeIndexDigest: undefined } : {}),
    cursor: undefined,
  };
}
