import { SourceCitationList } from "./SourceCitationList";
import { PermitOpportunityControls } from "./PermitOpportunityControls";
import { PermitOpportunitySummary } from "./PermitOpportunitySummary";
import { AgentPermitSections } from "./AgentPermitSections";
import { officialPlaceResolver } from "../../../packages/places/src/index";
import { SourceEvidenceFilters } from "./SourceEvidenceFilters";
import { type QueryInput } from "../../../packages/contracts/src/index";
import {
  milesToMeters,
  OAKLAND_CENTER,
  queryFromUrl,
} from "../../../packages/map-domain/src/index";
import { oldestOpenRoofDays as openDays } from "../../../packages/map-domain/src/signals";
import { FieldMap } from "../../../packages/ui/src/FieldMap";
import { ConstraintLedger, PlaceResolution } from "./ConstraintLedger";
import "./style.css";
import type { CrmController } from "./useCrmController";
import { useEffect, useState } from "react";
export function OpportunitiesView({
  controller,
}: {
  controller: CrmController;
}) {
  const {
    query,
    setQuery,
    queryUrlError,
    clearInvalidUrlFilters,
    health,
    result,
    loading,
    error,
    selected,
    placing,
    setPlacing,
    gps,
    setGps,
    mapProvider,
    basemap,
    setBasemap,
    prompt,
    setPrompt,
    answer,
    agentBusy,
    agentError,
    rejectedIntent,
    appliedIntent,
    setAppliedIntent,
    seq,
    synthetic,
    update,
    choose,
    choosePlace,
    applyPermitSection,
    pin,
    useGps,
    ask,
    age,
    knownOpenPermits,
  } = controller;
  const advancedValues = [
    query.minConfidence !== "any" ? query.minConfidence : undefined,
    query.ownerRegion !== "any" ? query.ownerRegion : undefined,
    query.minReportedSaleAgeYears,
    query.providerPermitStatus,
    query.permitActivityClaim,
    query.minPermitAgeSinceIssueDays,
    query.minRecordedDeedGapYears,
    query.requiresContractor || undefined,
    query.requiresVerifiedLicense || undefined,
    query.requiresBbbRating || undefined,
    query.sort,
    query.limit !== undefined && query.limit !== 50 ? query.limit : undefined,
  ];
  const advancedCount = advancedValues.filter(
    (value) => value !== undefined,
  ).length;
  const advancedKey = JSON.stringify(advancedValues);
  const [advancedOpen, setAdvancedOpen] = useState(advancedCount > 0);
  useEffect(() => {
    if (advancedCount > 0) setAdvancedOpen(true);
  }, [advancedKey, advancedCount]);
  return (
    <>
      <section className="search-toolbar" aria-label="Search filters">
        <div className="search-context">
          <span className="location-glyph">⌖</span>
          <div>
            <b>Oakland County</b>
            <span>
              {query.lat.toFixed(4)}, {query.lng.toFixed(4)}
            </span>
          </div>
        </div>
        <label>
          Search area
          <select
            aria-label="Search area"
            value={query.placeId ?? ""}
            onChange={(e) => {
              if (e.target.value) choosePlace(e.target.value);
              else update({ placeId: undefined, placeIndexDigest: undefined });
            }}
          >
            <option value="">Map pin / GPS</option>
            {officialPlaceResolver.places
              .filter((place) => place.resolutionEligible)
              .map((place) => (
                <option key={place.placeId} value={place.placeId}>
                  {place.name} · {place.type}
                </option>
              ))}
          </select>
        </label>
        <label>
          Search radius
          <select
            aria-label="Search radius"
            value={String(query.radiusMeters / 1609.344)}
            onChange={(e) =>
              update({
                radiusMeters: milesToMeters(Number(e.target.value)),
              })
            }
          >
            {[...new Set([1, 3, 5, 10, 20, query.radiusMeters / 1609.344])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n} miles
                </option>
              ))}
          </select>
        </label>
        <button className="button secondary" onClick={useGps}>
          ⌖ Use GPS
        </button>
        <button
          className={`button ${placing ? "primary" : "secondary"}`}
          onClick={() => setPlacing((v) => !v)}
        >
          Place pin
        </button>
        <button
          className="icon-button"
          aria-label="Move pin east"
          title="Move pin east"
          onClick={() => pin(query.lat, query.lng + 0.02)}
        >
          →
        </button>
        <button
          className="text-button"
          onClick={() => {
            setQuery({
              ...queryFromUrl("", query.snapshotId),
              ...OAKLAND_CENTER,
            });
            setGps("");
            setPlacing(false);
          }}
        >
          Reset
        </button>
      </section>
      {queryUrlError && (
        <div
          className="error-banner"
          role="alert"
          data-testid="invalid-query-url"
        >
          {queryUrlError}{" "}
          <button onClick={clearInvalidUrlFilters}>
            Clear invalid URL filters
          </button>
        </div>
      )}
      {result?.placeResolution && (
        <PlaceResolution place={result.placeResolution} />
      )}
      {appliedIntent && <ConstraintLedger intent={appliedIntent} />}
      {gps && (
        <p className="inline-status" role="status">
          {gps}
        </p>
      )}
      <PermitOpportunityControls query={query} update={update} />
      <section className="filter-row">
        <div className="filter-group">
          <label className="check-label">
            <input
              type="checkbox"
              checked={query.roofMinAgeYears !== undefined}
              onChange={(e) =>
                update({
                  roofMinAgeYears: e.target.checked ? 15 : undefined,
                })
              }
            />
            Filter by roof age
          </label>
          <label className="compact-label">
            Roof age
            <input
              aria-label="Roof age"
              type="number"
              min="0"
              max="150"
              disabled={query.roofMinAgeYears === undefined}
              value={query.roofMinAgeYears ?? 15}
              onChange={(e) =>
                update({ roofMinAgeYears: Number(e.target.value) })
              }
            />
            <span>years +</span>
          </label>
        </div>
        <label>
          Permit status
          <select
            aria-label="Permit status"
            value={query.permitStatus ?? "any"}
            onChange={(e) =>
              update({
                permitStatus: e.target.value as QueryInput["permitStatus"],
                permitOpportunityMode: undefined,
                minPermitObservationAgeYears: undefined,
                sort:
                  query.sort === "permit_issue_age_desc"
                    ? undefined
                    : query.sort,
              })
            }
          >
            <option value="any">Any status</option>
            <option value="open">Open permits</option>
            <option value="closed">Closed permits</option>
            <option value="unknown">Acquired status unknown</option>
          </select>
        </label>
        <label>
          Minimum open days
          <input
            aria-label="Minimum open days"
            disabled={
              query.permitOpportunityMode !== undefined &&
              query.permitOpportunityMode !== "confirmed_open"
            }
            type="number"
            min="0"
            max="50000"
            value={query.minOpenDays ?? 0}
            onChange={(e) => update({ minOpenDays: Number(e.target.value) })}
          />
        </label>
      </section>
      <details
        className="coverage-note advanced-evidence-filters"
        data-testid="advanced-evidence-filters"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary>
          Advanced evidence filters ·{" "}
          {advancedCount > 0 ? `${advancedCount} active` : "None active"}
        </summary>
        <section
          className="filter-row"
          aria-label="Additional evidence filters"
        >
          <label>
            Evidence confidence
            <select
              aria-label="Evidence confidence"
              value={query.minConfidence ?? "any"}
              onChange={(e) =>
                update({
                  minConfidence: e.target.value as QueryInput["minConfidence"],
                })
              }
            >
              <option value="any">All confidence levels</option>
              <option value="high">High only</option>
              <option value="medium">Medium or higher</option>
              <option value="low">Known evidence</option>
            </select>
          </label>
          <label>
            Owner region
            <select
              aria-label="Owner region"
              value={query.ownerRegion ?? "any"}
              onChange={(e) =>
                update({
                  ownerRegion: e.target.value as QueryInput["ownerRegion"],
                })
              }
            >
              <option value="any">Any evidence state</option>
              <option value="regional">Mailing state: Michigan</option>
              <option value="out_of_area">
                Mailing state: outside Michigan
              </option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              aria-label="Filter by last reported sale age"
              checked={query.minReportedSaleAgeYears !== undefined}
              onChange={(e) =>
                update({
                  minReportedSaleAgeYears: e.target.checked ? 10 : undefined,
                })
              }
            />
            Last reported sale age
          </label>
          <label>
            Reported sale older than (years)
            <input
              aria-label="Reported sale older than years"
              type="number"
              min="0"
              max="200"
              disabled={query.minReportedSaleAgeYears === undefined}
              value={query.minReportedSaleAgeYears ?? 10}
              onChange={(e) =>
                update({
                  minReportedSaleAgeYears: Number(e.target.value),
                })
              }
            />
          </label>
        </section>
        <SourceEvidenceFilters query={query} update={update} />
        <section
          className="filter-row"
          aria-label="Evidence requirements and result order"
        >
          {(
            [
              ["requiresContractor", "Require verified company identity"],
              [
                "requiresVerifiedLicense",
                "Require official license observation",
              ],
              ["requiresBbbRating", "Require observed BBB rating"],
            ] as const
          ).map(([field, label]) => (
            <label className="check-label" key={field}>
              <input
                type="checkbox"
                aria-label={label}
                checked={query[field] === true}
                onChange={(e) =>
                  update({ [field]: e.target.checked ? true : undefined })
                }
              />
              {label}
            </label>
          ))}
          <label>
            Result order
            <select
              aria-label="Result order"
              value={query.sort ?? "default"}
              onChange={(e) =>
                update({
                  sort:
                    e.target.value === "default"
                      ? undefined
                      : (e.target.value as QueryInput["sort"]),
                })
              }
            >
              <option value="default">Default evidence order</option>
              <option value="distance">Closest first</option>
              <option value="roof_age_desc">
                Oldest recorded roof proxy first
              </option>
              {query.permitOpportunityMode && (
                <option value="permit_issue_age_desc">
                  Oldest issue/status age first
                </option>
              )}
              <option value="permit_open_days_desc">
                Longest observed open duration first
              </option>
            </select>
          </label>
          <label>
            Page limit
            <select
              aria-label="Page limit"
              value={query.limit ?? 50}
              onChange={(e) => update({ limit: Number(e.target.value) })}
            >
              {[...new Set([1, 5, 10, 20, 50, query.limit ?? 50])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n} properties
                  </option>
                ))}
            </select>
          </label>
        </section>
        <p className="caveat">
          Owner region describes recorded mailing state, not verified current
          residence. An official license observation does not establish active
          eligibility. A verified company edge is distinct from a reported
          applicant name.
        </p>
        <p className="caveat" data-testid="reported-sale-scope">
          Last reported sale uses partial observed history, not ownership
          tenure. Unknown sale dates are excluded when this filter is on; later
          unobserved sales may exist.
        </p>
      </details>
      {query.minOwnershipYears !== undefined && (
        <p className="caveat" role="status">
          This older link contains an unsupported ownership-tenure filter. It
          has not been converted to a reported-sale filter.{" "}
          <button onClick={() => update({ minOwnershipYears: undefined })}>
            Clear unsupported tenure filter
          </button>
        </p>
      )}
      <section className="results-heading">
        <div>
          <h2>
            Explore opportunities <span>{result?.total ?? "—"}</span>
          </h2>
          <p data-testid="query-identity">
            {result
              ? `Snapshot ${result.snapshotId} · query ${result.queryHash}`
              : `Search generation ${seq.current} pending`}
            <br />
            {result?.truncated
              ? `Showing ${result.rows.length} of ${result.total}; refine filters. No hidden map matches.`
              : "Map and list use the same snapshot and filters."}
          </p>
        </div>
        <div className="map-options">
          <label>
            <input
              type="checkbox"
              checked={basemap}
              onChange={(e) => setBasemap(e.target.checked)}
            />
            Map context
          </label>
          <span>
            <i className="legend-dot" /> Property{" "}
            <i className="legend-dot permit" /> Known open permit
          </span>
        </div>
      </section>
      {result && result.limitations.length > 0 && (
        <details className="coverage-note">
          <summary>Coverage and evidence limitations</summary>
          {result.limitations.map((limitation, index) => (
            <p key={index}>{limitation}</p>
          ))}
        </details>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}{" "}
          <button onClick={() => setQuery((q) => ({ ...q }))}>
            Retry search
          </button>
        </div>
      )}
      <div className="explore-grid">
        <FieldMap
          query={query}
          rows={result?.rows ?? []}
          selected={selected?.id ?? null}
          placing={placing}
          onPin={pin}
          onSelect={choose}
          basemap={basemap}
          synthetic={synthetic}
          provider={mapProvider}
        />
        <section className="property-list" aria-label="Matching properties">
          <div className="list-header">
            <span>
              {queryUrlError
                ? "Search paused: invalid link filters"
                : loading
                  ? "Updating search…"
                  : `${result?.rows.length ?? 0} properties displayed`}
            </span>
            <span>
              {query.sort === "permit_issue_age_desc" ||
              (query.sort === undefined &&
                query.permitOpportunityMode === "status_verification_needed")
                ? "Issue/status age ↓"
                : query.sort === "permit_open_days_desc" ||
                    (query.sort === undefined &&
                      query.permitOpportunityMode === "confirmed_open")
                  ? "Open duration ↓"
                  : query.sort === "roof_age_desc"
                    ? "Roof age ↓"
                    : "Distance ↑"}
            </span>
          </div>
          {!queryUrlError && !loading && !result?.rows.length && !error ? (
            <div className="empty-state">
              <span>⌖</span>
              <h3>No matches in this search</h3>
              <p>
                Widen the radius or adjust age and permit filters. Missing
                evidence is never treated as zero.
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  update({
                    roofMinAgeYears: undefined,
                    permitStatus: "any",
                    minOpenDays: 0,
                    permitOpportunityMode: undefined,
                    minPermitObservationAgeYears: undefined,
                    sort: undefined,
                  })
                }
              >
                Clear opportunity filters
              </button>
            </div>
          ) : (
            result?.rows.map((p) => (
              <button
                key={p.id}
                data-property-id={p.id}
                data-testid="property-row"
                className={`property-card ${selected?.id === p.id ? "selected" : ""}`}
                onClick={() => choose(p)}
              >
                <div className="property-card-head">
                  <span className={`usage ${p.usage}`}>{p.usage}</span>
                  <span>{(p.distanceMeters / 1609.344).toFixed(1)} mi ↗</span>
                </div>
                <h3>{p.address}</h3>
                <span className="property-id">{p.id}</span>
                <div className="card-signals">
                  <div>
                    <span>Roof evidence</span>
                    <strong>{age(p)}</strong>
                  </div>
                  <div>
                    <span title="Acquired roofing permit records only">
                      Known open permits
                    </span>
                    <strong data-testid="known-open-permits">
                      {knownOpenPermits(p) ?? "Unknown"}
                    </strong>
                  </div>
                </div>
                <PermitOpportunitySummary property={p} query={query} />
                <div className="card-footer">
                  <span className={`confidence ${p.roof.confidence}`}>
                    {p.roof.confidence === "unknown"
                      ? "Unknown age"
                      : `${p.roof.confidence} confidence`}
                  </span>
                  <span>
                    {openDays(p) !== null
                      ? `${openDays(p)?.toLocaleString()} days open at observation`
                      : "Open duration unknown"}
                  </span>
                </div>
              </button>
            ))
          )}
        </section>
      </div>
      <section className="agent-panel">
        <div className="agent-title">
          <span className="agent-glyph">✧</span>
          <div>
            <h2>Ask your evidence assistant</h2>
            <p>Turn a question into the same typed property search.</p>
          </div>
          <span className="offline-label">
            {answer?.mode === "evidence-empty"
              ? "No matches · model not called"
              : answer?.mode === "deterministic-fallback"
                ? "DETERMINISTIC FALLBACK · MODEL UNAVAILABLE"
                : answer?.mode === "deterministic-offline"
                  ? "DETERMINISTIC · NO INFERENCE"
                  : answer?.mode === "bedrock-grounded"
                    ? "NOVA · GROUNDED EVIDENCE"
                    : health?.provider === "bedrock-grounded"
                      ? "NOVA ENABLED · GROUNDED READ"
                      : "DETERMINISTIC · NO INFERENCE"}
          </span>
        </div>
        <div className="agent-input">
          <input
            aria-label="Agent prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ask();
            }}
          />
          <button
            className="button primary"
            onClick={() => void ask()}
            disabled={agentBusy || loading || !result}
          >
            {agentBusy ? "Retrieving…" : "Ask agent"} ↗
          </button>
        </div>
        {agentError && (
          <p role="alert" className="agent-error">
            {agentError}
          </p>
        )}
        <ConstraintLedger
          intent={answer?.intent ?? rejectedIntent}
          onApply={
            answer?.intent?.accepted
              ? () => {
                  if (!answer.intent?.query) return;
                  setAppliedIntent(answer.intent);
                  setQuery(answer.intent.query);
                }
              : undefined
          }
        />
        {answer && (
          <div
            className="agent-answer"
            data-testid="agent-answer"
            aria-live="polite"
          >
            <p>{answer.answer}</p>
            <AgentPermitSections
              answer={answer}
              choose={choose}
              apply={applyPermitSection}
            />
            <p className="caveat" data-testid="agent-permit-evidence">
              Permit counts describe acquired records. Zero matches do not prove
              permit absence; unacquired evidence is unknown.
            </p>
            <div className="agent-result-links">
              {answer.results.slice(0, 6).map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    choose(p, answer.query.snapshotId, answer.query)
                  }
                >
                  {p.address} · known open permits{" "}
                  {knownOpenPermits(p) ?? "Unknown"} ↗
                </button>
              ))}
            </div>
            <details>
              <summary>
                {answer.citations.length} source citations · inspect retrieval
                trace
              </summary>
              <SourceCitationList
                properties={answer.results}
                citations={answer.citations}
              />
              <pre>{JSON.stringify(answer.toolTrace, null, 2)}</pre>
            </details>
            <p className="caveat">{answer.caveats.join(" ")}</p>
          </div>
        )}
      </section>
      <div className="page-foot">
        <span>Source-backed decisions, with uncertainty kept visible.</span>
        <span>
          {synthetic
            ? "Synthetic fixture · separate from real data"
            : health?.dataMode === "protected-real"
              ? "Mixed source terms · low-confidence building year proxies"
              : "Official public evidence · coverage limitations apply"}
        </span>
      </div>
    </>
  );
}
