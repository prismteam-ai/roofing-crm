import type { Permit } from "../../../packages/contracts/src/index";
import { permitOpenDays } from "../../../packages/map-domain/src/signals";
function SourceLink({ url, label }: { url: string; label: string }) {
  try {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.username || target.password)
      return <span>Source link unavailable</span>;
    return (
      <a href={target.href} target="_blank" rel="noopener noreferrer">
        {label} ↗
      </a>
    );
  } catch {
    return <span>Source link unavailable</span>;
  }
}
/** Every value comes from its specific observation. Issuance alone establishes neither open status nor roof age. */
export function PermitEvidence({
  permit: p,
  asOf,
  synthetic = false,
}: {
  permit: Permit;
  asOf: string;
  synthetic?: boolean;
}) {
  const days = permitOpenDays(p, asOf),
    issuedOnly = p.statusBasis === "issued_only",
    status =
      issuedOnly || p.statusBasis === "unknown"
        ? "unknown"
        : p.statusBasis === "explicit_closed"
          ? "closed"
          : p.status,
    license = p.contractor.licenseEvidence,
    rating = p.contractor.ratingEvidence;
  return (
    <div
      className="permit-detail private-protected-evidence"
      data-private-evidence="permit-observation"
      data-testid="permit-observation"
    >
      <div className="permit-line">
        <b>{p.permitNumber ?? p.id}</b>
        <span className={`permit-state ${status}`}>
          {issuedOnly ? "issued · open status unknown" : status}
        </span>
      </div>
      {p.permitNumber && <small>Record {p.id}</small>}
      <p>
        {p.kind.replaceAll("_", " ")}
        {p.jurisdiction ? ` · ${p.jurisdiction}` : ""}
      </p>
      {p.proposedWorkScope && <p>Reported work: {p.proposedWorkScope}</p>}
      {p.reportedPermitType && (
        <p>Source permit type: {p.reportedPermitType}</p>
      )}
      <p>
        Issued {p.issuedAt ?? "date unavailable"} · opening{" "}
        {issuedOnly
          ? "not established from issuance"
          : (p.openedAt ?? "date unavailable")}{" "}
        · closed {p.closedAt ?? "not recorded"}
      </p>
      <p>
        Status basis:{" "}
        {p.statusBasis?.replaceAll("_", " ") ?? "source-reported status"}
        {p.reportedStatus ? ` · source status ${p.reportedStatus}` : ""}
        {p.statusObservedAt ? ` · observed ${p.statusObservedAt}` : ""}
      </p>
      <p>
        Open duration:{" "}
        {days === null
          ? "unknown / not explicitly open roofing work"
          : `${days} days as of ${p.statusBasis === "explicit_open" ? p.statusObservedAt?.slice(0, 10) : asOf}`}
        . Issuance alone is not open status and does not establish roof
        installation or replacement.
      </p>
      {p.matchEvidence && (
        <p className="caveat">
          Permit/property match: {p.matchEvidence.basis.replaceAll("_", " ")} ·{" "}
          {p.matchEvidence.confidence} confidence ·{" "}
          {p.matchEvidence.candidateCount} candidate(s) · address{" "}
          {p.matchEvidence.addressAgreement}.{" "}
          {p.matchEvidence.caveats.join(" ")}
        </p>
      )}
      {p.provenance.some(
        (x) => x.sourceId === "official-troy-issued-permits",
      ) && <small>Business applicant · contractor role unverified</small>}
      <b>
        {p.contractor.reportedName ??
          "Reported business/contractor name unavailable"}
      </b>
      <small>
        {p.contractor.verifiedCompanyId
          ? `Official company edge: ${p.contractor.verifiedCompanyId}`
          : "Source-reported name · official identity unresolved"}
      </small>
      {license ? (
        <>
          <p>
            License observation: {license.identifier} · {license.type} · status{" "}
            {license.status}
          </p>
          <small>
            Observed {license.observedAt} · match {license.confidence}{" "}
            confidence · {license.matchBasis}.{" "}
            <SourceLink url={license.sourceUrl} label="License source" />
          </small>
        </>
      ) : (
        <small>
          License:{" "}
          {p.contractor.license
            ? `${p.contractor.license} (source reported; not independently verified)`
            : "unavailable / not verified"}
        </small>
      )}
      {rating ? (
        <>
          <p>
            BBB observed rating: {rating.value} · match {rating.matchConfidence}{" "}
            confidence
          </p>
          <small>
            Observed {rating.observedAt}.{" "}
            <SourceLink url={rating.sourceUrl} label="BBB source" />
          </small>
        </>
      ) : (
        <small>
          {p.contractor.rating === null
            ? "BBB rating: unavailable / not verified"
            : synthetic
              ? `Synthetic score: ${p.contractor.rating}/100; not a real BBB rating`
              : `Reported numeric score: ${p.contractor.rating}/100; source/scale unverified, not a verified BBB rating`}
        </small>
      )}
    </div>
  );
}
