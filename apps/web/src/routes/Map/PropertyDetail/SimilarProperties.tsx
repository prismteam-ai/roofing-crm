// Drawer "Similar properties" (CRM-HANDOFF §4.3): properties with the same structure type
// (`property_type`) and a roof age within a band, within a radius, nearest first. The radius, the
// band and the limit come from the `search.similar` response, never copied here. Collapsed by default; the query runs
// only once the section is opened. Each row opens that property (the Map route sets `sel`).
import { useState, type ReactElement } from "react";
import { roofAgeConfidenceLabel } from "../../../format/index.js";
import { useSimilarProperties, type SimilarOutput } from "./similarApi.js";
import styles from "./PropertyDetail.module.css";

const plural = (n: number, unit: string): string => `${String(n)} ${unit}${n === 1 ? "" : "s"}`;

/** The matching rules in words, read from the response. */
function rulesText(rules: Pick<SimilarOutput, "radiusMi" | "roofAgeBandYears">): string {
  return `within ${plural(rules.radiusMi, "mile")} with the same structure type and a roof age within ${plural(rules.roofAgeBandYears, "year")}`;
}

function emptyText(data: SimilarOutput): string {
  switch (data.reason ?? "none_found") {
    case "no_coordinates":
      return "No similar properties shown · this property has no coordinates in the data";
    case "no_roof_age":
      return "No similar properties shown · this property has no roof age to compare";
    case "none_found":
      return `No similar properties found · none ${rulesText(data)}`;
  }
}

function SimilarList({
  propertyCid,
  onSelectProperty,
}: {
  readonly propertyCid: string;
  readonly onSelectProperty?: ((propertyCid: string) => void) | undefined;
}): ReactElement {
  const query = useSimilarProperties(propertyCid, true);
  if (query.isPending) return <p className={styles.empty}>Loading similar properties…</p>;
  if (query.isError) {
    return (
      <p className={styles.empty} role="alert" data-similar-error="">
        Similar properties could not be loaded · try again in a moment
      </p>
    );
  }
  const { similar, reason } = query.data;
  if (similar.length === 0) {
    return (
      <p className={styles.empty} data-similar-empty={reason ?? "none_found"}>
        {emptyText(query.data)}
      </p>
    );
  }
  return (
    <>
      <p className={styles.empty} data-similar-rules="">
        {`Up to ${String(query.data.limit)}, nearest first, ${rulesText(query.data)}`}
      </p>
      <ul className={styles.metaList} data-similar-list="">
        {similar.map((row) => (
          <li key={row.propertyCid} className={styles.metaRow} data-similar-cid={row.propertyCid}>
            <span>
              {`TCAD ${row.requestIdentifier} · ${row.distanceMi.toFixed(2)} mi · roof ${String(row.roofAgeYears)} yrs (${roofAgeConfidenceLabel(row.roofAgeConfidence).toLowerCase()} confidence)`}
            </span>
            {onSelectProperty === undefined ? null : (
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => onSelectProperty(row.propertyCid)}
              >
                {`Open TCAD ${row.requestIdentifier}`}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function SimilarProperties({
  propertyCid,
  titleId,
  onSelectProperty,
}: {
  readonly propertyCid: string;
  readonly titleId: string;
  readonly onSelectProperty?: ((propertyCid: string) => void) | undefined;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={styles.section}
      data-similar-properties=""
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className={styles.sectionTitle} id={`${titleId}-similar`}>
        Similar properties
      </summary>
      {open ? <SimilarList propertyCid={propertyCid} onSelectProperty={onSelectProperty} /> : null}
    </details>
  );
}
