import type { RunSummary } from "@oracle-la/api-client";

/** Share of `total` not counted in `present`, as a percentage with two decimals ("9.18"). */
const missingPct = (total: number, present: number) =>
  ((100 * (total - present)) / total).toFixed(2);

/**
 * What the data covers, from the served run (explorer.runSummary): the county, roll year, scope and parcel
 * count; as a source limit the parcels the assessor roll gives no year built or no coordinates (they never
 * appear in roof-age results); and the permit coverage (run.coverage.permit_data): LADBS permits cover the City
 * of Los Angeles only. Nothing here is hard-coded; until the summary loads only the usage line shows.
 */
export function DataNotice({
  run,
  error,
}: {
  run?: RunSummary["run"];
  error?: string;
}) {
  const r = run as
    | {
        county?: string;
        roll_year?: string;
        scope?: { jurisdiction?: string; zips?: string[] };
        row_counts?: { parquet?: number };
        coverage?: {
          with_year_built?: number;
          with_coordinates?: number;
          permit_data?: {
            parcels_with_permit_data?: number;
            parcels_without_permit_data?: number;
            parcels_with_permits?: number;
          };
        };
      }
    | undefined;
  const total = r?.row_counts?.parquet;
  const cov = r?.coverage;
  const scope =
    r?.scope?.jurisdiction === "all"
      ? "county-wide"
      : [
          r?.scope?.jurisdiction,
          r?.scope?.zips?.length && `ZIP ${r.scope.zips.join("/")}`,
        ]
          .filter(Boolean)
          .join(", ");
  return (
    <div data-testid="data-notice">
      <p className="notice">
        Opens on Los Angeles County. Click the map to drop a pin, or use GPS.
        {total !== undefined && (
          <>
            {" "}
            Data: {r?.county} County Assessor roll {r?.roll_year}, {scope},{" "}
            <span data-testid="data-parcels">
              {total.toLocaleString("en-US")}
            </span>{" "}
            parcels.
          </>
        )}
      </p>
      {!!total && cov?.with_year_built !== undefined && (
        <p className="notice" data-testid="data-coverage">
          Source limit:{" "}
          <span data-testid="data-no-year-built-pct">
            {missingPct(total, cov.with_year_built)}%
          </span>{" "}
          of parcels have no year built in the assessor roll
          {cov.with_coordinates !== undefined &&
            ` and ${missingPct(total, cov.with_coordinates)}% have no coordinates`}
          ; they never appear in roof-age results.
        </p>
      )}
      {!!total && cov?.permit_data?.parcels_with_permit_data !== undefined && (
        <p className="notice" data-testid="data-permit-coverage">
          Permit coverage: LADBS building permits, City of Los Angeles only:{" "}
          <span data-testid="data-permit-parcels">
            {cov.permit_data.parcels_with_permit_data.toLocaleString("en-US")}
          </span>{" "}
          of the {total.toLocaleString("en-US")} parcels have permit data
          {cov.permit_data.parcels_with_permits !== undefined &&
            ` (${cov.permit_data.parcels_with_permits.toLocaleString("en-US")} with at least one permit)`}
          .
        </p>
      )}
      {error && (
        <p className="error" data-testid="data-notice-error">
          Run summary unavailable: {error}
        </p>
      )}
    </div>
  );
}
