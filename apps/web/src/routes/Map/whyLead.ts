// "Why is this a lead?" (CRM-HANDOFF §4.3, boards Explore1440 `whyView`): every rule the property
// meets, its value, the source, the run and the CID. Only conditions the row really meets are
// listed, and every value is read from the row (never recomputed or invented); a signal the data
// does not carry is left out rather than shown as met.
import type { LatLng } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { isLivePermit, mainLeadPermit } from "@crm/shared";
import {
  SOURCE_PARCELS_LABEL,
  coordinateSourceLabel,
  humanizeCode,
  openDurationText,
  permitsSourceLabel,
  roofAgeConfidenceLabel,
  tenureBandLabel,
  SOURCE_PERMITS_LABEL,
} from "../../format/index.js";
import { bbbHref } from "./BbbLink.js";
import { safeSourceHref } from "./SourceLink.js";
import { directionLabel, distanceFromCentre } from "./resultsView.js";

export interface WhyRule {
  readonly key: string;
  readonly rule: string;
  readonly value: string;
  /** "TCAD parcels · Run 3" */
  readonly source: string;
  readonly cid: string;
  /** An outbound link that belongs to the rule (the contractor's BBB search). */
  readonly link?: { readonly label: string; readonly href: string };
}

export interface WhyCoordinates {
  readonly text: string;
  readonly source: string;
  readonly direction: string | null;
  readonly osmUrl: string;
  /** The TCAD source record Task A published (https only); null when absent or not https. */
  readonly sourceUrl: string | null;
}

export interface WhyLead {
  readonly rules: readonly WhyRule[];
  readonly coordinates: WhyCoordinates | null;
}

/** `travis-full-run3-20261025` → `Run 3`, `travis-full-run3-1-20261025` → `Run 3.1`; any other run id
 *  is shown as it is. */
export function runLabel(runId: string): string {
  const match = /run(\d+)(?:-(\d{1,2})(?=-))?/i.exec(runId);
  if (match?.[1] === undefined) return runId;
  return match[2] === undefined ? `Run ${match[1]}` : `Run ${match[1]}.${match[2]}`;
}

/** Where a roof age came from: the permit that dated it, or the TCAD parcel record (year built). */
export function roofSourceLabel(property: Pick<CrmProperty, "roofAgeBasis">): string {
  return property.roofAgeBasis === "permit" ? SOURCE_PERMITS_LABEL : SOURCE_PARCELS_LABEL;
}

/** A roofing permit (any roofing permit, not only a reroof) that is still live: open or stalled with no final date.
 *  It is not counted as a reroof, so a roof age based on year built may be older than the roof
 *  really is. A closed permit with no final date is not live (the contract's `status_class` is the
 *  one source of "open", ASM-3), and neither is one with no status. Own permits only. */
export function hasUnfinaledRoofPermit(
  permits:
    | readonly (Pick<CrmPermit, "statusClass"> & Partial<Pick<CrmPermit, "finalDate">>)[]
    | undefined,
): boolean {
  return (permits ?? []).some(isLivePermit);
}

/** The open or stalled permit open longest: the lead's main signal (the shared rule). */
export function mainPermitOf(
  permits: readonly Provenanced<CrmPermit>[] | undefined,
): Provenanced<CrmPermit> | null {
  return mainLeadPermit(permits);
}

export interface WhyInput {
  readonly property: Provenanced<CrmProperty>;
  readonly permits?: readonly Provenanced<CrmPermit>[] | undefined;
  readonly center?: LatLng | undefined;
  readonly radiusMi?: number | undefined;
  /** "the pin", "you" or a place name. */
  readonly centreLabel?: string | undefined;
}

export function whyLead({ property, permits, center, radiusMi, centreLabel }: WhyInput): WhyLead {
  const run = runLabel(property.runId);
  const rules: WhyRule[] = [];

  const from =
    center === undefined ? null : distanceFromCentre(center, property.latitude, property.longitude);
  if (center !== undefined && from !== null && radiusMi !== undefined) {
    rules.push({
      key: "distance",
      rule: `Within ${String(radiusMi)} mi of ${centreLabel ?? "the search centre"}`,
      value: `${from.miles.toFixed(1)} mi from the search centre to the property's coordinates`,
      source: `${coordinateSourceLabel(property.coordinateSource)} · ${run}`,
      cid: property.cid,
    });
  }

  if (property.roofAgeYears !== null) {
    const estimated =
      property.roofAgeBasis === "built_year" || property.roofAgeBasis === "new_construction";
    rules.push({
      key: "roof",
      rule: `Roof age ${String(property.roofAgeYears)} yrs`,
      value: `${humanizeCode(property.roofAgeBasis)}${estimated ? " (estimated from year built)" : ""}${property.roofAgeBasis === "built_year" && property.structureBuiltYear != null ? ` · Year built ${String(property.structureBuiltYear)}` : ""} · ${roofAgeConfidenceLabel(property.roofAgeConfidence).toLowerCase()} confidence`,
      source: `${roofSourceLabel(property)} · ${run}`,
      cid: property.cid,
    });
  }

  const main = mainPermitOf(permits);
  if (main !== null) {
    const contractor =
      main.contractorNameAsPrinted != null
        ? `contractor “${main.contractorNameAsPrinted}” as printed on the permit, unverified`
        : "no contractor printed on the permit";
    rules.push({
      key: "permit",
      rule: `Roofing permit ${main.statusClass ?? "open"}${main.statusClass === "stalled" ? " · derived: no status in source" : ""}`,
      value: `${openDurationText(main)} · ${contractor}`,
      source: `${permitsSourceLabel(main)} · ${runLabel(main.runId)}`,
      cid: main.cid,
      ...(bbbHref(main.bbbUrl) === null
        ? {}
        : {
            link: { label: "Search BBB for this contractor", href: bbbHref(main.bbbUrl) as string },
          }),
    });
  }

  if (property.ownerKind != null && property.ownerKind !== "unknown") {
    const tenure =
      property.isLongTenure == null
        ? null
        : `owned ${tenureBandLabel(property.isLongTenure).toLowerCase()}`;
    const basis =
      property.tenureBasis != null && property.tenureBasis !== "unknown"
        ? ` (from ${humanizeCode(property.tenureBasis).toLowerCase()})`
        : "";
    rules.push({
      key: "owner",
      rule: "Owner",
      value: `${humanizeCode(property.ownerKind)} owner${tenure === null ? "" : ` · ${tenure}${basis}`}`,
      source: `TCAD owners · ${run}`,
      cid: property.cid,
    });
  }

  const { latitude, longitude } = property;
  const coordinates: WhyCoordinates | null =
    latitude === null || longitude === null
      ? null
      : {
          text: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          source: `${coordinateSourceLabel(property.coordinateSource)} · ${run}`,
          direction: from === null ? null : directionLabel(from),
          osmUrl: `https://www.openstreetmap.org/?mlat=${latitude.toFixed(5)}&mlon=${longitude.toFixed(5)}#map=18/${latitude.toFixed(5)}/${longitude.toFixed(5)}`,
          sourceUrl: safeSourceHref(property.sourceUrl),
        };

  return { rules, coordinates };
}
