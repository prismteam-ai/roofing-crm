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
    limit: 50,
  };
  if (p.has("age")) base.roofMinAgeYears = Number(p.get("age"));
  if (p.has("owner"))
    base.ownerRegion = p.get("owner") as QueryInput["ownerRegion"];
  if (p.has("tenure")) base.minOwnershipYears = Number(p.get("tenure"));
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
    lat: query.lat.toFixed(6),
    lng: query.lng.toFixed(6),
    radius: String(query.radiusMeters),
    permit: query.permitStatus ?? "any",
    days: String(query.minOpenDays ?? 0),
    confidence: query.minConfidence ?? "any",
  });
  if (query.roofMinAgeYears !== undefined)
    p.set("age", String(query.roofMinAgeYears));
  if (query.ownerRegion && query.ownerRegion !== "any")
    p.set("owner", query.ownerRegion);
  if (query.minOwnershipYears !== undefined)
    p.set("tenure", String(query.minOwnershipYears));
  return `?${p}`;
}
