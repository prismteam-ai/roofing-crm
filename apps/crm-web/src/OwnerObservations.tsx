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
      ["Owner", "Owner Name 1", "Owner Name 2"].includes(
        observation.sourceLabel,
      ) &&
      observation.roleVerification === "source_reported_unverified" &&
      observation.ownershipEffectiveDate === null &&
      observation.reportedName.trim().length > 0,
  );
  if (!owners.length) return null;
  return (
    <section aria-label="Source-reported owner observations">
      <h3 className="section-label">SOURCE-REPORTED OWNER · UNVERIFIED</h3>
      <p className="caveat">
        These names come from explicitly labeled owner fields in a source report
        or assessment record. They are unverified source observations. A related
        permit event date, if supplied, is not an ownership effective date. No
        current or legal ownership, ownership at the permit event, or
        uninterrupted tenure is established.
      </p>
      {owners.map((observation, index) => (
        <div
          key={index}
          className="permit-detail private-source-reported-owner private-protected-evidence"
          data-private-evidence="source-reported-owner"
          data-testid="source-reported-owner-observation"
        >
          <p>
            <b>Source-reported {observation.sourceLabel}:</b>{" "}
            {observation.reportedName}
          </p>
          <p>
            Related permit report event:{" "}
            {observation.relatedPermitEvent
              ? `${observation.relatedPermitEvent.kind} · ${observation.relatedPermitEvent.date}`
              : "not supplied by this source."}
          </p>
          {observation.mailingAddress && (
            <div>
              <p>
                <b>Source-reported mailing address · unverified</b>
              </p>
              <dl>
                <dt>Street</dt>
                <dd>{observation.mailingAddress.street ?? "Unavailable"}</dd>
                <dt>City</dt>
                <dd>{observation.mailingAddress.city ?? "Unavailable"}</dd>
                <dt>State</dt>
                <dd>{observation.mailingAddress.state ?? "Unavailable"}</dd>
                <dt>Postal code</dt>
                <dd>
                  {observation.mailingAddress.postalCode ?? "Unavailable"}
                </dd>
              </dl>
              <p className="caveat">
                Mailing details are reported source fields. They do not
                independently verify residency, current ownership, or an
                ownership-effective date.
              </p>
            </div>
          )}
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
