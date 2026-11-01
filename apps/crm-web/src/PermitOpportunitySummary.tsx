import type {
  Property,
  QueryInput,
} from "../../../packages/contracts/src/index";
import { qualifyingPermitSignals } from "../../../packages/contracts/src/query-predicates";

const labels = {
  confirmed_open: "Confirmed open / active",
  status_verification_needed: "Status verification needed",
  other_permit_activity: "Other roofing-permit activity",
  confirmed_closed: "Confirmed closed / final",
  unknown: "Lifecycle unknown",
} as const;

/** Only the observation qualifying this query supplies its badge, date and source. */
export function PermitOpportunitySummary({
  property,
  query,
  detailed = false,
}: {
  property: Property;
  query: QueryInput;
  detailed?: boolean;
}) {
  if (!query.permitOpportunityMode) return null;
  const signals = qualifyingPermitSignals(property, query);
  return (
    <div
      className="permit-opportunity-summary"
      data-testid="permit-opportunity-summary"
    >
      {signals.slice(0, detailed ? 6 : 1).map((signal) => (
        <div
          key={signal.observationId}
          data-private-evidence={
            signal.sourceKind === "provider_observation"
              ? "provider-derived-permit"
              : undefined
          }
        >
          <strong className={`permit-signal ${signal.leadSignal}`}>
            {labels[signal.leadSignal]}
          </strong>
          <p>
            {signal.dateBasis === "issued"
              ? "Issued"
              : signal.dateBasis === "filed"
                ? "Filed"
                : "Status date"}{" "}
            {signal.observationDate ?? "not reported"}
            {signal.ageDays !== null
              ? ` · ${(signal.ageDays / 365.2425).toFixed(1)} years since ${signal.dateBasis === "issued" ? "issue" : signal.dateBasis === "filed" ? "filing" : "status date"}`
              : " · age unavailable"}
          </p>
          {signal.lifecycleState === "confirmed_open" && (
            <p>
              Observed open duration:{" "}
              {signal.openDays === null
                ? "not established"
                : `${signal.openDays} days`}
            </p>
          )}
          <p>
            Source status:{" "}
            {signal.nativeStatus ?? signal.reportedStatus ?? "not reported"}
            {signal.statusKind === "provider_normalized"
              ? " (provider normalized)"
              : ""}
          </p>
          {detailed && (
            <>
              <p>Status basis: {signal.statusBasis.replaceAll("_", " ")}</p>
              <p>
                Lifecycle: {signal.lifecycleState.replaceAll("_", " ")} ·
                assessed{" "}
                {signal.assessmentAt?.slice(0, 10) ?? "date unavailable"} ·{" "}
                {signal.roofingBasis.replaceAll("_", " ")}
              </p>
              <p>
                {signal.party.reportedName ??
                  "Listed business/party not reported"}
                {signal.party.role
                  ? ` · ${signal.party.role.replaceAll("_", " ")}`
                  : ""}
                {signal.party.verifiedContractorIdentity
                  ? " · verified identity evidence"
                  : " · contractor role not independently established"}
              </p>
              <p>
                Source: {signal.provenance.sourceId} · record{" "}
                {signal.provenance.recordId} · join {signal.joinConfidence}
              </p>
              <small>{signal.limitations.join(" ")}</small>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
