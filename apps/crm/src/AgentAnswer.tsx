import type { AnswerResponse, Citation } from "./agent-types.ts";
import { Markdown } from "./markdown.tsx";

/**
 * The gaps every answer states, as the pipeline's packages/agent words them at 6200575 (policy.ts STANDARD_GAPS
 * and the contractor gap as contractor-coverage.ts states it for the run's window). They are listed under
 * "Always true"; any other gap belongs to this answer and is listed first.
 */
export const STANDARD_GAPS: readonly string[] = [
  "Permits cover the City of Los Angeles only (LADBS); parcels elsewhere in the county have no permit data.",
  "No contractor license data after May 2023.",
  "BBB ratings are not available.",
  "No owner data: owner names and contact details are neither collected nor served.",
  "Permit descriptions are not read or returned.",
];
const GAP_CONTRACTOR_NO_WINDOW =
  "The run's sources state no coverage window for the contractor rows: the end above is the documented one, not read from this run.";
const GAP_CONTRACTOR_WINDOW_UNREAD =
  "The contractor rows' coverage window could not be read from the run's sources: the end above is the documented one, not read from this run.";

/** A gap every answer states (see STANDARD_GAPS), as opposed to a gap of this answer. */
export function isStandingGap(gap: string): boolean {
  return (
    STANDARD_GAPS.includes(gap) ||
    gap === GAP_CONTRACTOR_NO_WINDOW ||
    gap === GAP_CONTRACTOR_WINDOW_UNREAD ||
    /^No contractor license data after [A-Z][a-z]+ \d{4}\.$/.test(gap) ||
    /^The contractor rows \(.+\) cover permits issued \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2} \(by .+\)\.$/.test(
      gap,
    )
  );
}

/** The answer's gaps: this answer's own first, then the standing ones. */
export function splitGaps(gaps: readonly string[]): {
  specific: string[];
  standing: string[];
} {
  return {
    specific: gaps.filter((g) => !isStandingGap(g)),
    standing: gaps.filter(isStandingGap),
  };
}

/** The Sources columns; each cell also carries its column's name, shown as the field's label when stacked. */
const COLUMNS = ["ID", "Source", "License", "Attribution", "Collected at"];

const KINDS: ReadonlyArray<[Citation["kind"], string]> = [
  ["parcel", "Parcels"],
  ["permit", "Permits"],
  ["contractor", "Contractor rows (by permit)"],
];

/** Text whose space-separated tokens never break inside (a timestamp may otherwise break after a hyphen). */
function Unbroken({ text }: { text: string }) {
  return text.split(" ").map((t, i) => (
    <span key={i}>
      {i > 0 && " "}
      <span className="nowrap">{t}</span>
    </span>
  ));
}

/**
 * One answer as the agent panel renders it. A parcel ID in Sources is a button: it opens the parcel's
 * detail and pans the map to it (onOpenParcel).
 */
export function AgentAnswerView({
  answer,
  onOpenParcel,
}: {
  answer: AnswerResponse;
  onOpenParcel: (parcelId: string) => void;
}) {
  const gaps = splitGaps(answer.gaps);
  return (
    <div
      className="agent-answer"
      data-testid="agent-answer"
      data-status={answer.status}
    >
      <div className="agent-text" data-testid="agent-text">
        <Markdown text={answer.text} flagged={answer.unverified_ids} />
      </div>
      {answer.unverified_ids.length > 0 && (
        <p className="notice" data-testid="agent-unverified">
          Unverified IDs (not returned by any tool in this answer; treat them as
          unconfirmed): {answer.unverified_ids.join(", ")}
        </p>
      )}
      <details data-testid="agent-how">
        <summary>How I got this</summary>
        <p>{answer.reasoning}</p>
        {answer.assumptions.length > 0 && (
          <>
            <b>Assumptions</b>
            <ul>
              {answer.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        )}
      </details>
      <h4>Sources</h4>
      {answer.records.length === 0 ? (
        <p data-testid="agent-sources-none">No records cited.</p>
      ) : (
        KINDS.map(([kind, label]) => {
          const rows = answer.records.filter((r) => r.kind === kind);
          if (!rows.length) return null;
          return (
            <div key={kind} className="table-wrap">
              <table
                className="agent-sources"
                data-testid="agent-sources"
                data-kind={kind}
              >
                <caption>{label}</caption>
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.kind}/${r.id}`}>
                      <td className="mono" data-label={COLUMNS[0]}>
                        {kind === "parcel" ? (
                          <button
                            type="button"
                            className="link"
                            data-testid="agent-parcel-link"
                            title="Open the parcel's details and show it on the map"
                            onClick={() => onOpenParcel(r.id)}
                          >
                            {r.id}
                          </button>
                        ) : (
                          r.id
                        )}
                      </td>
                      <td data-label={COLUMNS[1]}>{r.source_name}</td>
                      <td data-label={COLUMNS[2]}>{r.license ?? "—"}</td>
                      <td data-label={COLUMNS[3]}>{r.attribution ?? "—"}</td>
                      <td data-label={COLUMNS[4]}>
                        <Unbroken text={r.collected_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
      <h4>Gaps</h4>
      {gaps.specific.length > 0 && (
        <ul data-testid="agent-gaps">
          {gaps.specific.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
      <b>Always true</b>
      <ul data-testid="agent-standing-gaps">
        {gaps.standing.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
    </div>
  );
}
