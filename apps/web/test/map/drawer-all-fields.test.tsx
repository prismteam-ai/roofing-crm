// The property drawer is the last-resort full view (PO, 2026-10-26): it carries every value the CRM
// has for the property and each of its permits, plus "Why this is a lead" inline. A fixture with every
// field filled keeps a future field from being dropped silently.
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
import { WhyBody } from "../../src/routes/Map/WhyBody";

afterEach(cleanup);

const cid = (tag: string): string => `bafkrei${tag.padEnd(50, "a")}`;

const property = {
  propertyCid: cid("prop"),
  requestIdentifier: "181990",
  latitude: 30.2655,
  longitude: -97.743,
  coordinateSource: "address_point",
  propertyType: "Building",
  propertyUsageType: "Single Family Residential",
  roofAgeYears: 22,
  roofAgeBasis: "permit",
  roofAgeConfidence: "high",
  isLongTenure: true,
  tenureBasis: "sale_date",
  ownerName: "Pat Example",
  ownerKind: "person",
  ownerAreaClass: "out_of_area",
  ownerIsOutOfArea: true,
  unnormalizedAddress: "100 Main St, Austin, TX 78701",
  ownerMailingPostalCode: "75001",
  ownerMailingStateCode: "TX",
  structureBuiltYear: 1999,
  lastSaleDate: "2004-05-06",
  tenureYears: 22,
  sourceUrl: "https://example.test/tcad/181990",
  sourceManifestCid: cid("manifest"),
  missingReasons: [],
  capturedAt: "2026-10-21T10:40:04Z",
  cid: cid("record"),
  runId: "travis-full-run3-20261025",
} as unknown as Provenanced<CrmProperty>;

const fullPermit = (n: number, over: Record<string, unknown> = {}): Provenanced<CrmPermit> =>
  ({
    propertyCid: property.propertyCid,
    permitCid: cid(`permit${String(n)}`),
    jurisdiction: `Jurisdiction ${String(n)}`,
    permitNumber: `2026-${String(n)} BP`,
    improvementType: "Roofing",
    improvementAction: "Replace",
    improvementStatus: `Raw status ${String(n)}`,
    statusClass: "open",
    issueDate: "2026-09-04T00:00:00.000Z",
    finalDate: null,
    permitCloseDate: "2026-10-01T00:00:00.000Z",
    finalInspectionDate: "2026-10-02T00:00:00.000Z",
    openDays: 47,
    contractorResolution: "resolved",
    contractorCompanyCid: cid(`company${String(n)}`),
    contractorNameAsPrinted: "ACME ROOFING LLC",
    bbbStatus: "not_found",
    bbbStatusReason: null,
    bbbUrl: "https://www.bbb.org/search?find_text=ACME",
    sourceUrl: "https://example.test/permit/1",
    sourceManifestCid: cid("manifest"),
    missingReasons: [],
    capturedAt: "2026-10-21T10:35:59Z",
    cid: cid(`pcid${String(n)}`),
    runId: "travis-full-run3-20261025",
    ...over,
  }) as unknown as Provenanced<CrmPermit>;

const data = (permits: Provenanced<CrmPermit>[]): PropertyDetailData => ({
  property,
  permits,
  bbbStatus: null,
  bbbStatusReason: null,
  lineageUrl: "https://example.com/lineage",
});

function renderDrawer(d: PropertyDetailData): HTMLElement {
  render(
    <MemoryRouter>
      <PropertyDetail
        data={d}
        onClose={() => undefined}
        center={{ lat: 30.27, lng: -97.74 }}
        radiusMi={5}
        centreLabel="the pin"
        countyLensUrl="https://lens.test/"
      />
    </MemoryRouter>,
  );
  return screen.getByRole("dialog");
}

const fieldText = (root: HTMLElement, field: string): string =>
  root.querySelector(`[data-field="${field}"]`)?.textContent ?? "";

describe("drawer: Why this is a lead, inline", () => {
  it("has a Why section under the header with the same rule rows as the results pane's panel", () => {
    const permits = [fullPermit(1)];
    const drawer = renderDrawer(data(permits));
    const section = drawer.querySelector("[data-drawer-why]") as HTMLElement;
    expect(within(section).getByRole("heading", { name: "Why this is a lead" })).toBeTruthy();
    const create = within(drawer).getByRole("button", { name: "Create lead" });
    expect(create.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const inDrawer = Array.from(section.querySelectorAll("[data-why-rule]")).map(
      (n) => n.textContent,
    );
    cleanup();
    const { container } = render(
      <MemoryRouter>
        <WhyBody
          property={property}
          permits={permits}
          center={{ lat: 30.27, lng: -97.74 }}
          radiusMi={5}
          centreLabel="the pin"
          countyLensUrl="https://lens.test/"
          onDetails={() => undefined}
        />
      </MemoryRouter>,
    );
    const inPanel = Array.from(container.querySelectorAll("[data-why-rule]")).map(
      (n) => n.textContent,
    );
    expect(inDrawer.length).toBeGreaterThan(1);
    expect(inDrawer).toEqual(inPanel);
  });

  it("keeps Verify CID (the manifest) and has no Details button (it is the details)", () => {
    const drawer = renderDrawer(data([fullPermit(1)]));
    const verify = drawer.querySelector("[data-why-verify]") as HTMLAnchorElement;
    expect(verify.getAttribute("href")).toBe(`https://lens.test/data/verify/${cid("manifest")}`);
    expect(drawer.querySelector("[data-why-details]")).toBeNull();
  });
});

describe("drawer: property record fields", () => {
  it("shows the CIDs, structure form, usage type, year built, coordinate source, out-of-area flag, capture and source", () => {
    const drawer = renderDrawer(data([]));
    const record = drawer.querySelector("[data-drawer-record]") as HTMLElement;
    expect(
      record.querySelector(`[data-field="property_cid"] [data-cid]`)?.getAttribute("data-cid"),
    ).toBe(property.propertyCid);
    expect(
      record.querySelector(`[data-field="record_cid"] [data-cid]`)?.getAttribute("data-cid"),
    ).toBe(property.cid);
    expect(fieldText(record, "request_identifier")).toBe("181990");
    expect(fieldText(record, "property_type")).toBe("Building");
    expect(fieldText(record, "property_usage_type")).toMatch(/Single Family Residential/i);
    expect(fieldText(record, "structure_built_year")).toBe("1999");
    expect(fieldText(record, "lat_lon")).toContain("Austin address point");
    expect(fieldText(record, "owner_is_out_of_area")).toBe("Yes");
    expect(fieldText(record, "captured_at")).toContain("travis-full-run3-20261025");
    expect(record.querySelector('[data-field="source_url"] a')?.getAttribute("href")).toBe(
      "https://example.test/tcad/181990",
    );
  });

  it("a missing value states its reason from the row's own entry", () => {
    const sparse = {
      ...property,
      structureBuiltYear: null,
      propertyType: null,
      missingReasons: [{ field: "structure_built_year", reason: "source_missing" }],
    } as unknown as Provenanced<CrmProperty>;
    const drawer = renderDrawer({ ...data([]), property: sparse });
    expect(fieldText(drawer, "structure_built_year")).not.toBe("");
    expect(fieldText(drawer, "structure_built_year")).not.toMatch(/^null|—|N\/A/);
    expect(fieldText(drawer, "property_type")).toMatch(/not published/i);
  });
});

describe("drawer: every permit, every field", () => {
  it("renders the full set for each permit, not only the main one", () => {
    const drawer = renderDrawer(data([fullPermit(1), fullPermit(2)]));
    const cards = Array.from(drawer.querySelectorAll("[data-permit-cid]")) as HTMLElement[];
    expect(cards).toHaveLength(2);
    cards.forEach((card, i) => {
      const n = i + 1;
      expect(fieldText(card, "jurisdiction")).toBe(`Jurisdiction ${String(n)}`);
      expect(fieldText(card, "improvement_status")).toBe(`Raw status ${String(n)}`);
      expect(fieldText(card, "permit_close_date")).toMatch(/Oct 1, 2026/);
      expect(fieldText(card, "final_inspection_date")).toMatch(/Oct 2, 2026/);
      expect(
        card.querySelector('[data-field="permit_cid"] [data-cid]')?.getAttribute("data-cid"),
      ).toBe(cid(`permit${String(n)}`));
      expect(
        card
          .querySelector('[data-field="contractor_company_cid"] [data-cid]')
          ?.getAttribute("data-cid"),
      ).toBe(cid(`company${String(n)}`));
      expect(fieldText(card, "contractor_name_as_printed")).toContain("ACME ROOFING LLC");
      expect(card.querySelector('a[data-field="bbb_url"]')).not.toBeNull();
      // record CID, capture time and run (provenance on every permit)
      expect(card.querySelector(`[data-cid="${cid(`pcid${String(n)}`)}"]`)).not.toBeNull();
      expect(card.textContent).toContain("travis-full-run3-20261025");
    });
  });

  it("an empty permit value states why, and the permit's own missing reasons are a bullet list", () => {
    const sparse = fullPermit(1, {
      permitCloseDate: null,
      contractorCompanyCid: null,
      jurisdiction: null,
      missingReasons: [
        { field: "permit_close_date", reason: "not_open" },
        { field: "contractor_company_cid", reason: "contractor_unresolved" },
      ],
    });
    const drawer = renderDrawer(data([sparse]));
    const card = drawer.querySelector("[data-permit-cid]") as HTMLElement;
    expect(fieldText(card, "permit_close_date")).not.toBe("");
    expect(fieldText(card, "contractor_company_cid")).not.toBe("");
    expect(fieldText(card, "jurisdiction")).toMatch(/not published/i);
    const list = within(card).getByLabelText("Missing data");
    expect(list.tagName).toBe("UL");
    expect(list.querySelectorAll("li").length).toBe(2);
  });
});
