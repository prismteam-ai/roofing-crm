import type { ProviderPermitObservation } from "../../../packages/contracts/src/index";
/** Provider-restricted rows have a separate capture boundary from official public facts. */
export function ProviderObservations({
  observations,
  municipalKind,
}: {
  observations?: ProviderPermitObservation[];
  municipalKind?: string;
}) {
  if (!observations?.length) return null;
  return (
    <section
      aria-label="Provider permit observations"
      className="private-protected-evidence"
      data-private-evidence="provider-permit-observations"
    >
      <h4>PROVIDER PERMIT OBSERVATIONS · RESTRICTED SOURCE</h4>
      {municipalKind === "other" && (
        <p className="caveat">
          Classification disagreement: the municipal record remains other; this
          observation is a provider-classified ROOFING candidate. It does not
          independently verify roofing work or change the retained municipal
          classification.
        </p>
      )}
      {observations.map((row, index) => (
        <div
          className="permit-detail"
          key={`${row.providerRecordId}:${index}`}
          data-testid="provider-permit-observation"
        >
          <p>
            <b>
              {row.provider} · {row.providerStatus.replaceAll("_", " ")}
            </b>{" "}
            · {row.permitNumber}
          </p>
          <p>
            Provider-normalized status; native status{" "}
            {row.nativeStatus ?? "not independently established"}. Supported
            lifecycle: {row.supportedLifecycle}. Status basis:{" "}
            {row.statusBasis.replaceAll("_", " ")}.
          </p>
          <p>
            Activity claim: {row.activityClaim.replaceAll("_", " ")}.{" "}
            {row.providerStatus === "ISSUED" &&
            row.activityClaim === "not_established"
              ? "Issued-only observation: current active/open work is not established."
              : "This claim is limited to its stated source and observation date."}
          </p>
          <p>
            Filed {row.dateFiled ?? "unavailable"} · issued{" "}
            {row.dateIssued ?? "unavailable"} · completed{" "}
            {row.dateCompleted ?? "unavailable"} · expires{" "}
            {row.dateExpired ?? "unavailable"}.
          </p>
          <p>
            Age since issue:{" "}
            {row.ageSinceIssueDays === null
              ? "unavailable"
              : `${row.ageSinceIssueDays} days`}{" "}
            at {row.assessmentAt.slice(0, 10)}. Basis:{" "}
            {row.ageBasis.replaceAll("_", " ")}. This is not continuous open
            duration or roof age.
          </p>
          <p>
            Documented continuous open duration:{" "}
            {row.continuousOpenDays === null
              ? "not established"
              : `${row.continuousOpenDays} days`}
            . Interval basis:{" "}
            {row.continuousOpenIntervalBasis.replaceAll("_", " ")}.
          </p>
          <p>
            Reported business/party: {row.reportedBusinessName ?? "unavailable"}{" "}
            · provider-reported party, contractor role unverified. License
            identifier: {row.contractorLicenseIdentifier ?? "unavailable"}{" "}
            (source reported; active eligibility not verified). BBB rating:
            unavailable / not verified by this observation.
          </p>
          <small>
            Source observed {row.sourceObservedAt} · source data through{" "}
            {row.sourceDataThrough ?? "not supplied"} · last refreshed{" "}
            {row.sourceLastRefreshed ?? "not supplied"}. Provider category{" "}
            {row.category} is a classification, not an independent roof
            inspection.
          </small>
          <small>
            Source {row.provenance.sourceId} · record {row.providerRecordId} ·
            digest {row.provenance.recordDigest.slice(0, 12)}…
          </small>
          <p className="caveat">{row.limitations.join(" ")}</p>
        </div>
      ))}
    </section>
  );
}
