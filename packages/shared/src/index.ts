/**
 * Shared domain types for the map CRM (county catalog keys, leads, coverage).
 *
 * Import from `@roofing-crm-challenge/shared` in apps/api and apps/web so both
 * sides use the same CountyCatalogKey and LeadRecord names.
 */

export { parseCountyCatalogKey, type CountyCatalogKey } from "./county-catalog-key.js";

export { LEAD_STATUSES, isLeadStatus, type LeadStatus } from "./lead-status.js";

export type { LeadRecord, RoofAgeBasis } from "./lead-record.js";

export type { CoverageMode } from "./coverage-mode.js";

export { haversineDistanceMiles } from "./haversine-distance-miles.js";

export {
  parseCalendarYearFromDateString,
  resolvePropertyPermitOpenYears,
} from "./property-permit-open-years.js";

export {
  resolveLeadProvenanceTier,
  scoreLead,
  type LeadProvenanceTier,
  type ScoreLeadInput,
} from "./score-lead.js";
