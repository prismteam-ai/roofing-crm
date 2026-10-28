import type { Property } from "../../contracts/src/index";
export function isExplicitOpenRoofPermit(permit: Property["permits"][number]) {
  return (
    permit.status === "open" &&
    permit.closedAt === null &&
    permit.kind !== "other" &&
    (permit.statusBasis === undefined || permit.statusBasis === "explicit_open")
  );
}
export function permitOpenDays(
  permit: Property["permits"][number],
  asOf: string,
): number | null {
  if (!isExplicitOpenRoofPermit(permit) || !permit.openedAt) return null;
  // Explicit status is an observation, never an assumption that a permit is still open today.
  const observedAsOf =
    permit.statusBasis === "explicit_open"
      ? permit.statusObservedAt?.slice(0, 10)
      : asOf;
  if (!observedAsOf) return null;
  const start = Date.parse(permit.openedAt),
    end = Date.parse(observedAsOf);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end)
    return null;
  return Math.floor((end - start) / 86400000);
}
export function oldestOpenRoofDays(
  p: Pick<Property, "permits"> & { roof: Pick<Property["roof"], "asOf"> },
): number | null {
  const days = p.permits
    .map((permit) => permitOpenDays(permit, p.roof.asOf))
    .filter((d): d is number => d !== null);
  return days.length ? Math.max(...days) : null;
}
/** Evidence stays attached to its specific observation, including partial reported-sale history. */
export function propertyEvidence(property: Property) {
  const sources = [
    ...property.provenance,
    ...(property.roof.provenance ?? []),
    ...property.permits.flatMap((permit) => permit.provenance),
    ...property.permits.flatMap((permit) =>
      (permit.sourceObservations ?? []).map((row) => ({
        sourceId: row.provenance.sourceId,
        recordId: row.providerRecordId,
        observedAt: row.sourceObservedAt,
        digest: row.provenance.recordDigest,
        kind: "real-minimized" as const,
      })),
    ),
    ...(property.ownership.recordedTransferIndexObservations ?? []).map(
      (row) => ({
        sourceId: row.reference.sourceId,
        recordId: row.reference.recordSha256,
        observedAt: row.reference.observedAt,
        digest: row.reference.recordSha256,
        kind: "real-minimized" as const,
      }),
    ),
    ...(property.ownership.events ?? []).flatMap((event) => event.provenance),
  ];
  return [
    ...new Map(
      sources.map((source) => [
        `${source.sourceId}:${source.recordId}:${source.digest}`,
        source,
      ]),
    ).values(),
  ];
}
