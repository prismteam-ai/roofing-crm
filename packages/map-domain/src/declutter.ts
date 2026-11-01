/** Deterministic screen-space grouping. A cluster retains every member identity; no position is fabricated for an individual. */
export function declutter<
  T extends { id: string; coordinates: { lat: number; lng: number } | null },
>(
  rows: T[],
  project: (p: { lat: number; lng: number }) => { x: number; y: number },
  cell = 34,
) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.coordinates) continue;
    const p = project(row.coordinates);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((members) => ({
    members,
    lat: members.reduce((n, p) => n + p.coordinates!.lat, 0) / members.length,
    lng: members.reduce((n, p) => n + p.coordinates!.lng, 0) / members.length,
  }));
}
