export const years = (days: number | null | undefined) =>
  days === null || days === undefined ? null : Math.floor(days / 365.25);

export function openFor(days: number | null | undefined): string {
  if (days === null || days === undefined) return "open duration unknown";
  const y = years(days)!;
  if (y >= 1) return `open ${y} year${y === 1 ? "" : "s"}`;
  const m = Math.floor(days / 30.4);
  return m >= 1 ? `open ${m} month${m === 1 ? "" : "s"}` : `open ${days} day${days === 1 ? "" : "s"}`;
}

export const LONG_OPEN_YEARS = 5;
export const isLongOpen = (days: number | null | undefined) => (years(days) ?? 0) >= LONG_OPEN_YEARS;

export const shortCid = (cid: string | null | undefined) =>
  cid ? `${cid.slice(0, 10)}…${cid.slice(-6)}` : "—";
export const gatewayUrl = (cid: string) => `https://ipfs.filebase.io/ipfs/${cid}`;

export const BASIS_LABEL: Record<string, string> = {
  roof_permit: "roofing permit",
  roof_date: "appraiser roof date",
  year_built: "year built",
  effective_year_built: "effective year built",
  unknown: "unknown",
};
export const basisLabel = (b: string | null | undefined) =>
  BASIS_LABEL[b ?? "unknown"] ?? (b ?? "unknown").replaceAll("_", " ");

export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
