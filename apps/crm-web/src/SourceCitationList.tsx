import type { Property } from "../../../packages/contracts/src/index";
import {
  propertyEvidence,
  isRestrictedProviderCitation,
} from "../../../packages/map-domain/src/signals";

/** Classify a displayed citation against actual validated source/record/digest triples. */
export function SourceCitationList({
  properties,
  citations,
}: {
  properties: Property[];
  citations: string[];
}) {
  const restricted = new Set(
    properties.flatMap((property) =>
      propertyEvidence(property)
        .filter((citation) => isRestrictedProviderCitation(property, citation))
        .map((citation) => `${citation.sourceId}:${citation.recordId}`),
    ),
  );
  return (
    <code>
      {citations.length
        ? citations.map((citation, index) => (
            <span
              key={citation}
              data-private-evidence={
                restricted.has(citation)
                  ? "provider-derived-citation"
                  : undefined
              }
            >
              {index > 0 ? " · " : ""}
              {citation}
            </span>
          ))
        : "No matching source records"}
    </code>
  );
}
