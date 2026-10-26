// B-03 result row (tasks.md T025; AC-3, FR-003). Replaces the A-13/ORACLE-u version this file was
// copied from (C1 copy, 2026-10-23): that version rendered Task A's place-based `ExploreRow`
// (address, distance/bearing, tenure, owner area class — none of which exist on this story's own
// `CrmProperty`, and ADR-03 keeps owner data out of the CRM entirely). This version renders this
// story's own fields verbatim — `roofAgeYears`/`roofAgeBasis`/`roofAgeConfidence` (never
// recomputed, data-model.md) — plus provenance (constitution XI) via the copied `@crm/ui`
// components. A missing roof age always shows its stated reason (constitution P0-4), never `0`,
// blank or `null`.
import type { LatLng } from "@crm/domain";
import { missingLabel, type MissingReason as Reason } from "@crm/oracle-contract";
import type { CrmPermit, CrmProperty, Missing, Provenanced } from "@crm/index-schema";
import {
  CidDisplay,
  Icon,
  MissingList,
  MissingReason,
  Provenance,
  StatusPill,
  formatUtc,
} from "@crm/ui";
import {
  memo,
  useId,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ownerAreaPill,
  propertySubtitle,
  propertyTitle,
  bbbGapText,
  contractorReasonText,
  coordinateSourceLabel,
  groupMissing,
  missingEntry,
  missingReasonText,
  propertyKind,
  roofAgeBasisLabel,
  roofAgeConfidenceLabel,
  roofAgeGapLabel,
  roofAgeText,
} from "../../format/index.js";
import { BbbLink } from "./BbbLink.js";
import { PermitChip } from "./PermitChip.js";
import { SourceLink, safeSourceHref } from "./SourceLink.js";
import { mainPermitOf, runLabel } from "./whyLead.js";
import { directionLabel, distanceFromCentre } from "./resultsView.js";
import styles from "./ResultRow.module.css";

/** The card's title: the street address as TCAD prints it (contract v1.2), with the TCAD id under
 *  it. A row without one shows the TCAD id and the reason from its own `missing` entry, never the
 *  raw lat/lon as if it were an address (constitution P0-4). */
export function RowTitle({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  return <TitleStack main={propertyTitle(row)} sub={propertySubtitle(row)} />;
}

/** The title block: the main line (address or TCAD id) over its secondary line. */
export function TitleStack({
  main,
  sub,
}: {
  readonly main: string;
  readonly sub: string;
}): ReactElement {
  return (
    <span className={styles.titleStack}>
      <span className={styles.titleMain}>{main}</span>
      <span className={styles.titleSub}>{sub}</span>
    </span>
  );
}

/** The signal lines under a card's fields (contractor, BBB): one small paragraph each. */
export function SignalLines({
  lines,
}: {
  readonly lines: readonly { readonly field: string; readonly content: ReactNode }[];
}): ReactElement {
  return (
    <div className={styles.signals} data-permit-signals="">
      {lines.map((line) => (
        <p key={line.field} className={styles.signal} data-field={line.field}>
          {line.content}
        </p>
      ))}
    </div>
  );
}

/** Distance and compass direction from the search centre ("2.8 mi NW"; AC-1: real distance via
 *  packages/domain's distanceMeters, never the display-only ring math in CrmMap.tsx). */
function RowDistance({
  row,
  center,
}: {
  readonly row: Provenanced<CrmProperty>;
  readonly center: LatLng;
}): ReactElement | null {
  const from = distanceFromCentre(center, row.latitude, row.longitude);
  if (from === null) return null;
  return (
    <span
      className={styles.distance}
      title="Straight-line distance and direction from the search centre"
    >
      {directionLabel(from)}
    </span>
  );
}

/** E-51 Residential / Commercial from the published usage type; "Type not published" when it
 *  is null (E-93). The structure form (`propertyType`, e.g. "Building") is not the design's type. */
export function TypePill({
  usageType,
  missing,
}: {
  readonly usageType: string | null;
  /** The row's `missingReasons`, for the reason behind an unpublished type. */
  readonly missing?: readonly Missing[] | undefined;
}): ReactElement {
  const kind = propertyKind(usageType);
  if (!kind.published) {
    const entry = missingEntry(missing, "property_usage_type");
    return (
      <StatusPill
        status="unavailable"
        text={
          entry === undefined
            ? kind.label
            : `${kind.label} · ${missingReasonText(entry.field, entry.reason)}`
        }
        icon="help"
        data={{
          field: "property_usage_type",
          ...(entry === undefined ? {} : { reason: entry.reason }),
        }}
      />
    );
  }
  return (
    <span className={styles.typePill} data-field="property_usage_type">
      <Icon name={kind.icon} size="small" />
      {kind.label}
    </span>
  );
}

/** Owner area as a pill: "Out-of-area owner" or "Local owner". Nothing when the index does not say
 *  (`null` or absent: the drawer's Owner section states the reason). */
export function OutOfAreaPill({
  isOutOfArea,
  areaClass,
}: {
  readonly isOutOfArea: boolean | null | undefined;
  /** When the row carries the class, the pill words it ("Regional owner"), so the two never differ. */
  readonly areaClass?: CrmProperty["ownerAreaClass"] | undefined;
}): ReactElement | null {
  if (isOutOfArea == null) return null;
  const pill = ownerAreaPill(areaClass);
  return (
    <StatusPill
      status={isOutOfArea ? "warning" : "info"}
      text={
        pill !== null ? `${pill.text} owner` : isOutOfArea ? "Out-of-area owner" : "Local owner"
      }
      data={{ field: "owner_is_out_of_area" }}
    />
  );
}

/** Spread-able optional `label` (the prop is optional under exactOptionalPropertyTypes). */
const labelProp = (label: string | undefined): { label?: string } =>
  label === undefined ? {} : { label };

/** The roof chips of a match: "Roof 24 yrs" with its confidence, or the stated gap. Shared by the
 *  filter rows and the Ask AI rows. `confidence` is absent when the source does not carry one (the
 *  chip then says so instead of guessing). */
export function RoofChips({
  years,
  confidence,
  gap,
}: {
  readonly years: number | null;
  readonly confidence: CrmProperty["roofAgeConfidence"] | undefined;
  /** The element that says why there is no roof age. */
  readonly gap: ReactElement;
}): ReactElement {
  if (years === null) return gap;
  const confidenceStatus =
    confidence === "high" ? "verified" : confidence === "none" ? "unavailable" : "warning";
  return (
    <span className={styles.roofBadges}>
      <StatusPill status="info" text={`Roof ${years} yrs`} icon="roofing" />
      <StatusPill
        status={confidence === undefined ? "unavailable" : confidenceStatus}
        text={
          confidence === undefined
            ? "Confidence not in this answer"
            : `Confidence ${roofAgeConfidenceLabel(confidence)}`
        }
      />
    </span>
  );
}

function RoofBadge({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  const entry =
    row.missingReasons.find((m) => m.field === "roofAgeYears") ??
    row.missingReasons.find((m) => m.field === "roof_age_years");
  return (
    <RoofChips
      years={row.roofAgeYears}
      confidence={row.roofAgeConfidence}
      gap={
        entry === undefined ? (
          <StatusPill status="unavailable" text="Roof age not available" />
        ) : (
          <MissingReason
            field={entry.field}
            reason={entry.reason as Reason}
            {...labelProp(roofAgeGapLabel(row.propertyType, entry.reason))}
          />
        )
      }
    />
  );
}

/** A distance beside the title (the same slot and look for "2.8 mi NW" and "near X · 2.8 mi"). */
export function DistanceLabel({
  text,
  title,
}: {
  readonly text: string;
  readonly title: string;
}): ReactElement {
  return (
    <span className={styles.distance} title={title}>
      {text}
    </span>
  );
}

function missingFor(row: Provenanced<CrmProperty>, field: string): Missing | undefined {
  return row.missingReasons.find((m) => m.field === field);
}

/** The roof-age cell's gap, using the row's own `missingReasons` entry when it has one
 *  (constitution P0-4: never a blank, never `0`, never the literal "null"). */
function RoofAgeGap({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  const entry = missingFor(row, "roofAgeYears") ?? missingFor(row, "roof_age_years");
  if (entry !== undefined) {
    return (
      <MissingReason
        field={entry.field}
        reason={entry.reason as Reason}
        {...labelProp(roofAgeGapLabel(row.propertyType, entry.reason))}
      />
    );
  }
  // No missingReasons entry on this slice yet (B-03-TC-012, GAP-4b: no live row demonstrates
  // this), but roofAgeYears can still be null — show the honest fallback rather than inventing
  // a reason the row never carried.
  return <span>roof age not available</span>;
}

function Cell({
  label,
  field,
  children,
}: {
  readonly label: string;
  readonly field: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className={styles.cell}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value} data-field={field}>
        {children}
      </dd>
    </div>
  );
}

/** The four detail cells (roof age, basis, confidence, coordinates), values supplied by the caller. */
export function FieldGrid({
  roofAge,
  basis,
  confidence,
  coordinates,
}: {
  readonly roofAge: ReactNode;
  readonly basis: ReactNode;
  readonly confidence: ReactNode;
  readonly coordinates: ReactNode;
}): ReactElement {
  return (
    <dl className={styles.fields}>
      <Cell label="Roof age" field="roof_age_years">
        {roofAge}
      </Cell>
      <Cell label="Basis" field="roof_age_basis">
        {basis}
      </Cell>
      <Cell label="Confidence" field="roof_age_confidence">
        {confidence}
      </Cell>
      <Cell label="Coordinates" field="lat_lon">
        {coordinates}
      </Cell>
    </dl>
  );
}

export function PropertyFields({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  return (
    <FieldGrid
      roofAge={
        row.roofAgeYears === null ? (
          <RoofAgeGap row={row} />
        ) : (
          roofAgeText(row.roofAgeYears, row.roofAgeBasis)
        )
      }
      basis={
        <>
          {roofAgeBasisLabel(row.roofAgeBasis)}
          {row.roofAgeBasis === "built_year" && row.structureBuiltYear != null
            ? ` · Year built ${row.structureBuiltYear}`
            : ""}
        </>
      }
      confidence={roofAgeConfidenceLabel(row.roofAgeConfidence)}
      coordinates={
        row.latitude === null || row.longitude === null ? (
          <span>{coordinateSourceLabel("none")}</span>
        ) : (
          `${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)} · ${coordinateSourceLabel(row.coordinateSource)}`
        )
      }
    />
  );
}

/** The lead permit's contractor as printed (unverified) and its BBB state, each with the reason
 *  when empty (CRM-HANDOFF §4.3: contractor "as printed on permit", BBB in one of its states). */
function PermitSignals({
  permits,
}: {
  readonly permits: readonly Provenanced<CrmPermit>[] | undefined;
}): ReactElement | null {
  const permit = mainPermitOf(permits) ?? permits?.[0];
  if (permit === undefined) return null;
  return (
    <div className={styles.signals} data-permit-signals="">
      <p className={styles.signal} data-field="contractor_name_as_printed">
        {permit.contractorNameAsPrinted != null
          ? `Contractor “${permit.contractorNameAsPrinted}” as printed on permit · not verified`
          : `Contractor not published · ${contractorReasonText(permit)}`}
      </p>
      <p className={styles.signal} data-field="bbb_status">
        {bbbGapText(permit)}
        {permit.bbbUrl == null ? null : (
          <>
            {" · "}
            <BbbLink url={permit.bbbUrl} label="Search BBB" />
          </>
        )}
      </p>
    </div>
  );
}

/** The row's `missingReasons` entries, grouped by reason and wording (constitution XI/P0-4) as a
 *  short bullet list: one bullet per distinct reason with its fields joined, up to three, the rest
 *  behind "Show all N". The raw names stay in `data-fields`. */
export function MissingSummary({
  row,
}: {
  readonly row: Pick<Provenanced<CrmProperty>, "missingReasons">;
}): ReactElement | null {
  if (row.missingReasons.length === 0) return null;
  return (
    <MissingList
      groups={groupMissing(row.missingReasons).map((group) => ({
        key: `${group.reason}|${group.reasonLabel}`,
        reason: group.reasonLabel,
        fields: group.fieldsInline,
        data: { "missing-group": group.reason, fields: group.fields.join(",") },
      }))}
    />
  );
}

export function RowProvenance({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  // No usable source link: say so plainly (the real `missing` lists carry no source_url entry, so no
  // contract code is invented). Written here rather than through the shared line, which prints the
  // raw run id.
  const source =
    safeSourceHref(row.sourceUrl) === null ? (
      <span data-source-missing="">No source link published</span>
    ) : (
      <SourceLink url={row.sourceUrl} label="source record" />
    );
  return (
    <Provenance>
      Source: {source}
      {" · collected "}
      <time dateTime={row.capturedAt}>{formatUtc(row.capturedAt)}</time>
      {" UTC · record "}
      <CidDisplay cid={row.cid} />
      {` · ${runLabel(row.runId)}`}
    </Provenance>
  );
}

export interface ResultRowProps {
  readonly row: Provenanced<CrmProperty>;
  readonly onSelect?: (propertyCid: string) => void;
  /** Opens "Why is this a lead?" for this row (the results pane shows the panel). */
  readonly onWhy?: (propertyCid: string) => void;
  readonly selected?: boolean;
  /** This property's permits (longest open first), shown as chips: the first one in the collapsed
   *  line, all of them once expanded. `undefined` or empty renders nothing: a permit is never
   *  implied for a property the permit query did not return. */
  readonly permits?: readonly Provenanced<CrmPermit>[] | undefined;
  /** The current search centre, for the card's distance and direction (AC-1). `undefined`
   *  renders no distance (no centre has been chosen yet). */
  readonly center?: LatLng | undefined;
  /** Controlled expanded state (the results panel owns it, for collapse all and expand all).
   *  Left out, the row keeps its own state and starts collapsed. */
  readonly expanded?: boolean;
  readonly onToggleExpanded?: (propertyCid: string) => void;
}

export interface MatchCardProps {
  /** The property's CID (hooks, the title id). */
  readonly propertyCid: string;
  readonly title: ReactNode;
  /** The number a citing answer gave this property (the pin's number); absent for filter results. */
  readonly citation?: ReactNode;
  readonly distance?: ReactNode;
  readonly onSelect?: ((propertyCid: string) => void) | undefined;
  readonly selected?: boolean;
  /** The answer is pointing at this match (its citation or pin is focused). */
  readonly focused?: boolean;
  /** Controlled expanded state; left out, the card keeps its own and starts collapsed. */
  readonly expanded?: boolean | undefined;
  readonly onToggleExpanded?: ((propertyCid: string) => void) | undefined;
  /** The chips under the title line. */
  readonly badges: ReactNode;
  /** Always-visible controls under the chips (the Ask answer's Create lead). */
  readonly actions?: ReactNode;
  /** The expanded detail (only drawn while expanded). */
  readonly detail: ReactNode;
  /** Extra `data-*` hooks on the article. */
  readonly data?: Readonly<Record<string, string>> | undefined;
}

/** The ONE match card: header (number, title, distance, open, expand), chips, expandable detail.
 *  Filter results (`ResultRow`) and Ask AI answers (`AnswerMatchRow`) both render through it, so a
 *  match looks and reads the same whichever way it was found. */
export function MatchCard({
  propertyCid,
  title,
  citation,
  distance,
  onSelect,
  selected = false,
  focused = false,
  expanded: expandedProp,
  onToggleExpanded,
  badges,
  actions,
  detail,
  data = {},
}: MatchCardProps): ReactElement {
  const [ownExpanded, setOwnExpanded] = useState(false);
  const expanded = expandedProp ?? ownExpanded;
  const toggle = (): void => {
    if (onToggleExpanded !== undefined) onToggleExpanded(propertyCid);
    else setOwnExpanded((open) => !open);
  };
  const select = (): void => onSelect?.(propertyCid);
  const onClick = (event: MouseEvent<HTMLElement>): void => {
    if ((event.target as Element).closest("a, button") !== null) return;
    select();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  };
  const titleId = `row-${propertyCid}`;
  const detailId = useId();
  const dataAttributes = Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v]));
  return (
    <article
      className={`${styles.row} ${selected ? styles.selected : ""} ${focused ? styles.focused : ""}`}
      data-result-row=""
      data-focused={focused}
      data-expanded={expanded ? "true" : "false"}
      data-property-cid={propertyCid}
      {...dataAttributes}
      aria-labelledby={titleId}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <header className={styles.head}>
        {citation === undefined ? null : (
          <span className={styles.citation} aria-hidden="true">
            {citation}
          </span>
        )}
        <h4 id={titleId} className={styles.title}>
          {title}
        </h4>
        {distance}
        {onSelect === undefined ? null : (
          <button
            type="button"
            className={styles.iconAction}
            onClick={select}
            aria-label="Open details"
            title="Open the property"
          >
            <Icon name="open_in_new" size="medium" />
          </button>
        )}
        <button
          type="button"
          className={styles.iconAction}
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={expanded ? detailId : undefined}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          title={expanded ? "Show less" : "Show more"}
        >
          <Icon name={expanded ? "expand_less" : "expand_more"} size="medium" />
        </button>
      </header>
      <div className={styles.badgeRow}>{badges}</div>
      {actions}
      {expanded ? (
        <div id={detailId} className={styles.detail}>
          {detail}
        </div>
      ) : null}
    </article>
  );
}

/** One result: a collapsed line (address or TCAD id, distance and direction, chips, expand) and,
 *  once expanded, the full detail card (CID, basis, confidence, coordinates, source). The detail is
 *  not rendered while collapsed, so a page of rows stays cheap to draw. */
function ResultRowView({
  row,
  onSelect,
  onWhy,
  selected = false,
  permits,
  center,
  expanded,
  onToggleExpanded,
}: ResultRowProps): ReactElement {
  const firstPermit = permits?.[0];
  const morePermits = (permits?.length ?? 0) - 1;
  return (
    <MatchCard
      propertyCid={row.propertyCid}
      title={<RowTitle row={row} />}
      distance={center === undefined ? null : <RowDistance row={row} center={center} />}
      onSelect={onSelect}
      selected={selected}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      badges={
        <>
          <RoofBadge row={row} />
          {firstPermit === undefined ? null : (
            <ul className={styles.permits} aria-label="Permits">
              <li className={styles.permitItem}>
                <PermitChip permit={firstPermit} />
              </li>
              {morePermits > 0 ? (
                <li className={styles.permitItem}>
                  <span className={styles.more}>{`+${String(morePermits)} more`}</span>
                </li>
              ) : null}
            </ul>
          )}
          <TypePill usageType={row.propertyUsageType} missing={row.missingReasons} />
          <OutOfAreaPill isOutOfArea={row.ownerIsOutOfArea} areaClass={row.ownerAreaClass} />
        </>
      }
      detail={
        <>
          <p className={styles.cidLine}>
            Property <CidDisplay cid={row.propertyCid} />
          </p>
          <PropertyFields row={row} />
          <OutOfAreaPill isOutOfArea={row.ownerIsOutOfArea} areaClass={row.ownerAreaClass} />
          <PermitSignals permits={permits} />
          {onWhy === undefined ? null : (
            <button
              type="button"
              className={styles.whyBtn}
              data-why-open=""
              onClick={() => onWhy(row.propertyCid)}
            >
              <Icon name="account_tree" size="medium" />
              Why is this a lead?
            </button>
          )}
          {permits !== undefined && permits.length > 1 ? (
            <ul className={styles.permits} aria-label="All permits">
              {permits.map((permit) => (
                <li key={permit.permitCid} className={styles.permitItem}>
                  <PermitChip permit={permit} />
                </li>
              ))}
            </ul>
          ) : null}
          <MissingSummary row={row} />
          <RowProvenance row={row} />
        </>
      }
    />
  );
}

export const ResultRow = memo(ResultRowView);

// Re-exported for FilterSheet.test fixtures/other callers expecting a single wording source
// (matches the original file's intent; this story's wording is confirmed against the design
// before G7 — GAP-2, testplans/B-03-test-cases.md §10).
export const missingLabelFor = missingLabel;
