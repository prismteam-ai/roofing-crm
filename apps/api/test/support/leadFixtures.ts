import type { NewLeadRecord } from "../../src/adapters/leadRepo.js";

export const KEY = "48453:tcad:0208011301";

export function newLead(overrides: Partial<NewLeadRecord> = {}): NewLeadRecord {
  return {
    leadKey: KEY,
    leadId: "01JTESTLEAD0000000000000A",
    address: "123 Test St, Austin, TX",
    lat: 30.27,
    lon: -97.74,
    assignee: "rep-1",
    createdFrom: "map",
    sourceManifestCid: "bafyManifestRun1",
    createdAt: "2026-10-24T10:00:00.000Z",
    signals: { roofAgeYears: 22, roofAgeBasis: "built_year", openPermitId: "BP-1", openDays: 2000 },
    ...overrides,
  };
}
