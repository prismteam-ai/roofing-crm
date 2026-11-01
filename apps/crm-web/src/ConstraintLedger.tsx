import type { IntentPlan } from "../../../packages/agent/src/intent/types";
import type { PlaceReference } from "../../../packages/contracts/src/index";
const labels: Record<string, string> = {
  center: "Search center",
  placeId: "Official place",
  placeIndexDigest: "Place-index revision",
  countyScope: "County scope",
  radiusMeters: "Radius",
  roofMinAgeYears: "Roof-proxy age",
  permitStatus: "Acquired permit status",
  minOpenDays: "Observed open duration",
  ownerRegion: "Owner mailing-state class",
  minReportedSaleAgeYears: "Last reported sale age",
  providerPermitStatus: "Provider normalized permit status",
  permitActivityClaim: "Source-qualified activity claim",
  minPermitAgeSinceIssueDays: "Age since permit issue",
  sourceAssessmentDate: "Source assessment calendar anchor",
  minRecordedDeedGapYears: "Bounded recorded deed index gap",
  minOwnershipYears: "Uninterrupted ownership",
  includeUnknown: "Unknown roof-age inclusion",
  minConfidence: "Roof confidence",
  requiresContractor: "Verified company evidence",
  requiresVerifiedLicense: "Official license observation",
  requiresBbbRating: "Observed BBB rating",
  sort: "Result order",
  limit: "Page limit",
  display: "Displayed evidence",
  safety: "Unavailable operation",
  expression: "Request meaning",
};
export function PlaceResolution({ place }: { place: PlaceReference }) {
  return (
    <section
      className="place-resolution"
      aria-label="Official search place"
      data-testid="place-resolution"
    >
      <strong>
        {place.name} · {place.type}
      </strong>
      <p>
        Official geometry-derived search center: {place.center.lat},{" "}
        {place.center.lng}. The radius is measured from this point; this is not
        a municipal-boundary filter.
      </p>
      <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer">
        Official place source ↗
      </a>
      <details>
        <summary>Place identity and method</summary>
        <p>
          {place.placeId} · FIPS {place.stateFips}/{place.countyFips}/
          {place.localFips ?? "unavailable"}
        </p>
        <p>{place.centerMethod}</p>
        <p>Observed {place.observedAt}</p>
        <code>Index {place.indexDigest}</code>
        <code>Geometry {place.geometrySha256}</code>
      </details>
    </section>
  );
}
export function ConstraintLedger({
  intent,
  onApply,
}: {
  intent: IntentPlan | null | undefined;
  onApply?: () => void;
}) {
  if (!intent) return null;
  return (
    <section
      className="constraint-ledger"
      aria-label="Constraint ledger"
      data-testid="constraint-ledger"
    >
      <h3>{intent.accepted ? "Applied request" : "Request not run"}</h3>
      <p>
        {intent.accepted
          ? "Each material request below has a typed interpretation. Descriptive requests show available observations without requiring those fields."
          : "A material request could not be applied safely. This request was refused before evidence retrieval or model use."}
      </p>
      {intent.placeResolution && (
        <PlaceResolution place={intent.placeResolution} />
      )}
      {intent.accepted && intent.query && onApply && (
        <button className="button secondary" onClick={onApply}>
          Show this search on the map
        </button>
      )}
      <details open={!intent.accepted}>
        <summary>Inspect all constraints ({intent.ledger.length})</summary>
        <ol>
          {intent.ledger.map((entry, i) => (
            <li key={i} data-classification={entry.classification}>
              <strong>
                {entry.classification} ·{" "}
                {labels[entry.typedField] ?? entry.typedField}
              </strong>
              {entry.rawSpan ? (
                <q>{entry.rawSpan}</q>
              ) : (
                <span>Current search context</span>
              )}
              {entry.typedValue !== undefined && (
                <code>{JSON.stringify(entry.typedValue)}</code>
              )}
              <p>{entry.reason}</p>
              {entry.evidence.length > 0 && (
                <small>{entry.evidence.join(" · ")}</small>
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
