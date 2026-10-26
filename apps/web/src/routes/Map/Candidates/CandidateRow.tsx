// One Candidate list row (CrmCandidates1440/768/390, CrmCandidatesNoAddress390): checkbox, the
// selection order number, TCAD title (E-93: no street address is published), type and the
// "Lead · {status}" mark (E-52), roof age with its bucket swatch, basis, confidence, the main
// permit signal, distance and bearing, lat/lon, then Open details, Show on map and "Why is this a
// lead?". One DOM at every width; CandidateList.module.css hides columns below 1240 and 768 px.
import { Icon, Popover } from "@crm/ui";
import { useId, useState, type ReactElement } from "react";
import { Link } from "react-router";
import {
  missingReasonText,
  propertyKind,
  roofAgeBucket,
  roofAgeConfidenceLabel,
  roofAgeGapLabel,
  propertySubtitle,
} from "../../../format/index.js";
import { STATUS_LABEL } from "../../Leads/LeadFilters.js";
import { candidateTitle, shortBasis, permitSignalText, type Candidate } from "./candidates.js";
import styles from "./CandidateList.module.css";

export interface CandidateRowProps {
  readonly candidate: Candidate;
  readonly checked: boolean;
  /** 1-based position in the selection, shown in the # column; null when not selected. */
  readonly order: number | null;
  readonly why: readonly string[];
  readonly permitsUnavailable: boolean;
  readonly active: boolean;
  readonly onToggle: (propertyCid: string) => void;
  readonly onSelect?: ((propertyCid: string) => void) | undefined;
  readonly onShowOnMap?: ((propertyCid: string) => void) | undefined;
}

const CONFIDENCE_CLASS: Readonly<Record<string, string | undefined>> = {
  high: styles.confHigh,
  medium: styles.confMedium,
  low: styles.confLow,
  none: styles.confNone,
};

function RoofCell({ candidate }: { readonly candidate: Candidate }): ReactElement {
  const { roofAgeYears, missingReasons, propertyType } = candidate.property;
  if (roofAgeYears === null) {
    const entry = missingReasons.find(
      (m) => m.field === "roofAgeYears" || m.field === "roof_age_years",
    );
    return (
      <span className={styles.muted} data-field="roof_age_years">
        {entry === undefined
          ? "Not published"
          : `Not published · ${roofAgeGapLabel(propertyType, entry.reason) ?? missingReasonText(entry.field, entry.reason)}`}
      </span>
    );
  }
  const bucket = roofAgeBucket(roofAgeYears);
  return (
    <span className={styles.roof} data-field="roof_age_years">
      <span
        className={styles.swatch}
        aria-hidden="true"
        style={bucket === null ? undefined : { background: `var(${bucket.token})` }}
      />
      {`${String(roofAgeYears)} yrs`}
    </span>
  );
}

function PermitCell({
  candidate,
  permitsUnavailable,
}: {
  readonly candidate: Candidate;
  readonly permitsUnavailable: boolean;
}): ReactElement {
  if (candidate.mainPermit !== null) {
    return <span data-field="main_permit">{permitSignalText(candidate.mainPermit)}</span>;
  }
  return (
    <span className={styles.muted} data-field="main_permit">
      {permitsUnavailable ? "Permits not loaded" : "No open or stalled permit"}
    </span>
  );
}

function WhyButton({ why }: { readonly why: readonly string[] }): ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={styles.whyWrap}>
      <button
        type="button"
        className={styles.iconBtn}
        aria-label="Why is this a lead?"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="info" size="medium" />
      </button>
      <div id={id}>
        <Popover open={open} onClose={() => setOpen(false)} label="Why is this a lead?" align="end">
          <p className={styles.whyTitle}>Why is this a lead?</p>
          <ul className={styles.whyList}>
            {why.map((chip) => (
              <li key={chip} className={styles.whyChip}>
                <Icon name="check" size="small" />
                {chip}
              </li>
            ))}
          </ul>
        </Popover>
      </div>
    </span>
  );
}

export function CandidateRow({
  candidate,
  checked,
  order,
  why,
  permitsUnavailable,
  active,
  onToggle,
  onSelect,
  onShowOnMap,
}: CandidateRowProps): ReactElement {
  const { property, lead } = candidate;
  const title = candidateTitle(property);
  const kind = propertyKind(property.propertyUsageType);
  return (
    <tr
      className={`${styles.row} ${checked ? styles.rowChecked : ""} ${active ? styles.rowActive : ""}`}
      data-candidate-row=""
      data-property-cid={property.propertyCid}
      data-lead-status={lead?.status ?? ""}
    >
      <td className={styles.cCheck}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={checked}
          onChange={() => onToggle(property.propertyCid)}
          aria-label={`Select ${title}`}
        />
      </td>
      <td className={`${styles.cNum} ${styles.wide840}`}>
        {order === null ? null : <span className={styles.order}>{order}</span>}
      </td>
      <td className={styles.cAddress}>
        <span className={styles.title}>{title}</span>
        <span className={styles.sub}>
          {propertySubtitle(property)}
          {property.latitude === null || property.longitude === null ? null : (
            <span className={styles.narrowOnly}>
              {` · ${property.latitude.toFixed(4)}, ${property.longitude.toFixed(4)}`}
            </span>
          )}
        </span>
        <span className={styles.kindLine}>
          <span className={styles.muted}>{kind.label}</span>
          {lead === null ? null : (
            <>
              <span aria-hidden="true">·</span>
              <Link
                className={styles.leadMark}
                to={`/leads/${encodeURIComponent(lead.leadKey)}`}
                data-lead-mark={lead.status}
              >
                {`Lead · ${STATUS_LABEL[lead.status]}`}
              </Link>
            </>
          )}
        </span>
      </td>
      <td className={styles.cRoof}>
        <RoofCell candidate={candidate} />
      </td>
      <td className={`${styles.cBasis} ${styles.wide1240}`}>{shortBasis(property.roofAgeBasis)}</td>
      <td className={styles.cConf}>
        <span className={`${styles.conf} ${CONFIDENCE_CLASS[property.roofAgeConfidence] ?? ""}`}>
          {roofAgeConfidenceLabel(property.roofAgeConfidence)}
        </span>
      </td>
      <td className={`${styles.cPermit} ${styles.wide768}`}>
        <PermitCell candidate={candidate} permitsUnavailable={permitsUnavailable} />
      </td>
      <td className={`${styles.cMi} ${styles.wide768}`}>
        {candidate.distanceMi === null ? (
          <span className={styles.muted}>No location</span>
        ) : (
          <>
            {candidate.distanceMi.toFixed(1)}
            <span className={styles.wide1240Inline}>{` ${candidate.bearing ?? ""}`}</span>
          </>
        )}
      </td>
      <td className={`${styles.cLatLon} ${styles.wide1032}`}>
        {property.latitude === null || property.longitude === null ? (
          <span className={styles.muted}>Not published</span>
        ) : (
          `${property.latitude.toFixed(5)}, ${property.longitude.toFixed(5)}`
        )}
      </td>
      <td className={styles.cActions}>
        <span className={styles.actions}>
          {onSelect === undefined ? null : (
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.primaryIcon}`}
              aria-label={`Open details for ${title}`}
              onClick={() => onSelect(property.propertyCid)}
            >
              <Icon name="open_in_new" size="medium" />
            </button>
          )}
          {onShowOnMap === undefined ? null : (
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.primaryIcon} ${styles.wide1240}`}
              aria-label={`Show ${title} on the map`}
              onClick={() => onShowOnMap(property.propertyCid)}
            >
              <Icon name="explore" size="medium" />
            </button>
          )}
          <WhyButton why={why} />
        </span>
      </td>
    </tr>
  );
}
