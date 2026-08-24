/**
 * SQL helpers for Elephant MCP `queryPermits` over the flat permits view.
 *
 * Chester demo Parquet adds contractor_name / source_system; real Chester and
 * other counties do not — SELECT must stay dataset-aware.
 */
import { isChesterDemoCountyKey } from "./classify-chester-permit.js";
import { escapeDuckDbStringLiteral } from "./query-properties-in-bounding-box.js";

const BASE_PERMIT_SELECT_COLUMNS =
  "permit_number, improvement_type, improvement_status, permit_issue_date, opened_date, permit_close_date, description, project_description";

const DEMO_PERMIT_SELECT_COLUMNS = `${BASE_PERMIT_SELECT_COLUMNS}, contractor_name, source_system`;

/**
 * SELECT for one property's permit rows (property_id match, parcel fallback).
 */
export function buildQueryPermitsSqlForProperty(arguments_: {
  propertyId: string;
  parcelIdentifier: string | null;
  county?: string;
}): string {
  const selectColumns = isChesterDemoCountyKey(arguments_.county ?? "")
    ? DEMO_PERMIT_SELECT_COLUMNS
    : BASE_PERMIT_SELECT_COLUMNS;
  const propertyIdLiteral = escapeDuckDbStringLiteral(arguments_.propertyId);
  const parcelIdentifier = arguments_.parcelIdentifier?.trim();
  if (parcelIdentifier !== undefined && parcelIdentifier.length > 0) {
    const parcelLiteral = escapeDuckDbStringLiteral(parcelIdentifier);
    return [
      `SELECT ${selectColumns}`,
      "FROM permits",
      `WHERE property_id = '${propertyIdLiteral}' OR parcel_identifier = '${parcelLiteral}'`,
      "ORDER BY permit_issue_date DESC NULLS LAST, permit_number",
      "LIMIT 50",
    ].join(" ");
  }

  return [
    `SELECT ${selectColumns}`,
    "FROM permits",
    `WHERE property_id = '${propertyIdLiteral}'`,
    "ORDER BY permit_issue_date DESC NULLS LAST, permit_number",
    "LIMIT 50",
  ].join(" ");
}
