import "server-only";
import { createLeads, type CreateLeadsResult } from "@/lib/db/leads";
import { creationSummary, toLeadPermits, toNewLead } from "@/lib/leads/mappers";
import type { McpDataSource } from "@/lib/mcp/types";
import { mcp } from "@/lib/mcp/client";
import { DEFAULT_THRESHOLDS, getPropertiesWithPermits, type SignalThresholds } from "./search";

/**
 * Lead creation orchestration: fetch parcels + permits over MCP, map, persist.
 *
 * @module services/leads
 */

/**
 * Create CRM leads for the given parcel ids. Unknown parcels are reported back. Pass the
 * thresholds the user searched with so the stored signal/priority match what the list showed.
 */
export async function createLeadsFromParcels(
  parcelIds: readonly string[],
  source: McpDataSource = mcp,
  thresholds: SignalThresholds = DEFAULT_THRESHOLDS,
): Promise<CreateLeadsResult & { unknown: string[] }> {
  const found = await getPropertiesWithPermits(parcelIds, source, thresholds);
  const foundIds = new Set(
    found.flatMap((f) => [f.property.parcelId, f.property.parcelNumber ?? ""]),
  );
  const unknown = parcelIds.filter((id) => !foundIds.has(id));
  const inputs = found.map(({ property, permits }) => {
    const lead = toNewLead(property);
    return {
      lead,
      permits: toLeadPermits(0, permits).map((row) => {
        const { leadId, ...rest } = row;
        void leadId;
        return rest;
      }),
      summary: creationSummary(property, permits.length),
    };
  });
  const result = await createLeads(inputs);
  return { ...result, unknown };
}
