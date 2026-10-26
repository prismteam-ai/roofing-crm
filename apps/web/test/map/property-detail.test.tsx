// PropertyDetail drawer (CrmProperty390/768/1440, CrmPropertyNoAddress*): the header, Create lead
// near the top, and every value formatted (dates, enum codes, field names never shown raw), with
// provenance kept visible.
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";

vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useCreateLead: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
  useLeadPresence: () => ({ isPending: false, data: null }),
  usePrefetchLeadsList: () => () => Promise.resolve(),
}));

import {
  PropertyDetail,
  type PropertyDetailData,
} from "../../src/routes/Map/PropertyDetail/PropertyDetail";

afterEach(cleanup);

const property = {
  propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
  requestIdentifier: "192820",
  latitude: 30.2655,
  longitude: -97.743,
  coordinateSource: "gis_centroid",
  propertyType: "Building",
  propertyUsageType: null,
  roofAgeYears: 41,
  roofAgeBasis: "built_year",
  roofAgeConfidence: "low",
  isLongTenure: null,
  ownerKind: null,
  ownerAreaClass: null,
  ownerIsOutOfArea: null,
  sourceManifestCid: "bafkreimanifest",
  missingReasons: [
    { field: "unnormalized_address", reason: "not_in_export" },
    { field: "city_name", reason: "not_in_export" },
  ],
  capturedAt: "2026-10-21T10:40:04Z",
  cid: "bafkreitablecid",
  runId: "travis-202609-permits-20261021t103516z",
} as unknown as Provenanced<CrmProperty>;

const permit = {
  propertyCid: property.propertyCid,
  permitCid: "bafkreipermitaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  jurisdiction: "Austin",
  permitNumber: "2026-115882 BP",
  improvementType: "Roofing",
  improvementAction: "Replace",
  improvementStatus: "open",
  statusClass: "open",
  issueDate: "2026-09-04T00:00:00.000Z",
  finalDate: null,
  permitCloseDate: null,
  finalInspectionDate: null,
  openDays: 47,
  contractorResolution: "unresolved",
  contractorCompanyCid: null,
  sourceManifestCid: "bafkreimanifest",
  missingReasons: [],
  capturedAt: "2026-10-21T10:35:59Z",
  cid: "bafkreipermittablecid",
  runId: "travis-202609-permits-20261021t103516z",
} as unknown as Provenanced<CrmPermit>;

const data: PropertyDetailData = {
  property,
  permits: [permit],
  bbbStatus: null,
  bbbStatusReason: null,
  lineageUrl: "https://example.com/lineage",
};

function renderDrawer(d: PropertyDetailData = data): HTMLElement {
  render(
    <MemoryRouter>
      <PropertyDetail data={d} onClose={() => undefined} />
    </MemoryRouter>,
  );
  return screen.getByRole("dialog");
}

describe("PropertyDetail drawer", () => {
  it("keeps the e2e hooks: an aside dialog carrying the property CID", () => {
    const drawer = renderDrawer();
    expect(drawer.tagName).toBe("ASIDE");
    expect(drawer?.getAttribute("data-property-cid")).toBe(property.propertyCid);
  });

  it("titles the drawer with the TCAD id and says the address is not published", () => {
    renderDrawer();
    expect(screen.getByRole("heading", { level: 3 })?.textContent).toContain("TCAD 192820");
    expect(
      screen.getByText(/Address not published in this run · 30\.26550, -97\.74300/),
    ).not.toBeNull();
  });

  it("shows the usage type, or 'Type not published' — never the structure form 'Building'", () => {
    renderDrawer();
    expect(screen.getByText("Type not published")).not.toBeNull();
    // The structure form is shown, but only as its own labelled row in the record section.
    expect(document.querySelector('[data-field="property_type"]')?.textContent).toBe("Building");
    expect(
      document.querySelector('[data-drawer-record] [data-field="property_usage_type"]'),
    ).not.toBeNull();
  });

  it("puts the property's Create lead before the Roof section", () => {
    const drawer = renderDrawer();
    const create = within(drawer).getByRole("button", { name: "Create lead" });
    const roof = within(drawer).getByRole("heading", { name: "Roof" });
    expect(create.compareDocumentPosition(roof) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("formats roof values: years, basis and confidence as plain labels", () => {
    renderDrawer();
    expect(document.querySelector('[data-field="roof_age_years"]')?.textContent).toMatch(
      /^41 yrs · estimated from year built$/,
    );
    expect(document.querySelector('[data-field="roof_age_basis"]')?.textContent).toContain(
      "Year built (no reroof permit found)",
    );
    expect(document.querySelector('[data-field="roof_age_confidence"]')?.textContent).toContain(
      "Low",
    );
    expect(screen.queryByText("built_year")).toBeNull();
  });

  it("formats permit dates and status: no ISO timestamps, no raw codes", () => {
    const drawer = renderDrawer();
    expect(drawer.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(screen.getByText(/Sep 4, 2026/)).not.toBeNull();
    expect(screen.getByText("Open")).not.toBeNull();
    // The source's own status word appears only in its labelled row; the badge is the plain label.
    expect(screen.queryByText("open")).toBe(
      document.querySelector('[data-field="improvement_status"]'),
    );
  });

  it("lists missing fields in plain language with the contract's reason", () => {
    renderDrawer();
    expect(screen.getByText(/street address, city/)).not.toBeNull();
    expect(screen.queryByText(/unnormalized_address/)).toBeNull();
    expect(screen.getAllByText("Not included in the published tables").length).toBeGreaterThan(0);
  });

  it("Run 3: shows the contractor as printed (unverified) and the BBB search link, with BBB's stated reason", () => {
    const printed = {
      ...permit,
      contractorNameAsPrinted: "ACME ROOFING LLC",
      bbbStatus: "blocked",
      bbbStatusReason: "bbb_blocked",
      bbbUrl: "https://www.bbb.org/search?find_text=ACME%20ROOFING%20LLC&find_loc=Austin%2C%20TX",
    } as unknown as Provenanced<CrmPermit>;
    const drawer = renderDrawer({ ...data, permits: [printed] });
    expect(
      drawer.querySelector("[data-field='contractor_name_as_printed']")?.textContent,
    ).toContain("ACME ROOFING LLC (as printed, unverified)");
    const link = drawer.querySelector("a[data-field='bbb_url']");
    expect(link?.getAttribute("href")).toMatch(/^https:\/\/www\.bbb\.org\/search/);
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(drawer.textContent).toContain("BBB rating not available · BBB blocked the lookup");
  });

  it("Run 3: with no printed name it says why instead of leaving the field blank, and renders no BBB link", () => {
    const none = {
      ...permit,
      contractorNameAsPrinted: null,
      bbbStatus: "not_checked",
      bbbStatusReason: "contractor_unresolved",
      bbbUrl: null,
      missingReasons: [{ field: "contractor_name_as_printed", reason: "contractor_unresolved" }],
    } as unknown as Provenanced<CrmPermit>;
    const drawer = renderDrawer({ ...data, permits: [none] });
    expect(drawer.querySelector("[data-field='contractor_name_as_printed']")?.textContent).toBe(
      "Contractor name not published · No contractor printed on the permit",
    );
    expect(drawer.querySelector("a[data-field='bbb_url']")).toBeNull();
  });

  it("keeps 'estimated from year built' beside a built-year roof age, and drops the BBB find_type parameter", () => {
    const built = {
      ...permit,
      contractorNameAsPrinted: "ACME ROOFING LLC",
      bbbUrl:
        "https://www.bbb.org/search?find_country=USA&find_text=ACME&find_loc=Austin%2C%20TX&find_type=Category",
    } as unknown as Provenanced<CrmPermit>;
    const drawer = renderDrawer({
      ...data,
      property: {
        ...property,
        roofAgeYears: 28,
        roofAgeBasis: "built_year",
      } as Provenanced<CrmProperty>,
      permits: [built],
    });
    expect(drawer.querySelector("[data-field='roof_age_years']")?.textContent).toBe(
      "28 yrs · estimated from year built",
    );
    const href = drawer.querySelector("a[data-field='bbb_url']")?.getAttribute("href") ?? "";
    expect(href).toContain("find_text=ACME");
    expect(href).not.toContain("find_type");
  });

  it("states the owner reason as 'not published (confidential or name not parsed)', not 'no owner on record'", () => {
    const none = {
      ...property,
      ownerName: null,
      ownerKind: null,
      missingReasons: [{ field: "owner_name", reason: "no_owner_record" }],
    } as unknown as Provenanced<CrmProperty>;
    const drawer = renderDrawer({ ...data, property: none });
    expect(drawer.querySelector("[data-field='owner_name']")?.textContent).toContain(
      "Owner not published (confidential or name not parsed)",
    );
  });

  it("says 'No building on this parcel' for a land parcel with no roof date, not 'No roof date found'", () => {
    const land = {
      ...property,
      propertyType: "LandParcel",
      roofAgeYears: null,
      roofAgeBasis: "unknown",
      roofAgeConfidence: "none",
      missingReasons: [{ field: "roof_age_years", reason: "no_roof_date" }],
    } as unknown as Provenanced<CrmProperty>;
    const drawer = renderDrawer({ ...data, property: land });
    expect(drawer.querySelector("[data-field='roof_age_years']")?.textContent).toContain(
      "No building on this parcel",
    );
    cleanup();
    const building = renderDrawer({
      ...data,
      property: { ...land, propertyType: "Building" } as unknown as Provenanced<CrmProperty>,
    });
    expect(building.querySelector("[data-field='roof_age_years']")?.textContent).toContain(
      "No roof date found",
    );
  });

  it("has a collapsed Lineage · Metadata section (source, date, run, CID per field) and an Ask about it link", () => {
    const drawer = renderDrawer();
    const meta = drawer.querySelector("details[data-lineage-metadata]") as HTMLDetailsElement;
    expect(meta).not.toBeNull();
    expect(meta.open).toBe(false);
    expect(meta.querySelector("summary")?.textContent).toBe("Lineage · Metadata");
    const fields = [...meta.querySelectorAll("[data-meta-field]")].map((e) =>
      e.getAttribute("data-meta-field"),
    );
    expect(fields).toEqual(
      expect.arrayContaining(["roof_age_years", "lat, lon", "permits", "contractor", "bbb_status"]),
    );
    const ask = drawer.querySelector("a[data-ask-about]") as HTMLAnchorElement;
    expect(ask.getAttribute("href") ?? "").toBe("/?mode=ai&q=Tell+me+about+TCAD+192820");
  });

  it("a Run 2 row (no v1.1 columns at all) still renders, with the reason instead of a name", () => {
    const drawer = renderDrawer();
    expect(
      drawer.querySelector("[data-field='contractor_name_as_printed']")?.textContent,
    ).toContain("Contractor name not published");
    expect(drawer.querySelector("a[data-field='bbb_url']")).toBeNull();
  });

  it("Run 3: never links a BBB URL that is not https", () => {
    const bad = {
      ...permit,
      contractorNameAsPrinted: "ACME ROOFING LLC",
      bbbUrl: "javascript:alert(1)",
    } as unknown as Provenanced<CrmPermit>;
    const drawer = renderDrawer({ ...data, permits: [bad] });
    expect(drawer.querySelector("a[data-field='bbb_url']")).toBeNull();
  });

  it("shows the owner: name, kind, tenure with its basis, and the reason when owner area is unknown", () => {
    const owned = {
      ...property,
      ownerName: "DOE, JANE",
      ownerKind: "person",
      isLongTenure: true,
      tenureBasis: "deed_date",
      ownerAreaClass: "unknown",
      missingReasons: [{ field: "owner_area_class", reason: "not_in_export" }],
    } as unknown as Provenanced<CrmProperty>;
    const drawer = renderDrawer({ ...data, property: owned });
    expect(drawer.querySelector("[data-field='owner_name']")?.textContent).toBe("DOE, JANE");
    expect(drawer.querySelector("[data-field='owner_kind']")?.textContent).toBe("Person");
    expect(drawer.querySelector("[data-field='is_long_tenure']")?.textContent).toBe(
      "Over 10 years · from Deed date",
    );
    expect(drawer.querySelector("[data-field='owner_area_class']")?.textContent).not.toBe("");
    expect(drawer.querySelector("[data-field='owner_area_class']")?.textContent).toContain(
      "published tables",
    );
  });

  it("says why when the owner name is missing, including on a Run 2 row with no such column", () => {
    const none = {
      ...property,
      ownerName: null,
      missingReasons: [{ field: "owner_name", reason: "owner_confidential" }],
    } as unknown as Provenanced<CrmProperty>;
    const drawer = renderDrawer({ ...data, property: none });
    expect(drawer.querySelector("[data-field='owner_name']")?.textContent).toContain(
      "confidential",
    );
    cleanup();
    const old = renderDrawer();
    expect(old.querySelector("[data-field='owner_name']")?.textContent).not.toBe("");
  });

  it("keeps provenance visible: run id and captured time for the property and each permit", () => {
    renderDrawer();
    expect(screen.getAllByText(/^Source: .*travis-202609-permits-20261021t103516z/).length).toBe(2);
  });

  it("says why when the property is not in this run", () => {
    renderDrawer({ ...data, property: null, permits: [] });
    expect(screen.getByRole("heading", { level: 3 })?.textContent).toContain(
      "Property not in this run",
    );
  });
});

describe("PropertyDetail drawer · near {place} (E-93)", () => {
  const SHA = "a".repeat(64);
  const withPlace: PropertyDetailData = {
    ...data,
    nearPlace: {
      name: "Pflugerville",
      distanceMi: 1.4,
      source: "travis-places@1.0.0",
      sha256: SHA,
    },
  };

  it("titles the drawer 'TCAD {id} · near {place}'", () => {
    renderDrawer(withPlace);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toContain("TCAD 192820 · near Pflugerville");
    expect(heading.textContent).not.toContain(" in Pflugerville");
  });

  it("with a street address: address title, then 'TCAD {id} · near {place}'", () => {
    renderDrawer({
      ...withPlace,
      property: { ...withPlace.property, unnormalizedAddress: "100 MAIN ST, AUSTIN, TX 78701" },
    } as PropertyDetailData);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toContain("100 MAIN ST, AUSTIN, TX 78701");
    expect(heading.textContent).toContain("TCAD 192820 · near Pflugerville");
    expect(heading.textContent).not.toContain("Address not published");
  });

  it("shows the gazetteer as the place's provenance on hover", () => {
    renderDrawer(withPlace);
    const place = document.querySelector('[data-field="near_place"]');
    expect(place?.textContent).toBe("near Pflugerville");
    const title = place?.getAttribute("title") ?? "";
    expect(title).toContain("1.4 mi");
    expect(title).toContain("travis-places@1.0.0");
    expect(title).toContain(SHA);
  });

  it("keeps the address line and the e2e hooks with a place in the title", () => {
    const drawer = renderDrawer(withPlace);
    expect(drawer.getAttribute("data-property-cid")).toBe(property.propertyCid);
    expect(
      screen.getByText(/Address not published in this run · 30\.26550, -97\.74300/),
    ).not.toBeNull();
  });

  it("with no coordinates: no place, and the contract's reason says why", () => {
    const noCoords = {
      ...property,
      latitude: null,
      longitude: null,
      missingReasons: [
        ...property.missingReasons,
        { field: "latitude", reason: "no_coordinates" },
        { field: "longitude", reason: "no_coordinates" },
      ],
    } as unknown as Provenanced<CrmProperty>;
    renderDrawer({ ...data, property: noCoords });
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toContain("TCAD 192820");
    expect(heading.textContent).not.toContain("near");
    const reason = document.querySelector('[data-field="near_place"]');
    expect(reason?.textContent).toContain("Nearest place not shown");
    expect(reason?.textContent).toContain("No coordinates for this parcel");
    // One line says the map is left alone, in the same missing-data wording.
    const position = document.querySelector('[data-field="map_position"]');
    expect(position?.textContent).toBe("Not shown on the map · No coordinates for this parcel");
  });

  it("a property with coordinates has no such line", () => {
    renderDrawer(data);
    expect(document.querySelector('[data-field="map_position"]')).toBeNull();
  });
});
