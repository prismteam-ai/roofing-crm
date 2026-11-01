import type { QueryInput } from "../../../packages/contracts/src/index";
const statuses = [
  "FILED",
  "ISSUED",
  "IN_PROGRESS",
  "FINAL",
  "EXPIRED",
  "CANCELLED",
  "REVOKED",
  "UNKNOWN",
  "INTERCONNECTED",
] as const;
/** Qualified source observations have independent controls, without substituting tenure or continuous-open history. */
export function SourceEvidenceFilters({
  query,
  update,
}: {
  query: QueryInput;
  update: (fields: Partial<QueryInput>) => void;
}) {
  return (
    <section className="filter-row" aria-label="Qualified source observations">
      <label>
        Provider permit status
        <select
          aria-label="Provider permit status"
          value={query.providerPermitStatus ?? "any"}
          onChange={(e) =>
            update({
              providerPermitStatus:
                e.target.value === "any"
                  ? undefined
                  : (e.target.value as QueryInput["providerPermitStatus"]),
            })
          }
        >
          <option value="any">Any provider observation</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label>
        Activity evidence
        <select
          aria-label="Activity evidence"
          value={query.permitActivityClaim ?? "any"}
          onChange={(e) =>
            update({
              permitActivityClaim:
                e.target.value === "any"
                  ? undefined
                  : (e.target.value as QueryInput["permitActivityClaim"]),
            })
          }
        >
          <option value="any">Any activity evidence</option>
          <option value="provider_reported_active">
            Provider reported active
          </option>
          <option value="native_reported_open">
            Independently reported native open
          </option>
          <option value="not_established">Activity not established</option>
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          aria-label="Filter by permit age since issue"
          checked={query.minPermitAgeSinceIssueDays !== undefined}
          onChange={(e) =>
            update({
              minPermitAgeSinceIssueDays: e.target.checked ? 1827 : undefined,
            })
          }
        />
        Age since permit issue
      </label>
      <label>
        Minimum age since issue (days)
        <input
          aria-label="Minimum age since issue days"
          type="number"
          min="0"
          max="50000"
          disabled={query.minPermitAgeSinceIssueDays === undefined}
          value={query.minPermitAgeSinceIssueDays ?? 1827}
          onChange={(e) =>
            update({ minPermitAgeSinceIssueDays: Number(e.target.value) })
          }
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          aria-label="Filter by recorded deed index gap"
          checked={query.minRecordedDeedGapYears !== undefined}
          onChange={(e) =>
            update({
              minRecordedDeedGapYears: e.target.checked ? 10 : undefined,
            })
          }
        />
        Recorded deed index gap
      </label>
      <label>
        No observed deed for more than (years)
        <input
          aria-label="Recorded deed gap years"
          type="number"
          min="0"
          max="200"
          disabled={query.minRecordedDeedGapYears === undefined}
          value={query.minRecordedDeedGapYears ?? 10}
          onChange={(e) =>
            update({ minRecordedDeedGapYears: Number(e.target.value) })
          }
        />
      </label>
      <p className="caveat">
        Provider status, activity and issue age must come from the same
        observation. ISSUED alone does not establish open or active work. Age
        since issue is not continuous open duration. The deed gap covers each
        documented current-PIN index window through its verified date; it does
        not establish uninterrupted ownership or complete parcel lineage.
      </p>
    </section>
  );
}
