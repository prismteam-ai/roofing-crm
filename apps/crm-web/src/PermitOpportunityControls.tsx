import type { QueryInput } from "../../../packages/contracts/src/index";

export const PERMIT_OPPORTUNITY_OPTIONS = [
  ["any_roofing_permit", "Any roofing permit"],
  ["confirmed_open", "Confirmed open / active"],
  ["status_verification_needed", "Status verification needed"],
  ["confirmed_closed", "Confirmed closed / final"],
  ["lifecycle_unknown", "Lifecycle unknown"],
] as const;

/** A primary opportunity mode never reuses an incompatible old open-duration predicate. */
export function permitModeChange(
  query: QueryInput,
  mode: QueryInput["permitOpportunityMode"],
): Partial<QueryInput> {
  return {
    permitOpportunityMode: mode,
    minPermitObservationAgeYears:
      mode === "status_verification_needed" ? 5 : undefined,
    permitStatus: "any",
    minOpenDays: 0,
    providerPermitStatus: undefined,
    permitActivityClaim: undefined,
    minPermitAgeSinceIssueDays: undefined,
    sort:
      mode === "status_verification_needed"
        ? "permit_issue_age_desc"
        : mode === "confirmed_open"
          ? "permit_open_days_desc"
          : query.sort === "permit_issue_age_desc" ||
              query.sort === "permit_open_days_desc"
            ? undefined
            : query.sort,
    cursor: undefined,
  };
}

export function PermitOpportunityControls({
  query,
  update,
}: {
  query: QueryInput;
  update: (fields: Partial<QueryInput>) => void;
}) {
  const candidate =
    query.permitOpportunityMode === "status_verification_needed";
  return (
    <section
      className="filter-row permit-opportunity-controls"
      aria-label="Permit opportunity filters"
    >
      <label>
        Permit opportunities
        <select
          aria-label="Permit opportunities"
          value={query.permitOpportunityMode ?? "none"}
          onChange={(e) =>
            update(
              permitModeChange(
                query,
                e.target.value === "none"
                  ? undefined
                  : (e.target.value as QueryInput["permitOpportunityMode"]),
              ),
            )
          }
        >
          <option value="none">No permit filter</option>
          {PERMIT_OPPORTUNITY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Minimum age since issue/status (years)
        <input
          aria-label="Minimum age since issue/status years"
          type="number"
          min="0"
          max="200"
          disabled={!candidate}
          value={query.minPermitObservationAgeYears ?? 5}
          onChange={(e) =>
            update({ minPermitObservationAgeYears: Number(e.target.value) })
          }
        />
      </label>
      {candidate ? (
        <p className="caveat" data-testid="verification-mode-caveat">
          Older roofing-permit records whose current lifecycle needs municipal
          verification. The age is since the reported issue, filing or status
          date at the source observation, not time continuously open.
        </p>
      ) : query.permitOpportunityMode === "confirmed_open" ? (
        <p className="caveat">
          Explicit source-confirmed open or active records only. Open duration
          requires a documented interval; issued alone is not open.
        </p>
      ) : null}
    </section>
  );
}
