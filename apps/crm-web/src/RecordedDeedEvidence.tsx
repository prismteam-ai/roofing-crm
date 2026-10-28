import { sourceCalendarAnniversary } from "../../../packages/contracts/src/index";
import type { RecordedTransferIndexObservation } from "../../../packages/contracts/src/index";
/** Current-PIN index observations are explicitly narrower than ownership continuity. */
export function RecordedDeedEvidence({
  observations,
  minimumYears,
}: {
  observations?: RecordedTransferIndexObservation[];
  minimumYears?: number;
}) {
  if (!observations?.length) return null;
  return (
    <section
      aria-label="Recorded deed index observations"
      className="private-protected-evidence"
      data-private-evidence="recorded-deed-index"
    >
      <h3 className="section-label">
        RECORDED DEED INDEX · BOUNDED CURRENT-PIN OBSERVATION
      </h3>
      {observations.map((row, index) => (
        <div
          className="permit-detail"
          key={`${row.reference.recordSha256}:${index}`}
          data-testid="recorded-deed-observation"
        >
          <p>
            <b>
              {row.noDeedObservedForMoreThanTenYears
                ? "No deed observed for more than 10 years within this documented window"
                : "Documented current-PIN deed index observation"}
            </b>
          </p>
          <p>
            Claim window: {row.claimWindowStart} through {row.observedThrough}.
            Last recorded deed date in this query:{" "}
            {row.lastRecordedDeedDate ?? "no dated deed observed"} ·{" "}
            {row.deedDocumentCount} deed document(s).
          </p>
          <p>
            Source indexed through {row.sourceIndexedThrough}; source verified
            through {row.sourceVerifiedThrough}. Observation retrieved{" "}
            {row.reference.observedAt.slice(0, 10)}. Witness timing:{" "}
            {row.witnessTiming.replaceAll("_", " ")}.
          </p>
          <p>
            Ten-year source-qualification cutoff:{" "}
            {sourceCalendarAnniversary(row.observedThrough, -10)}.
            {minimumYears !== undefined
              ? ` Requested ${minimumYears}-year cutoff: ${sourceCalendarAnniversary(row.observedThrough, -minimumYears)}.`
              : ""}
            {` Source verification ends ${Math.floor((Date.parse(row.reference.observedAt.slice(0, 10)) - Date.parse(row.sourceVerifiedThrough)) / 86400000)} days before this observation retrieval; the later interval is not verified by this index observation.`}
          </p>
          <p className="caveat">
            All result pages were observed for an exact current-PIN query with
            no date or other search filters. Prior parcel lineage was not
            reviewed. This does not establish current/legal ownership,
            uninterrupted tenure, or the absence of every possible transfer.
          </p>
          <a
            href={row.reference.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Official county deed index ↗
          </a>
          <small>
            Protected source {row.reference.sourceId} · evidence digest{" "}
            {row.reference.recordSha256.slice(0, 12)}…
          </small>
          <p className="caveat">{row.limitations.join(" ")}</p>
        </div>
      ))}
    </section>
  );
}
