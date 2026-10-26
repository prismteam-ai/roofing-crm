// B-03 property detail drawer (tasks.md T037/T038/T039; AC-6, AC-7, FR-006, FR-007). Restyled for
// the structural rebuild against CRM-HANDOFF §4.3 / boards CrmProperty390/768/1440 and
// CrmPropertyPartial390/CrmPropertyNoContractor390/CrmPropertyNoAddress390: address-or-NoAddress
// header (never a fake address — this contract has none yet, FU-A-01), Roof and Permits sections
// with their own headings, contractor "as printed" with ContractorBadge, BBB in one of its real
// states, a source link per permit and "View lineage in Explorer". Lead creation is owned by B-07 and
// added additively through `LeadCreateAction` (Leads/LeadCreateAction.tsx, B-07 T026): one for the
// property and one per permit row, both making the same lead; it also shows "Already a lead".
//
// UI fix (2026-10-25, side-by-side audit vs CrmProperty1440/390): the property's Create lead is
// full width right under the header (CRM-HANDOFF §4.3 "address and lead status on top; then
// Create lead"), with View lineage beside it; every value goes through src/format (dates as
// calendar days, enum codes and field names as plain labels). Placement (side sheet ≥ 1280 px,
// full-height sheet below) is Map.module.css's `.drawerSlot`.
import type { LatLng } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import {
  CidDisplay,
  IconButton,
  MissingList,
  MissingReason,
  Provenance,
  StatusPill,
  formatUtc,
} from "@crm/ui";
import type { MissingReason as Reason } from "@crm/oracle-contract";
import { forwardRef, useEffect, useId, useRef, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router";
import {
  BBB_SOURCE_LABEL,
  SOURCE_PARCELS_LABEL,
  bbbGapText,
  contractorReasonText,
  coordinateSourceLabel,
  formatDate,
  groupMissing,
  humanizeCode,
  missingEntry,
  mailingLocation,
  missingReasonText,
  openDurationText,
  ownerAreaPill,
  finaledPermitLabel,
  permitStatusLabel,
  permitsSourceLabel,
  propertySubtitle,
  propertyTitle,
  streetAddress,
  tenureBandLabel,
  roofAgeBasisLabel,
  roofAgeConfidenceLabel,
  roofAgeGapLabel,
  roofAgeText,
} from "../../../format/index.js";
import { LeadCreateAction } from "../../Leads/LeadCreateAction.js";
import { ContractorBadge } from "./ContractorBadge.js";
import { ASK_NOW_STATE } from "../../../components/Onboarding/firstVisit.js";
import { MissingSummary, RowProvenance, TypePill } from "../ResultRow.js";
import { BbbLink } from "../BbbLink.js";
import { WhyBody } from "../WhyBody.js";
import { SourceLink, safeSourceHref } from "../SourceLink.js";
import { patchMapMode } from "../mapMode.js";
import { hasUnfinaledRoofPermit, roofSourceLabel, runLabel } from "../whyLead.js";
import { SimilarProperties } from "./SimilarProperties.js";
import styles from "./PropertyDetail.module.css";

/** `bbb_status` (contract v1.1): `rated` is never published; `blocked` means BBB blocked the lookup. */
type BbbStatus = NonNullable<CrmPermit["bbbStatus"]>;

/** The exact shape `property.get` returns (contracts/property-detail.md) — kept local rather
 *  than imported from `@crm/api-client` so this component has no hard dependency on the tRPC
 *  client package for its own Vitest/Storybook-style rendering tests. */
export interface PropertyDetailData {
  readonly property: Provenanced<CrmProperty> | null;
  readonly permits: Provenanced<CrmPermit>[];
  readonly bbbStatus: BbbStatus | null;
  readonly bbbStatusReason: string | null;
  /** Null when the API has no CountyLens host configured (EXPLORER_BASE_URL unset). */
  readonly lineageUrl: string | null;
  /** The nearest travis-places@1.0.0 place centroid, computed server-side by `property.get`;
   *  absent when the property has no coordinates. */
  readonly nearPlace?: NearPlace;
}

/** `property.get`'s `nearPlace` (apps/api services/agent/placeResolver.ts `NearestPlace`). */
export interface NearPlace {
  readonly name: string;
  readonly distanceMi: number;
  readonly source: string;
  readonly sha256: string;
}

export interface PropertyDetailProps {
  readonly data: PropertyDetailData;
  readonly onClose: () => void;
  /** Opens another property (a "Similar properties" row); the Map route sets `sel`. */
  readonly onSelectProperty?: ((propertyCid: string) => void) | undefined;
  /** The search centre, radius and its name, for the inline "Why this is a lead" distance rule. */
  readonly center?: LatLng | undefined;
  readonly radiusMi?: number | undefined;
  readonly centreLabel?: string | undefined;
  /** CountyLens base URL, for the Verify CID action in the "Why" section. */
  readonly countyLensUrl?: string | null | undefined;
}

/** A design row for something the published data cannot support yet: disabled, with the reason on
 *  hover and for assistive tech. Never a working control. */
function ComingSoonRow({
  label,
  reason,
}: {
  readonly label: string;
  readonly reason: string;
}): ReactElement {
  return (
    <div className={styles.permitField} data-coming-soon={label}>
      <dt>{label}</dt>
      <dd>
        <button
          type="button"
          className={styles.soonButton}
          disabled
          title={reason}
          aria-label={`${label}: coming soon. ${reason}`}
        >
          Coming soon
        </button>
      </dd>
    </div>
  );
}

/** Basis, source, run and CID of the roof age, from the row itself. */
function RoofEvidence({ property }: { readonly property: Provenanced<CrmProperty> }): ReactElement {
  return (
    <p className={styles.titleSub} data-roof-evidence="">
      {`Evidence: ${roofAgeBasisLabel(property.roofAgeBasis)} · ${roofSourceLabel(property)} · ${runLabel(property.runId)} · `}
      <CidDisplay cid={property.cid} />
    </p>
  );
}

/** "BBB rating not available" + the reason from the permit's own `missing` entry (AC-7) — never a
 *  blank field, `0`, `N/A` or `—`, and never an invented rating (constitution P0-4). */
function BbbField({ permit }: { readonly permit: Provenanced<CrmPermit> }): ReactElement {
  const entry = missingEntry(permit.missingReasons, "bbb_rating", "bbb_status");
  const reason = entry?.reason ?? permit.bbbStatusReason;
  return (
    <StatusPill
      status="unavailable"
      text={bbbGapText(permit)}
      {...(reason == null ? {} : { data: { reason } })}
    />
  );
}

/** The contractor exactly as the permit prints it — unverified, never a registry identity
 *  (contract v1.1, ERR-32). When Task A published no name, the stated reason is shown (FR-003). */
function ContractorName({ permit }: { readonly permit: Provenanced<CrmPermit> }): ReactElement {
  // `!= null`, not `!== null`: until a Run 3 index is promoted the served rows are Run 2's, which
  // have no such column at all (undefined), and the drawer must not crash on them.
  if (permit.contractorNameAsPrinted != null) {
    return (
      <span data-field="contractor_name_as_printed">
        {permit.contractorNameAsPrinted} <small>(as printed, unverified)</small>
      </span>
    );
  }
  const reason = missingEntry(permit.missingReasons, "contractor_name_as_printed")?.reason;
  return (
    <span
      data-field="contractor_name_as_printed"
      {...(reason === undefined ? {} : { "data-reason": reason })}
    >
      Contractor name not published · {contractorReasonText(permit)}
    </span>
  );
}

/** "Open for": the duration, or the pill with the reason from the permit's own `missing` entry
 *  (a finaled permit reads "Not open (finaled)"); never a bare "not available". */
function OpenForValue({ permit }: { readonly permit: Provenanced<CrmPermit> }): ReactElement {
  if (permit.openDays !== null) return <>{openDurationText(permit)}</>;
  const entry = missingEntry(permit.missingReasons, "open_days");
  if (entry === undefined) return <>{openDurationText(permit)}</>;
  return (
    <MissingReason
      field={entry.field}
      reason={entry.reason as Reason}
      label={missingReasonText(entry.field, entry.reason)}
    />
  );
}

/** A permit value the row left empty, with the reason from the permit's own `missing` entry. */
function PermitMissing({
  permit,
  field,
  what,
}: {
  readonly permit: Provenanced<CrmPermit>;
  readonly field: string;
  readonly what: string;
}): ReactElement {
  const entry = missingEntry(permit.missingReasons, field);
  if (entry === undefined) return <>{what} not published (no reason recorded)</>;
  return (
    <MissingReason
      field={entry.field}
      reason={entry.reason as Reason}
      label={missingReasonText(entry.field, entry.reason)}
    />
  );
}

const PERMIT_STATUS_PILL = { open: "info", stalled: "warning", closed: "verified" } as const;

function PermitDetail({
  permit,
  property,
}: {
  readonly permit: Provenanced<CrmPermit>;
  readonly property: Provenanced<CrmProperty>;
}): ReactElement {
  const issued = formatDate(permit.issueDate);
  const finaled = formatDate(permit.finalDate);
  const work = [permit.improvementType, permit.improvementAction]
    .filter((w) => w !== "")
    .map(humanizeCode)
    .join(" · ");
  return (
    <article className={styles.permitCard} data-permit-cid={permit.permitCid}>
      <header className={styles.permitHead}>
        <span className={styles.permitNumber}>
          {permit.permitNumber ?? "Permit number not published"}
        </span>
        <StatusPill
          status={
            finaledPermitLabel(permit.statusClass, permit.finalDate) !== null
              ? PERMIT_STATUS_PILL.closed
              : permit.statusClass === "open" ||
                  permit.statusClass === "stalled" ||
                  permit.statusClass === "closed"
                ? PERMIT_STATUS_PILL[permit.statusClass]
                : "unavailable"
          }
          text={permitStatusLabel(permit.statusClass, permit.finalDate)}
          data={{ field: "status_class" }}
        />
      </header>
      <dl className={styles.permitFields}>
        <div className={styles.permitField}>
          <dt>Work</dt>
          <dd>{work === "" ? "Work type not published" : work}</dd>
        </div>
        <div className={styles.permitField}>
          <dt>Issued</dt>
          <dd data-field="issue_date">
            {issued ?? "Issue date not published"}
            {finaled === null ? " · not finaled" : ` · finaled ${finaled}`}
          </dd>
        </div>
        {finaledPermitLabel(permit.statusClass, permit.finalDate) === null ? (
          <div className={styles.permitField}>
            <dt>Open for</dt>
            <dd data-field="open_days">
              <OpenForValue permit={permit} />
            </dd>
          </div>
        ) : null}
        <div className={styles.permitField}>
          <dt>Jurisdiction</dt>
          <dd data-field="jurisdiction">
            {permit.jurisdiction ?? (
              <PermitMissing permit={permit} field="jurisdiction" what="Jurisdiction" />
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Status in the source</dt>
          <dd data-field="improvement_status">
            {permit.improvementStatus != null ? (
              permit.improvementStatus
            ) : (
              <PermitMissing permit={permit} field="improvement_status" what="Status" />
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Closed</dt>
          <dd data-field="permit_close_date">
            {permit.permitCloseDate != null ? (
              (formatDate(permit.permitCloseDate) ?? permit.permitCloseDate)
            ) : (
              <PermitMissing permit={permit} field="permit_close_date" what="Close date" />
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Final inspection</dt>
          <dd data-field="final_inspection_date">
            {permit.finalInspectionDate != null ? (
              (formatDate(permit.finalInspectionDate) ?? permit.finalInspectionDate)
            ) : (
              <PermitMissing
                permit={permit}
                field="final_inspection_date"
                what="Final inspection date"
              />
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Permit CID</dt>
          <dd data-field="permit_cid">
            <CidDisplay cid={permit.permitCid} />
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Contractor company CID</dt>
          <dd data-field="contractor_company_cid">
            {permit.contractorCompanyCid != null ? (
              <CidDisplay cid={permit.contractorCompanyCid} />
            ) : (
              <PermitMissing
                permit={permit}
                field="contractor_company_cid"
                what="Contractor company record"
              />
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Contractor, as printed on permit</dt>
          <dd>
            <ContractorName permit={permit} />{" "}
            <ContractorBadge resolution={permit.contractorResolution} />
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>BBB</dt>
          <dd>
            <BbbField permit={permit} /> <BbbLink url={permit.bbbUrl} />
          </dd>
        </div>
      </dl>
      {(permit.missingReasons ?? []).length === 0 ? null : (
        <MissingList
          groups={groupMissing(permit.missingReasons ?? []).map((group) => ({
            key: `${group.reason}|${group.reasonLabel}`,
            reason: group.reasonLabel,
            fields: group.fieldsInline,
            data: { "missing-group": group.reason, fields: group.fields.join(",") },
          }))}
        />
      )}
      <LeadCreateAction property={property} permit={permit} />
      {safeSourceHref(permit.sourceUrl) === null ? (
        <Provenance
          sourceUrl={null}
          capturedAt={permit.capturedAt}
          recordCid={permit.cid}
          runId={permit.runId}
        />
      ) : (
        <Provenance>
          Source:{" "}
          <SourceLink
            url={permit.sourceUrl}
            label={`${permitsSourceLabel(permit)} ${permit.permitNumber ?? "record"}`}
          />
          {" · collected "}
          <time dateTime={permit.capturedAt}>{formatUtc(permit.capturedAt)}</time>
          {" UTC · record "}
          <CidDisplay cid={permit.cid} />
          {` · run ${permit.runId}`}
        </Provenance>
      )}
    </article>
  );
}

/** A null roof age with its reason from the row's own `missing` entry (P0-4). */
function RoofAgeMissing({
  property,
}: {
  readonly property: Provenanced<CrmProperty>;
}): ReactElement {
  const entry = property.missingReasons.find(
    (m) => m.field === "roofAgeYears" || m.field === "roof_age_years",
  );
  if (entry === undefined) return <>Roof age not published (no reason recorded)</>;
  const gap = roofAgeGapLabel(property.propertyType, entry.reason);
  return (
    <MissingReason
      field={entry.field}
      reason={entry.reason as Reason}
      {...(gap === undefined ? {} : { label: gap })}
    />
  );
}

/** A value the row left empty, with the reason from its own `missing` entry (never blank). */
function MissingValue({
  property,
  field,
  what,
}: {
  readonly property: Provenanced<CrmProperty>;
  readonly field: string;
  readonly what: string;
}): ReactElement {
  const entry = (property.missingReasons ?? []).find((m) => m.field === field);
  if (entry === undefined) return <>{what} not published (no reason recorded)</>;
  return (
    <MissingReason
      field={entry.field}
      reason={entry.reason as Reason}
      label={missingReasonText(entry.field, entry.reason)}
    />
  );
}

/** Owner data (ADR-03, amended 2026-10-25): the name as Task A parses it from the TCAD roll,
 *  kind, tenure with how it was dated, and owner area — each with its stated reason when empty.
 *  `!= null`: until a Run 3 index is promoted, rows have no ownerName/tenureBasis column. */
function OwnerSection({
  property,
  titleId,
}: {
  readonly property: Provenanced<CrmProperty>;
  readonly titleId: string;
}): ReactElement {
  const tenure =
    property.isLongTenure === null || property.isLongTenure === undefined
      ? null
      : property.isLongTenure
        ? tenureBandLabel(true)
        : tenureBandLabel(false);
  return (
    <section className={styles.section} aria-labelledby={`${titleId}-owner`}>
      <h4 id={`${titleId}-owner`} className={styles.sectionTitle}>
        Owner
      </h4>
      <dl className={styles.permitFields}>
        <div className={styles.permitField}>
          <dt>Name</dt>
          <dd data-field="owner_name">
            {property.ownerName != null ? (
              property.ownerName
            ) : (
              <MissingValue property={property} field="owner_name" what="Owner name" />
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Kind</dt>
          <dd data-field="owner_kind">
            {property.ownerKind == null || property.ownerKind === "unknown" ? (
              <MissingValue property={property} field="owner_kind" what="Owner kind" />
            ) : (
              humanizeCode(property.ownerKind)
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Owned for</dt>
          <dd data-field="is_long_tenure">
            {tenure === null ? (
              <MissingValue property={property} field="is_long_tenure" what="Tenure" />
            ) : (
              `${tenure}${property.tenureBasis != null && property.tenureBasis !== "unknown" ? ` · from ${humanizeCode(property.tenureBasis)}` : ""}`
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Last sale</dt>
          <dd data-field="last_ownership_transfer_date">
            {property.lastSaleDate != null ? (
              (formatDate(property.lastSaleDate) ?? property.lastSaleDate)
            ) : (
              <MissingValue
                property={property}
                field="last_ownership_transfer_date"
                what="Last sale"
              />
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Tenure</dt>
          <dd data-field="tenure_years">
            {property.tenureYears != null ? (
              `${property.tenureYears} yrs`
            ) : (
              <MissingValue property={property} field="tenure_years" what="Tenure" />
            )}
          </dd>
        </div>
        <OwnerAreaRows property={property} />
        <ComingSoonRow label="Merged from" reason="No merge data in the published contract" />
      </dl>
    </section>
  );
}

/** Mailing location (state and ZIP) and Owner area, both from the owner's mailing ZIPs; one pill
 *  words the class on both rows so they cannot contradict. `unknown` and an absent class carry
 *  the row's stated reason. */
export function OwnerAreaRows({
  property,
}: {
  readonly property: Provenanced<CrmProperty>;
}): ReactElement {
  const pill = ownerAreaPill(property.ownerAreaClass);
  const mailing = mailingLocation(property);
  const areaValue =
    pill === null ? (
      <MissingValue property={property} field="owner_area_class" what="Owner area" />
    ) : (
      <StatusPill status={pill.status} text={pill.text} data={{ field: "owner_area_class" }} />
    );
  return (
    <>
      <div className={styles.permitField}>
        <dt>Mailing location</dt>
        <dd data-field="owner_mailing_location">
          {mailing === null ? (
            <MissingMailing property={property} />
          ) : (
            <>
              {mailing.text}{" "}
              {pill === null ? areaValue : <StatusPill status={pill.status} text={pill.text} />}
            </>
          )}
        </dd>
      </div>
      <div className={styles.permitField}>
        <dt>Owner area</dt>
        <dd data-field="owner_area_class">{areaValue}</dd>
      </div>
    </>
  );
}

/** No mailing state or ZIP: the reason from the row's entry for the ZIP, else the state, else the
 *  area class; an index built before v1.2 has none of them. */
function MissingMailing({
  property,
}: {
  readonly property: Provenanced<CrmProperty>;
}): ReactElement {
  const entry = missingEntry(
    property.missingReasons,
    "owner_mailing_postal_code",
    "owner_mailing_state_code",
  );
  if (entry === undefined) return <>Mailing location not published (no reason recorded)</>;
  return (
    <MissingReason
      field={entry.field}
      reason={entry.reason as Reason}
      label={missingReasonText(entry.field, entry.reason)}
    />
  );
}

/** "near {place}" with the gazetteer as its provenance on hover. The gazetteer holds centroid
 *  points only, so the drawer never claims "in {place}". */
function NearPlaceLabel({ nearPlace }: { readonly nearPlace: NearPlace }): ReactElement {
  return (
    <span
      data-field="near_place"
      title={`Nearest place centroid, ${nearPlace.distanceMi} mi away · ${nearPlace.source} · sha256 ${nearPlace.sha256}`}
    >
      {`near ${nearPlace.name}`}
    </span>
  );
}

/** No coordinates → no place, and the row's own `missing` reason says why (P0-4). */
function NearPlaceMissing({
  property,
}: {
  readonly property: Provenanced<CrmProperty>;
}): ReactElement {
  const entry = property.missingReasons.find((m) =>
    ["latitude", "longitude", "lat_lon"].includes(m.field),
  );
  const reason = missingReasonText(entry?.field ?? "lat_lon", entry?.reason ?? "no_coordinates");
  return (
    <span className={styles.titleSub} data-field="near_place">
      {`Nearest place not shown · ${reason}`}
    </span>
  );
}

/** One line when the property has no coordinates: it cannot be centred on the map, so the map is
 *  left alone (the same missing-data wording as the nearest place). */
function MapPositionMissing({
  property,
}: {
  readonly property: Provenanced<CrmProperty>;
}): ReactElement {
  const entry = property.missingReasons.find((m) =>
    ["latitude", "longitude", "lat_lon"].includes(m.field),
  );
  const reason = missingReasonText(entry?.field ?? "lat_lon", entry?.reason ?? "no_coordinates");
  return (
    <span className={styles.titleSub} data-field="map_position">
      {`Not shown on the map · ${reason}`}
    </span>
  );
}

/** Drawer header: the street address as the title, then "TCAD {id} · near {place}" and the
 *  coordinates. A row without an address keeps the TCAD id as the title and states why. */
function DrawerTitle({
  property,
  nearPlace,
}: {
  readonly property: Provenanced<CrmProperty>;
  readonly nearPlace: NearPlace | undefined;
}): ReactElement {
  const hasCoords = property.latitude !== null && property.longitude !== null;
  const hasAddress = streetAddress(property) !== null;
  const coords = hasCoords
    ? `${(property.latitude ?? 0).toFixed(5)}, ${(property.longitude ?? 0).toFixed(5)}`
    : null;
  return (
    <span className={styles.titleStack}>
      {hasAddress ? (
        <>
          <span>{propertyTitle(property)}</span>
          <span className={styles.titleSub}>
            {`TCAD ${property.requestIdentifier}`}
            {nearPlace === undefined ? null : (
              <>
                {" · "}
                <NearPlaceLabel nearPlace={nearPlace} />
              </>
            )}
          </span>
        </>
      ) : (
        <>
          <span>
            {propertyTitle(property)}
            {nearPlace === undefined ? null : (
              <>
                {" · "}
                <NearPlaceLabel nearPlace={nearPlace} />
              </>
            )}
          </span>
          <span className={styles.titleSub}>
            {coords === null
              ? propertySubtitle(property)
              : `${propertySubtitle(property)} · ${coords}`}
          </span>
        </>
      )}
      {hasAddress && coords !== null ? <span className={styles.titleSub}>{coords}</span> : null}
      {hasCoords ? null : (
        <>
          <NearPlaceMissing property={property} />
          <MapPositionMissing property={property} />
        </>
      )}
    </span>
  );
}

/** Every other value the property row carries, so nothing has to be opened elsewhere: the property
 *  CID, the structure form and raw usage type, the year built, where the coordinates came from, the
 *  out-of-area flag, and when the record was collected in which run. A value the row lacks shows its
 *  stated reason. `leadKey`-style internals and the manifest CID (the Verify link in "Why this is a
 *  lead" checks it) stay out. */
function RecordSection({
  property,
  titleId,
}: {
  readonly property: Provenanced<CrmProperty>;
  readonly titleId: string;
}): ReactElement {
  const coordEntry = property.missingReasons.find((m) =>
    ["latitude", "longitude", "lat_lon"].includes(m.field),
  );
  const hasCoords = property.latitude !== null && property.longitude !== null;
  return (
    <section className={styles.section} aria-labelledby={`${titleId}-record`} data-drawer-record="">
      <h4 id={`${titleId}-record`} className={styles.sectionTitle}>
        Property record
      </h4>
      <dl className={styles.permitFields}>
        <div className={styles.permitField}>
          <dt>Property CID</dt>
          <dd data-field="property_cid">
            <CidDisplay cid={property.propertyCid} />
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>TCAD account</dt>
          <dd data-field="request_identifier">{property.requestIdentifier}</dd>
        </div>
        <div className={styles.permitField}>
          <dt>Structure form</dt>
          <dd data-field="property_type">
            {property.propertyType != null ? (
              humanizeCode(property.propertyType)
            ) : (
              <MissingValue property={property} field="property_type" what="Structure form" />
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Usage type</dt>
          <dd data-field="property_usage_type">
            {property.propertyUsageType != null ? (
              humanizeCode(property.propertyUsageType)
            ) : (
              <MissingValue property={property} field="property_usage_type" what="Usage type" />
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Year built</dt>
          <dd data-field="structure_built_year">
            {property.structureBuiltYear != null ? (
              String(property.structureBuiltYear)
            ) : (
              <MissingValue property={property} field="structure_built_year" what="Year built" />
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Coordinates</dt>
          <dd data-field="lat_lon">
            {hasCoords
              ? `${(property.latitude ?? 0).toFixed(5)}, ${(property.longitude ?? 0).toFixed(5)} · ${coordinateSourceLabel(property.coordinateSource)}`
              : `${coordinateSourceLabel("none")} · ${missingReasonText(
                  coordEntry?.field ?? "lat_lon",
                  coordEntry?.reason ?? "no_coordinates",
                )}`}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Out-of-area owner</dt>
          <dd data-field="owner_is_out_of_area">
            {property.ownerIsOutOfArea == null ? (
              <MissingValue
                property={property}
                field="owner_is_out_of_area"
                what="Out-of-area owner"
              />
            ) : property.ownerIsOutOfArea ? (
              "Yes"
            ) : (
              "No"
            )}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Collected</dt>
          <dd data-field="captured_at">
            <time dateTime={property.capturedAt}>{formatUtc(property.capturedAt)}</time>
            {" UTC · "}
            {runLabel(property.runId)}
            {` (${property.runId})`}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Record CID</dt>
          <dd data-field="record_cid">
            <CidDisplay cid={property.cid} />
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Source record</dt>
          <dd data-field="source_url">
            {safeSourceHref(property.sourceUrl) === null ? (
              "No source link published"
            ) : (
              <SourceLink url={property.sourceUrl} label="TCAD record" />
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Where each value came from: source, capture date, run and CID, one row per field (CRM-HANDOFF
 *  §4.3: the drawer's collapsed "Lineage · Metadata"). Read from the rows; nothing is added. */
function MetadataSection({
  property,
  permits,
  titleId,
}: {
  readonly property: Provenanced<CrmProperty>;
  readonly permits: readonly Provenanced<CrmPermit>[];
  readonly titleId: string;
}): ReactElement {
  const permit = permits[0];
  const run = runLabel(property.runId);
  const captured = (iso: string): string => formatDate(iso) ?? iso;
  const permitAt = permit === undefined ? "" : captured(permit.capturedAt);
  const permitRun = permit === undefined ? "" : runLabel(permit.runId);
  const rows: {
    field: string;
    label?: string;
    source: string;
    at: string;
    run: string;
    cid: string;
  }[] = [
    {
      field: "roof_age_years",
      source:
        property.roofAgeBasis === "permit"
          ? `${permitsSourceLabel(permit)} + TCAD`
          : SOURCE_PARCELS_LABEL,
      at: captured(property.capturedAt),
      run,
      cid: property.cid,
    },
    {
      field: "owner_kind, owner_name, tenure",
      source: "TCAD owners and deeds",
      at: captured(property.capturedAt),
      run,
      cid: property.cid,
    },
    {
      field: "lat, lon",
      source: coordinateSourceLabel(property.coordinateSource),
      at: captured(property.capturedAt),
      run,
      cid: property.cid,
    },
    ...(permit === undefined
      ? []
      : [
          // The three rows below read the first permit only, and say so.
          {
            field: "permits",
            label: "permits (first permit)",
            source: permitsSourceLabel(permit),
            at: permitAt,
            run: permitRun,
            cid: permit.cid,
          },
          {
            field: "contractor",
            label: "contractor (first permit)",
            source: permitsSourceLabel(permit),
            at: permitAt,
            run: permitRun,
            cid: permit.cid,
          },
          {
            // BBB is never contacted; the status is Task A's, carried on the permit row.
            field: "bbb_status",
            label: "bbb_status (first permit)",
            source: BBB_SOURCE_LABEL,
            at: permitAt,
            run: permitRun,
            cid: permit.cid,
          },
        ]),
  ];
  return (
    <details className={styles.section} data-lineage-metadata="">
      <summary className={styles.sectionTitle} id={`${titleId}-metadata`}>
        Lineage · Metadata
      </summary>
      <ul className={styles.metaList} aria-labelledby={`${titleId}-metadata`}>
        {rows.map((row) => (
          <li key={row.field} className={styles.metaRow} data-meta-field={row.field}>
            <code>{row.label ?? row.field}</code>
            <span>{`${row.source} · ${row.at} · ${row.run} · `}</span>
            <CidDisplay cid={row.cid} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The drawer for a `sel` that names no property in the data run being served: a CID the run does
 *  not hold (`property.get` answers with a null property) or an id that is not a property id at all
 *  (`property.get` answers 400). Either way the rep is told why nothing opened and how to go on. */
export const PropertyNotInRun = forwardRef<
  HTMLElement,
  {
    readonly onClose: () => void;
    /** "unavailable": the lookup itself failed (not that the property is missing). */
    readonly reason?: "not-in-run" | "unavailable";
    readonly onRetry?: () => void;
  }
>(function PropertyNotInRun({ onClose, reason = "not-in-run", onRetry }, ref) {
  const titleId = useId();
  const unavailable = reason === "unavailable";
  return (
    <aside
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={styles.drawer}
      data-testid={unavailable ? "property-unavailable" : "not-in-run"}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <header className={styles.drawerHead}>
        <h3 id={titleId} className={styles.drawerTitle}>
          {unavailable ? "Property details unavailable" : "Property not in this run"}
        </h3>
        <IconButton icon="close" label="Close" onClick={onClose} />
      </header>
      <p className={styles.drawerNote}>
        {unavailable
          ? "The lead index didn’t answer, so this property could not be opened. Your leads and notes still open."
          : "This link names a property that is not in the data run being served, so there is nothing to show. The link may be from an older run, or the property id may be mistyped. Close this panel to go back to the map."}
      </p>
      {unavailable && onRetry !== undefined ? (
        <button type="button" className={styles.drawerRetry} onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </aside>
  );
});

export function PropertyDetail({
  data,
  onClose,
  onSelectProperty,
  center,
  radiusMi,
  centreLabel,
  countyLensUrl,
}: PropertyDetailProps): ReactElement {
  const [searchParams] = useSearchParams();
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const propertyCid = data.property?.propertyCid ?? null;
  useEffect(() => {
    ref.current?.focus();
  }, [propertyCid]);

  if (data.property === null) {
    return <PropertyNotInRun onClose={onClose} ref={ref} />;
  }

  const { property } = data;
  const askSearch = patchMapMode(searchParams, {
    mode: "ai",
    q: `Tell me about TCAD ${property.requestIdentifier}`,
  }).toString();
  return (
    <aside
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={styles.drawer}
      data-property-cid={property.propertyCid}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <header className={styles.drawerHead}>
        <h3 id={titleId} className={styles.drawerTitle}>
          <DrawerTitle property={property} nearPlace={data.nearPlace} />
        </h3>
        <IconButton icon="close" label="Close" onClick={onClose} />
      </header>
      <div className={styles.pills}>
        <TypePill usageType={property.propertyUsageType} missing={property.missingReasons} />
      </div>
      <div className={styles.primaryAction}>
        <LeadCreateAction property={property} permits={data.permits} />
        <div className={styles.linkRow}>
          {data.lineageUrl === null ? (
            <span className={styles.link} data-lineage-link="" aria-disabled="true">
              Lineage in Explorer: not available yet
            </span>
          ) : (
            <a
              href={data.lineageUrl}
              className={styles.link}
              target="_blank"
              rel="noopener noreferrer"
              data-lineage-link=""
            >
              View lineage in Explorer
            </a>
          )}
          <Link
            to={{ search: askSearch }}
            state={ASK_NOW_STATE}
            className={styles.link}
            data-ask-about=""
          >
            Ask about it
          </Link>
        </div>
      </div>

      <section className={styles.section} aria-labelledby={`${titleId}-why`} data-drawer-why="">
        <h4 id={`${titleId}-why`} className={styles.sectionTitle}>
          Why this is a lead
        </h4>
        <WhyBody
          property={property}
          permits={data.permits}
          center={center}
          radiusMi={radiusMi}
          centreLabel={centreLabel}
          countyLensUrl={countyLensUrl}
        />
      </section>

      <section className={styles.section} aria-labelledby={`${titleId}-roof`}>
        <h4 id={`${titleId}-roof`} className={styles.sectionTitle}>
          Roof
        </h4>
        <dl className={styles.permitFields}>
          <div className={styles.permitField}>
            <dt>Roof age</dt>
            <dd data-field="roof_age_years">
              {property.roofAgeYears === null ? (
                <RoofAgeMissing property={property} />
              ) : (
                roofAgeText(property.roofAgeYears, property.roofAgeBasis)
              )}
            </dd>
          </div>
          <div className={styles.permitField}>
            <dt>Basis</dt>
            <dd data-field="roof_age_basis">
              {property.roofAgeBasis === "built_year" && property.structureBuiltYear != null
                ? `Year built ${String(property.structureBuiltYear)} (no reroof permit found)`
                : roofAgeBasisLabel(property.roofAgeBasis)}
            </dd>
          </div>
          <div className={styles.permitField}>
            <dt>Confidence</dt>
            <dd data-field="roof_age_confidence">
              {roofAgeConfidenceLabel(property.roofAgeConfidence)}
            </dd>
          </div>
          <ComingSoonRow label="Street View" reason="No imagery in the published data" />
        </dl>
        {property.roofAgeYears === null ? null : <RoofEvidence property={property} />}
        {property.roofAgeBasis === "built_year" && hasUnfinaledRoofPermit(data.permits) ? (
          <p className={styles.titleSub} data-reroof-note="">
            A roofing permit exists but was never finaled, so it is not counted as a reroof. Roof
            age is estimated from year built.
          </p>
        ) : null}
      </section>

      <OwnerSection property={property} titleId={titleId} />

      <RecordSection property={property} titleId={titleId} />

      <section className={styles.section} aria-labelledby={`${titleId}-permits`}>
        <h4 id={`${titleId}-permits`} className={styles.sectionTitle}>
          {`Permits · ${data.permits.length} roofing`}
        </h4>
        {data.permits.length === 0 ? (
          <p className={styles.empty}>No roofing permits on this property.</p>
        ) : (
          <div className={styles.permitList}>
            {data.permits.map((permit) => (
              <PermitDetail key={permit.permitCid} permit={permit} property={property} />
            ))}
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby={`${titleId}-missing`}>
        <h4 id={`${titleId}-missing`} className={styles.sectionTitle}>
          Not published
        </h4>
        {property.missingReasons.length === 0 ? (
          <p className={styles.empty}>Every field of this property is published in this run.</p>
        ) : (
          <MissingSummary row={property} />
        )}
      </section>
      <SimilarProperties
        propertyCid={property.propertyCid}
        titleId={titleId}
        onSelectProperty={onSelectProperty}
      />
      <MetadataSection property={property} permits={data.permits} titleId={titleId} />
      <RowProvenance row={property} />
    </aside>
  );
}
