// Built year, last sale, tenure years and the source record links (Task A contract v1.1 columns
// the index now carries): shown where the design shows them, with the stated reason when null, no
// crash on rows from an index built before the fields existed, and only http(s) URLs as links.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";

vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useCreateLead: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
  useLeadPresence: () => ({ isPending: false, data: null }),
  usePrefetchLeadsList: () => () => Promise.resolve(),
}));
vi.mock("../../src/components/AppShell/shellApi.js", () => ({
  useShellAppLinks: () => ({ data: { countyLensUrl: "https://lens.example" } }),
}));

import { PropertyDetail } from "../../src/routes/Map/PropertyDetail/PropertyDetail";
import { SourceLink, safeSourceHref } from "../../src/routes/Map/SourceLink";
import { WhyPanel } from "../../src/routes/Map/WhyPanel";
import { whyLead } from "../../src/routes/Map/whyLead";

afterEach(cleanup);

const base = {
  propertyCid: "baguqeeraproperty",
  requestIdentifier: "138273",
  latitude: 30.36,
  longitude: -97.75,
  coordinateSource: "gis_centroid",
  propertyType: "Building",
  propertyUsageType: "Residential",
  roofAgeYears: 31,
  roofAgeBasis: "built_year",
  roofAgeConfidence: "low",
  isLongTenure: true,
  tenureBasis: "sale_date",
  ownerName: "DOE, JANE",
  ownerKind: "person",
  ownerAreaClass: "in_county",
  ownerIsOutOfArea: false,
  sourceManifestCid: "bafkreimanifest",
  missingReasons: [],
  capturedAt: "2026-10-22T05:48:41Z",
  cid: "bafybeiproperty7m2c",
  runId: "travis-full-run3-20261025",
};
const asProp = (over: Record<string, unknown> = {}) =>
  ({ ...base, ...over }) as unknown as Provenanced<CrmProperty>;
const permit = (over: Record<string, unknown> = {}) =>
  ({
    propertyCid: base.propertyCid,
    permitCid: "bafkreipermit",
    permitNumber: "2024-019307 BP",
    improvementType: "Roofing",
    improvementAction: "Replace",
    statusClass: "open",
    openDays: 804,
    contractorNameAsPrinted: null,
    missingReasons: [],
    capturedAt: "2026-10-25T08:20:38Z",
    cid: "bafybeipermitq4xa",
    runId: "travis-full-run3-20261025",
    ...over,
  }) as unknown as Provenanced<CrmPermit>;

function drawer(property: Provenanced<CrmProperty>, permits: Provenanced<CrmPermit>[]) {
  render(
    <MemoryRouter>
      <PropertyDetail
        data={{
          property,
          permits,
          bbbStatus: null,
          bbbStatusReason: null,
          lineageUrl: "https://x.test",
        }}
        onClose={() => undefined}
      />
    </MemoryRouter>,
  );
  return screen.getByRole("dialog");
}
const text = (root: HTMLElement, field: string) =>
  root.querySelector(`[data-field='${field}']`)?.textContent ?? "";

describe("SourceLink", () => {
  it("links only http(s) URLs", () => {
    expect(safeSourceHref("https://data.austintexas.gov/x")).toContain("https://");
    expect(safeSourceHref("http://example.test/x")).toContain("http://");
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "/relative",
      "",
      null,
      undefined,
    ]) {
      expect(safeSourceHref(bad)).toBeNull();
    }
    const { container } = render(<SourceLink url="javascript:alert(1)" label="x" />);
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("drawer: Run 3 fields", () => {
  it("shows year built on the roof basis, last sale year, tenure years and the source links", () => {
    const d = drawer(
      asProp({
        structureBuiltYear: 1995,
        lastSaleDate: "2004-06-30",
        tenureYears: 22,
        sourceUrl: "https://example.test/tcad/file.csv",
      }),
      [
        permit({
          sourceUrl: "https://data.austintexas.gov/resource/3syk-w9eu.json?permit_number=P1",
        }),
      ],
    );
    expect(text(d, "roof_age_basis")).toContain("Year built 1995");
    expect(text(d, "last_ownership_transfer_date")).toBe("Jun 30, 2004");
    expect(text(d, "tenure_years")).toBe("22 yrs");
    const links = [...d.querySelectorAll("a[data-field='source_url']")].map((a) => a.textContent);
    expect(links).toContain("source record");
    expect(links).toContain("Austin permits 2024-019307 BP");
  });

  it("shows the stated reason when sale, tenure or built year are null", () => {
    const d = drawer(
      asProp({
        structureBuiltYear: null,
        lastSaleDate: null,
        tenureYears: null,
        sourceUrl: null,
        missingReasons: [
          { field: "last_ownership_transfer_date", reason: "no_dated_sale" },
          { field: "tenure_years", reason: "no_dated_sale" },
        ],
      }),
      [permit({ sourceUrl: null })],
    );
    expect(text(d, "roof_age_basis")).not.toMatch(/Year built \d/);
    expect(text(d, "last_ownership_transfer_date")).not.toBe("");
    expect(text(d, "last_ownership_transfer_date")).not.toMatch(/no reason recorded/);
    expect(text(d, "tenure_years")).not.toMatch(/no reason recorded/);
    expect(d.querySelector("a[data-field='source_url']")).toBeNull();
  });

  it("does not crash on a row from an index built before the fields existed", () => {
    const d = drawer(asProp(), [permit()]);
    expect(text(d, "last_ownership_transfer_date")).not.toBe("");
    expect(text(d, "tenure_years")).not.toBe("");
    expect(d.querySelector("a[data-field='source_url']")).toBeNull();
  });

  it("never links a non-http source URL", () => {
    const d = drawer(asProp({ sourceUrl: "javascript:alert(1)" }), [
      permit({ sourceUrl: "javascript:alert(2)" }),
    ]);
    expect(d.querySelector("a[data-field='source_url']")).toBeNull();
  });
});

describe("Why panel", () => {
  it("adds year built to the roof rule and a source record link on the coordinates", () => {
    const property = asProp({ structureBuiltYear: 1995, sourceUrl: "https://example.test/tcad" });
    const lead = whyLead({ property, permits: [] });
    expect(lead.rules.find((r) => r.key === "roof")?.value).toContain("Year built 1995");
    expect(lead.rules.find((r) => r.key === "roof")?.value).toContain("low confidence");
    render(
      <WhyPanel
        property={property}
        permits={[]}
        onBack={() => undefined}
        onDetails={() => undefined}
      />,
    );
    expect(
      document.querySelector("[data-why-coordinates] a[data-field='source_url']")?.textContent,
    ).toBe("source record");
  });

  it("has no source link for an older row or a non-https URL", () => {
    expect(whyLead({ property: asProp(), permits: [] }).coordinates?.sourceUrl).toBeNull();
    expect(
      whyLead({ property: asProp({ sourceUrl: "javascript:x" }), permits: [] }).coordinates
        ?.sourceUrl,
    ).toBeNull();
  });
});
