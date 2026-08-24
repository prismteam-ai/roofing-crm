import { describe, expect, it } from "vitest";

import { parseCountyCatalogKey, type LeadRecord } from "@roofing-crm-challenge/shared";

import {
  buildLeadMarkerStateByPropertyId,
  resolvePlatRoofMarkerLeadState,
} from "./plat-roof-marker-lead-state";

const BASE_LEAD: LeadRecord = {
  leadId: "01LEAD",
  propertyId: "lee-prop-301",
  parcelIdentifier: "301",
  countyKey: parseCountyCatalogKey("lee"),
  municipalityName: null,
  gisMuni: null,
  addressSnapshot: "789 Cypress Rd",
  builtYear: 1988,
  roofAgeBasis: "structure_year_built",
  structureAgeYears: null,
  openPermitIds: [],
  maxOpenPermitYears: null,
  contractorName: null,
  bbbRating: null,
  provenanceTier: "sourced",
  leadScore: 0,
  status: "new",
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("plat roof marker lead state", () => {
  it("marks active leads and archived roofs separately from prospects", () => {
    const activeLeadRecords = [BASE_LEAD];
    const archivedLeadRecords = [
      { ...BASE_LEAD, leadId: "01ARCH", propertyId: "lee-prop-archived" },
    ];

    expect(
      resolvePlatRoofMarkerLeadState({
        propertyId: "lee-prop-301",
        activeLeadRecords,
        archivedLeadRecords,
      }),
    ).toBe("lead");
    expect(
      resolvePlatRoofMarkerLeadState({
        propertyId: "lee-prop-archived",
        activeLeadRecords,
        archivedLeadRecords,
      }),
    ).toBe("archived");
    expect(
      resolvePlatRoofMarkerLeadState({
        propertyId: "lee-prop-open",
        activeLeadRecords,
        archivedLeadRecords,
      }),
    ).toBe("prospect");
  });

  it("prefers active lead styling when both records exist for one property", () => {
    const leadMarkerStateByPropertyId = buildLeadMarkerStateByPropertyId({
      activeLeadRecords: [BASE_LEAD],
      archivedLeadRecords: [BASE_LEAD],
    });

    expect(leadMarkerStateByPropertyId["lee-prop-301"]).toBe("lead");
  });
});
