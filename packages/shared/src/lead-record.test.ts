import { describe, expect, it } from "vitest";
import { parseCountyCatalogKey } from "./county-catalog-key.js";
import type { LeadRecord } from "./lead-record.js";

describe("LeadRecord", () => {
  it("uses full domain field names for a snapshot", () => {
    // Given a new outreach snapshot for a published Lee parcel
    // When a LeadRecord is constructed
    // Then countyKey and roofAgeBasis use the shared domain names (not short aliases)
    const leadRecord: LeadRecord = {
      leadId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      propertyId: "prop-1",
      parcelIdentifier: "folio-1",
      countyKey: parseCountyCatalogKey("lee"),
      municipalityName: null,
      gisMuni: null,
      addressSnapshot: "123 Main St",
      builtYear: 1980,
      roofAgeBasis: "structure_year_built",
      structureAgeYears: 46,
      openPermitIds: [],
      maxOpenPermitYears: null,
      contractorName: null,
      bbbRating: null,
      provenanceTier: "sourced",
      leadScore: 0,
      status: "new",
      notes: "",
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    };

    expect(leadRecord.countyKey).toBe("lee");
    expect(leadRecord.roofAgeBasis).toBe("structure_year_built");
    expect(leadRecord.status).toBe("new");
  });
});
