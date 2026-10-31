import { SourceCitationList } from "./SourceCitationList";
import type { AgentAnswer } from "../../../packages/agent/src/index";
import type {
  Property,
  QueryInput,
} from "../../../packages/contracts/src/index";
import { PermitOpportunitySummary } from "./PermitOpportunitySummary";

/** Alternatives have their own query, count and apply action; they never replace strict results. */
export function AgentPermitSections({
  answer,
  choose,
  apply,
}: {
  answer: AgentAnswer;
  choose: (
    property: Property,
    snapshotId?: string,
    detailQuery?: QueryInput,
  ) => void;
  apply: (query: QueryInput) => void;
}) {
  if (!answer.permitSections) return null;
  return (
    <div className="agent-permit-sections" data-testid="agent-permit-sections">
      {answer.permitSections.map((section) => (
        <section key={section.kind} aria-label={section.label}>
          <h3>{section.label}</h3>
          <p>
            {section.total} matched · {section.returnedCount} returned ·{" "}
            {Math.min(4, section.results.length)} previewed
            {section.truncated ? " · more matches available" : ""}
          </p>
          {section.kind === "status_verification_needed" && (
            <p className="caveat">
              These are not confirmed open permits. Their current lifecycle
              requires municipal verification.
            </p>
          )}
          {section.results.slice(0, 4).map((property) => (
            <div key={property.id} className="agent-permit-result">
              <button
                onClick={() =>
                  choose(property, section.query.snapshotId, section.query)
                }
              >
                {property.address} · {property.id} ↗
              </button>
              <PermitOpportunitySummary
                property={property}
                query={section.query}
              />
            </div>
          ))}
          {section.total > 0 && (
            <button
              className="button secondary"
              onClick={() => apply(section.query)}
            >
              Show{" "}
              {section.kind === "confirmed_open"
                ? "confirmed open permits"
                : "verification candidates"}{" "}
              on map
            </button>
          )}
          <details>
            <summary>
              {section.citations.length} source citations · query details
            </summary>
            <p>
              Query {section.queryHash} · snapshot {section.query.snapshotId}
            </p>
            <SourceCitationList
              properties={section.results}
              citations={section.citations}
            />
            {section.caveats.map((caveat, index) => (
              <p className="caveat" key={index}>
                {caveat}
              </p>
            ))}
          </details>
        </section>
      ))}
    </div>
  );
}
