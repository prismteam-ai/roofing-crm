// One Field triage card (CrmTriage390, CrmTriageLead390, CrmTriageNoAddress390,
// CrmTriageNoContractor390, CrmTriageFailed390): TCAD title (E-93), distance and bearing from the
// pin, type, roof with basis and confidence, the main permit signal with "Open > 5 yrs", the
// contractor line (this contract publishes no name: the reason is shown, E-93), the BBB state
// (never a score) and "Why is this a lead?" chips. Swipe right = create, left = skip (pointer
// events; past 96 px it commits, otherwise the card snaps back). Render-only: the stack decides.
import { isLongOpen } from "@crm/domain";
import { Icon, StatusPill } from "@crm/ui";
import type { CrmPermit } from "@crm/index-schema";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from "react";
import {
  contractorResolutionLabel,
  propertyKind,
  propertySubtitle,
  roofAgeBucket,
  roofAgeConfidenceLabel,
  missingReasonText,
} from "../../../format/index.js";
import { STATUS_LABEL } from "../../Leads/LeadFilters.js";
import {
  candidateTitle,
  permitSignalText,
  shortBasis,
  whyChips,
  type Candidate,
  type CandidateFilters,
} from "../Candidates/candidates.js";
import styles from "./Triage.module.css";

/** Past this horizontal drag, in px, a swipe commits (CRM-HANDOFF §4.4). */
export const SWIPE_COMMIT_PX = 96;

export interface TriageBbb {
  readonly status: NonNullable<CrmPermit["bbbStatus"]> | null;
  readonly reason: string | null;
}

export interface TriageCardProps {
  readonly candidate: Candidate;
  readonly filters: CandidateFilters;
  readonly position: number;
  readonly total: number;
  readonly nearPlace: string | null;
  /** Null until `property.get` answers; the card then says the state could not be read. */
  readonly bbb: TriageBbb | "loading" | "unavailable";
  /** Create failed: the message shown in the card's error banner with Try again. */
  readonly error: string | null;
  readonly reducedMotion: boolean;
  readonly onSwipe: (direction: "create" | "skip") => void;
  readonly onOpenDetails: () => void;
  readonly onRetry: () => void;
}

function BbbLine({ bbb }: { readonly bbb: TriageCardProps["bbb"] }): ReactElement {
  if (bbb === "loading") return <p className={styles.line}>BBB: checking…</p>;
  if (bbb === "unavailable" || bbb.status === null || bbb.reason === null) {
    return <p className={styles.line}>BBB: not available · state could not be read</p>;
  }
  return (
    <p className={styles.line} data-field="bbb_status">
      {`BBB: Not checked · ${missingReasonText("bbb_rating", bbb.reason)}`}
    </p>
  );
}

export function TriageCard({
  candidate,
  filters,
  position,
  total,
  nearPlace,
  bbb,
  error,
  reducedMotion,
  onSwipe,
  onOpenDetails,
  onRetry,
}: TriageCardProps): ReactElement {
  const { property, mainPermit, lead } = candidate;
  const title = candidateTitle(property);
  const kind = propertyKind(property.propertyUsageType);
  const bucket = roofAgeBucket(property.roofAgeYears);
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLElement>): void => {
    if ((e.target as Element).closest("a, button") !== null) return;
    start.current = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>): void => {
    if (start.current === null) return;
    setDx(e.clientX - start.current);
  };
  const end = (e: PointerEvent<HTMLElement>): void => {
    if (start.current === null) return;
    const moved = e.clientX - start.current;
    start.current = null;
    setDx(0);
    if (moved >= SWIPE_COMMIT_PX) onSwipe("create");
    else if (moved <= -SWIPE_COMMIT_PX) onSwipe("skip");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSwipe("skip");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSwipe("create");
    } else if (e.key === "Enter") {
      e.preventDefault();
      onOpenDetails();
    }
  };

  const drag = reducedMotion ? 0 : dx;
  const stamp = dx >= 24 ? "Create lead" : dx <= -24 ? "Skip" : null;
  const why = whyChips(candidate, filters);
  const label = `Card ${String(position)} of ${String(total)}: ${title}. Left arrow skips, right arrow creates a lead, Enter opens details.`;

  return (
    <article
      className={styles.card}
      tabIndex={0}
      aria-label={label}
      data-triage-card={property.propertyCid}
      data-dragging={dx !== 0}
      style={
        drag === 0
          ? undefined
          : { transform: `translateX(${String(drag)}px) rotate(${String(drag / 30)}deg)` }
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
    >
      {stamp === null ? null : (
        <span className={`${styles.stamp} ${dx > 0 ? styles.stampCreate : styles.stampSkip}`}>
          {stamp}
        </span>
      )}
      <header className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{title}</h3>
        {candidate.distanceMi === null ? null : (
          <span className={styles.distance}>
            {`${candidate.distanceMi.toFixed(1)} mi ${candidate.bearing ?? ""} from the pin`}
          </span>
        )}
      </header>
      <p className={styles.sub}>
        {`${propertySubtitle(property)}${
          property.latitude === null || property.longitude === null
            ? ""
            : ` · ${property.latitude.toFixed(4)}, ${property.longitude.toFixed(4)}`
        }`}
      </p>
      <p className={styles.sub}>
        {nearPlace === null ? "" : `near ${nearPlace} · `}
        {kind.label}
      </p>

      {error === null ? null : (
        <div className={styles.errorBanner} role="alert" data-triage-error="">
          <Icon name="error" size="medium" />
          <span className={styles.errorText}>{error}</span>
          <button type="button" className={styles.errorAction} onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {lead === null ? null : (
        <p className={styles.leadPill} data-lead-mark={lead.status}>
          <Icon name="assignment_ind" size="small" />
          {`Already a lead · ${STATUS_LABEL[lead.status]} · ${lead.leadId}`}
        </p>
      )}

      <p className={styles.line} data-field="roof_age_years">
        <span
          className={styles.swatch}
          aria-hidden="true"
          style={bucket === null ? undefined : { background: `var(${bucket.token})` }}
        />
        {property.roofAgeYears === null ? (
          <span>Roof age not published · no basis on record</span>
        ) : (
          <>
            <strong>{`Roof ${String(property.roofAgeYears)} yrs`}</strong>
            {` · ${shortBasis(property.roofAgeBasis)}`}
          </>
        )}
        <span className={`${styles.conf} ${styles[`conf_${property.roofAgeConfidence}`] ?? ""}`}>
          {roofAgeConfidenceLabel(property.roofAgeConfidence)}
        </span>
      </p>

      <p className={styles.line} data-field="main_permit">
        <Icon name="description" size="small" />
        {mainPermit === null ? "No open or stalled permit" : permitSignalText(mainPermit)}
      </p>
      {mainPermit !== null && isLongOpen(mainPermit.openDays) ? (
        <p className={styles.openPill}>Open &gt; 5 yrs</p>
      ) : null}

      {mainPermit === null ? null : (
        <p className={styles.line} data-field="contractor">
          Contractor not published · no lexicon carrier in contract/v1
          <span
            className={styles.badge}
            data-contractor-resolution={mainPermit.contractorResolution ?? "unresolved"}
          >
            <StatusPill
              status={mainPermit.contractorResolution === "resolved" ? "verified" : "unavailable"}
              text={contractorResolutionLabel(mainPermit.contractorResolution ?? "unresolved")}
            />
          </span>
        </p>
      )}
      <BbbLine bbb={bbb} />

      {why.length === 0 ? null : (
        <>
          <p className={styles.whyTitle}>Why is this a lead?</p>
          <ul className={styles.whyList}>
            {why.map((chip) => (
              <li key={chip} className={styles.whyChip}>
                <Icon name="check" size="small" />
                {chip}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
