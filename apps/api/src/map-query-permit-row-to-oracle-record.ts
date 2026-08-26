/**
 * Maps flat `queryPermits` view rows into consolidated permit record shape.
 */
import {
  classifyChesterPermit,
  isChesterCountyKey,
  type ChesterPermitProvenanceClass,
} from "./classify-chester-permit.js";
import type { OraclePropertyPermitRecord } from "./routers/properties.js";

/**
 * One row from the DuckDB permits view (snake_case columns).
 */
export interface QueryPermitViewRow {
  permit_number?: string | null;
  improvement_type?: string | null;
  improvement_status?: string | null;
  permit_issue_date?: string | null;
  opened_date?: string | null;
  permit_close_date?: string | null;
  description?: string | null;
  project_description?: string | null;
  contractor_name?: string | null;
  source_system?: string | null;
}

/**
 * Maps a queryPermits row into the oracle permit record contract.
 */
export function mapQueryPermitViewRowToOraclePropertyPermitRecord(
  row: QueryPermitViewRow,
  options?: { county?: string },
): OraclePropertyPermitRecord {
  const county = options?.county ?? "";
  const permitNumber = row.permit_number ?? null;
  const improvementType = row.improvement_type ?? null;
  let provenanceClass: ChesterPermitProvenanceClass | undefined;
  if (isChesterCountyKey(county)) {
    provenanceClass = classifyChesterPermit({
      improvementType,
      sourceSystem: row.source_system,
      permitId: permitNumber,
    });
  }

  return {
    permitNumber,
    permitType: improvementType,
    status: row.improvement_status ?? null,
    issuedDate: row.permit_issue_date ?? null,
    openedDate: row.opened_date ?? null,
    closedDate: row.permit_close_date ?? null,
    description: row.description ?? row.project_description ?? null,
    contractor: row.contractor_name ?? null,
    sourceSystem: row.source_system ?? null,
    provenanceClass,
  };
}

/**
 * Parses queryPermits MCP payload rows.
 */
export function parseQueryPermitViewRows(payload: unknown): QueryPermitViewRow[] {
  if (Array.isArray(payload)) {
    return payload as QueryPermitViewRow[];
  }
  if (payload !== null && typeof payload === "object") {
    const rows = (payload as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows as QueryPermitViewRow[];
    }
  }
  return [];
}
