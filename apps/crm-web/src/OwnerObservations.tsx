import type { Property } from "../../../packages/contracts/src/index";
type ReportedOwnerObservation = NonNullable<
  Property["ownership"]["reportedOwnerObservations"]
>[number];

/** Private detail evidence only. The surrounding class is the review capture mask. */
export function OwnerObservations({
  observations,
}: {
  observations?: ReportedOwnerObservation[];
}) {
  const owners = (observations ?? []).filter(
    (observation) =>
      observation.sourceLabel === "Owner" &&
      observation.roleVerification === "source_reported_unverified" &&
      observation.ownershipEffectiveDate === null &&
      observation.reportedName.trim().length > 0,
  );
  if (!owners.length) return null;
  return (
    <section aria-label="Source-reported owner observations">
      <h3 className="section-label">SOURCE-REPORTED OWNER · UNVERIFIED</h3>
      <p className="caveat">
        These names appear in a permit report field labeled Owner. They are
        unverified source observations. The related permit event date is not an
        ownership effective date. No current or legal ownership, ownership at
        the permit event, or uninterrupted tenure is established.
      </p>
      {owners.map((observation, index) => (
        <div
          key={index}
          className="permit-detail private-source-reported-owner"
          data-testid="source-reported-owner-observation"
        >
          <p>
            <b>Source-reported Owner:</b> {observation.reportedName}
          </p>
          <p>
            Related permit report event: {observation.relatedPermitEvent.kind}
            {" · "}
            {observation.relatedPermitEvent.date}
          </p>
          <p className="caveat">
            Role verification: source reported, unverified. Ownership effective
            date: unknown. No contacts are inferred from this observation.
          </p>
          {observation.limitations.length > 0 && (
            <p className="caveat">{observation.limitations.join(" ")}</p>
          )}
          {observation.provenance.map((source) => (
            <div
              className="citation"
              key={`${source.sourceId}:${source.recordId}:${source.digest}`}
            >
              <b>{source.sourceId}</b>
              <span>
                {source.recordId} · {source.kind}
              </span>
              <small>
                Observed {source.observedAt.slice(0, 10)} · digest{" "}
                {source.digest.slice(0, 12)}…
              </small>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
