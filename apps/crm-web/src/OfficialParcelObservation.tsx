import type { Property } from "../../../packages/contracts/src/index";

type Observation = NonNullable<
  Property["ownership"]["officialParcelObservation"]
>;

/** Raw county observations stay distinct from a verified ownership or contact claim. */
export function OfficialParcelObservation({
  observation,
}: {
  observation?: Observation;
}) {
  if (!observation) return null;
  const value = (
    field: "NAME1" | "NAME2" | "POSTALADDRESS",
    raw: string | null,
  ) =>
    observation.fieldAvailability[field] === "not_observed_in_retained_record"
      ? "Not observed in the retained record"
      : raw?.trim()
        ? raw
        : "Null or empty in the source observation";
  return (
    <section
      className="permit-detail official-parcel-observation"
      aria-label="Official county parcel observation"
      data-source-evidence="official-parcel-observation"
    >
      <h3 className="section-label">OFFICIAL COUNTY PARCEL OBSERVATION</h3>
      <dl>
        <dt>Owner name field NAME1</dt>
        <dd>{value("NAME1", observation.name1)}</dd>
        <dt>Owner name field NAME2</dt>
        <dd>{value("NAME2", observation.name2)}</dd>
        <dt>Mailing address as reported</dt>
        <dd>{value("POSTALADDRESS", observation.postalAddressAsObserved)}</dd>
        <dt>County native record / PIN</dt>
        <dd>
          {observation.nativeId} / {observation.pin ?? "Not reported"}
        </dd>
        <dt>Observed</dt>
        <dd>{observation.observedAt}</dd>
        <dt>County mailing-location derivation</dt>
        <dd>
          {observation.ownerLocation.ownerRegion.replaceAll("_", " ")} ·{" "}
          {observation.ownerLocation.locationClass.replaceAll("_", " ")}
        </dd>
      </dl>
      <p className="caveat">
        These are source observations, not verified legal ownership, residence,
        or transfer history. The mailing string is preserved as reported. Phone
        and email are not supplied by this county layer.
      </p>
      <p className="caveat">
        This county observation is separate from the selected location evidence
        used by filters. Another source observation may take precedence.
      </p>
      <a href={observation.sourceUrl} target="_blank" rel="noopener noreferrer">
        Official county parcel source ↗
      </a>
      <p className="citation">
        {observation.sourceId} · record {observation.recordSha256.slice(0, 12)}…
        · terms {observation.termsSha256.slice(0, 12)}… · profile{" "}
        {observation.sourceProfileSha256.slice(0, 12)}…
      </p>
      <p className="caveat">{observation.limitations.join(" ")}</p>
    </section>
  );
}
