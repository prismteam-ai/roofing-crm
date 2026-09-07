import "server-only";
import { createLeadsFromParcels } from "@/lib/services/leads";
import { searchKnowledge } from "@/lib/db/knowledge";
import { mcp } from "@/lib/mcp/client";
import { createAgentTools } from "./tools";

/**
 * Production wiring of the agent tools (real MCP client, Postgres knowledge index, CRM).
 *
 * @module agent/runtime
 */
export function productionAgentTools() {
  return createAgentTools({
    mcp,
    knowledge: (q, limit) => searchKnowledge(q, limit),
    createLeads: async (parcelIds, thresholds) => {
      const r = await createLeadsFromParcels(parcelIds, mcp, thresholds);
      const pick = (l: { id: number; parcelId: string; address: string }) => ({
        id: l.id,
        parcelId: l.parcelId,
        address: l.address,
      });
      return { created: r.created.map(pick), existing: r.existing.map(pick), unknown: r.unknown };
    },
  });
}
