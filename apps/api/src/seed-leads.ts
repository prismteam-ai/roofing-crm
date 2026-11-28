import type { LeadInput } from "@crm/leads-db";
import type { OracleData } from "@crm/oracle-data";
import { leadInputFor } from "./snapshot.ts";

/**
 * Demo leads every new workspace starts with: real Fort Lauderdale properties of the pinned run
 * (run 2) with a roofing permit open more than eight years and a roof over 60 years old.
 */
export const SEED_PROPERTY_IDS = ["504202150320", "504207080920", "504209130540"];

export async function seedLeads(oracle: OracleData, ids: string[] = SEED_PROPERTY_IDS): Promise<LeadInput[]> {
  const out: LeadInput[] = [];
  for (const id of ids) {
    // A property the pinned run lacks is skipped, not invented.
    const input = await leadInputFor(oracle, id).catch(() => null);
    if (input) out.push(input);
  }
  return out;
}
