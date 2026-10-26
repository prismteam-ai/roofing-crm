// Review findings D2, D3, D4, D5/D6, D8, D9, D10, D12, D15 and D17: the drawer, the result row and
// the shared Provenance line say why a value is empty from the row's own `missing` entries, and
// word each fact once.
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { Provenance } from "@crm/ui";

vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useCreateLead: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
  useLeadPresence: () => ({ isPending: false, data: null }),
  usePrefetchLeadsList: () => () => Promise.resolve(),
}));
vi.mock("../../src/routes/Map/PropertyDetail/similarApi", () => ({
  useSimilarProperties: () => ({ isPending: true, isError: false, data: undefined }),
}));

import {
  PropertyDetail,
  type PropertyDetailData,
} from "../../src/routes/Map/PropertyDetail/PropertyDetail";
import { ResultRow } from "../../src/routes/Map/ResultRow";

afterEach(cleanup);

const property = {
  propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
  requestIdentifier: "192820",
  latitude: 30.2655,
  longitude: -97.743,
  coordinateSource: "none",
  propertyType: "Building",
  propertyUsageType: null,
  roofAgeYears: 41,
  roofAgeBasis: "built_year",
  roofAgeConfidence: "low",
  isLongTenure: null,
  ownerKind: "unknown",
  ownerName: null,
  ownerAreaClass: "unknown",
  ownerIsOutOfArea: null,
  lastSaleDate: "2011-07-18",
  sourceManifestCid: "bafkreimanifest",
  // Real order: owner_is_out_of_area comes first.
  missingReasons: [
    { field: "owner_is_out_of_area", reason: "no_owner_record" },
    { field: "owner_name", reason: "no_owner_record" },
    { field: "owner_kind", reason: "no_owner_record" },
    { field: "owner_area_class", reason: "no_owner_record" },
    { field: "property_usage_type", reason: "source_missing" },
  ],
  capturedAt: "2026-10-21T10:40:04Z",
  cid: "bafkreitablecid",
  runId: "travis-full-run3-20261025",
} as unknown as Provenanced<CrmProperty>;

const makePermit = (over: Record<string, unknown>): Provenanced<CrmPermit> =>
  ({
    propertyCid: property.propertyCid,
    permitCid: "bafkreipermitaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    jurisdiction: "Austin",
    permitNumber: "2026-115882 BP",
    improvementType: "Roofing",
    improvementAction: "Replace",
    statusClass: "closed",
    issueDate: "2026-09-04T00:00:00.000Z",
    finalDate: "2026-09-20T00:00:00.000Z",
    openDays: null,
    contractorResolution: "unresolved",
    contractorNameAsPrinted: null,
    bbbStatus: null,
    bbbStatusReason: null,
    bbbUrl: null,
    missingReasons: [
      { field: "open_days", reason: "not_open" },
      { field: "contractor_name_as_printed", reason: "contractor_unresolved" },
    ],
    capturedAt: "2026-10-21T10:35:59Z",
    cid: "bafkreipermittablecid",
    runId: "travis-full-run3-20261025",
    ...over,
  }) as unknown as Provenanced<CrmPermit>;

function drawer(permits: Provenanced<CrmPermit>[], bbb = false): HTMLElement {
  const data: PropertyDetailData = {
    property,
    permits,
    bbbStatus: bbb ? "blocked" : null,
    bbbStatusReason: bbb ? "bbb_blocked" : null,
    lineageUrl: "https://example.com/lineage",
  };
  render(
    <MemoryRouter>
      <PropertyDetail data={data} onClose={() => undefined} />
    </MemoryRouter>,
  );
  return screen.getByRole("dialog");
}

describe("drawer: permit card", () => {
  it("D2/D3: a finaled permit says Not open (finaled) and its status pill is on the verified pill", () => {
    const d = drawer([makePermit({})]);
    expect(d.querySelector("[data-field='open_days']")?.textContent).toContain(
      "Not open (finaled)",
    );
    expect(d.textContent).not.toContain("open duration not available");
    expect(d.querySelector("[data-field='status_class']")?.className).toMatch(/verified/);
  });

  it("D3: stalled keeps the derived wording on a warning pill", () => {
    const d = drawer([
      makePermit({ statusClass: "stalled", openDays: 900, finalDate: null, missingReasons: [] }),
    ]);
    const pill = d.querySelector("[data-field='status_class']");
    expect(pill?.textContent).toContain("Stalled · derived: no status in source");
    expect(pill?.className).toMatch(/warning/);
  });

  it("a stalled permit with a final date reads Finaled, never Stalled, and shows no Open for", () => {
    const d = drawer([
      makePermit({
        statusClass: "stalled",
        openDays: null,
        finalDate: "1991-04-15",
        missingReasons: [{ field: "open_days", reason: "not_open" }],
      }),
    ]);
    const pill = d.querySelector("[data-field='status_class']");
    expect(pill?.textContent).toBe("Finaled Apr 15, 1991 (status not in source)");
    expect(pill?.textContent).not.toMatch(/Stalled/);
    expect(d.querySelector("[data-field='open_days']")).toBeNull();
    expect(d.textContent).not.toContain("Open for");
  });

  it("D12/D17: BBB and contractor read the permit's own entries; no drawer-level fallback", () => {
    const withBbb = makePermit({
      missingReasons: [
        { field: "bbb_rating", reason: "bbb_blocked" },
        { field: "contractor_name_as_printed", reason: "contractor_unresolved" },
      ],
    });
    const bare = makePermit({
      permitCid: "bafkreipermitbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      missingReasons: [],
    });
    const d = drawer([withBbb, bare], true);
    const cards = d.querySelectorAll("[data-permit-cid]");
    expect(cards[0]?.textContent).toContain("BBB rating not available · BBB blocked the lookup");
    expect(cards[0]?.textContent).toContain("No contractor printed on the permit");
    // The second permit has no BBB entry of its own: the drawer-level "blocked" does not leak in.
    expect(cards[1]?.textContent).not.toContain("BBB blocked the lookup");
    expect(cards[1]?.textContent).toContain("no reason recorded");
  });

  it("D5: provenance calls the record CID a record, not a table", () => {
    const d = drawer([makePermit({})]);
    expect(d.textContent).toContain("UTC · record ");
    expect(d.textContent).not.toContain("UTC · table ");
  });
});

describe("drawer: owner, type and metadata", () => {
  it("D8/D15: unknown owner kind shows its reason, last sale shows the date", () => {
    const d = drawer([]);
    const kind = d.querySelector("[data-field='owner_kind']");
    expect(kind?.textContent).toContain("Owner not published (confidential or name not parsed)");
    expect(d.querySelector("[data-field='last_ownership_transfer_date']")?.textContent).toBe(
      "Jul 18, 2011",
    );
  });

  it("D9: an unpublished type shows the property's reason", () => {
    const d = drawer([]);
    expect(within(d).getByText("Type not published · Not on the source record")).toBeTruthy();
  });

  it("D10/D11: BBB has its own source, permit rows say first permit, coordinates use the shared label", () => {
    const d = drawer([makePermit({})]);
    const bbb = d.querySelector("[data-meta-field='bbb_status']");
    expect(bbb?.textContent).toContain("BBB: lookup blocked, not contacted");
    expect(bbb?.textContent).toContain("bbb_status (first permit)");
    expect(d.querySelector("[data-meta-field='permits']")?.textContent).toContain("Austin permits");
    expect(d.querySelector("[data-meta-field='lat, lon']")?.textContent).toContain(
      "No coordinates",
    );
  });

  it("D4: the Not published section words owner fields per field, whatever order they arrive in", () => {
    const d = drawer([]);
    const group = d.querySelector(
      "[data-missing-group='no_owner_record'][data-fields*='owner_name']",
    );
    expect(group?.textContent).toContain("Owner not published (confidential or name not parsed)");
    expect(group?.getAttribute("data-fields")).not.toContain("owner_is_out_of_area");
  });
});

describe("result row", () => {
  it("D9/D12: shows the type reason and the permit's own contractor reason", () => {
    render(
      <MemoryRouter>
        <ResultRow row={property} permits={[makePermit({})]} expanded />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Type not published · Not on the source record").length).toBe(1);
    const contractor = document.querySelector("[data-field='contractor_name_as_printed']");
    expect(contractor?.textContent).toBe(
      "Contractor not published · No contractor printed on the permit",
    );
  });
});

describe("Provenance", () => {
  it("D6: no source link says so without inventing a contract code", () => {
    render(
      <Provenance
        sourceUrl={null}
        capturedAt="2026-10-21T10:35:59Z"
        recordCid="bafkreirecord"
        runId="run"
      />,
    );
    expect(screen.getByText("No source link published")).toBeTruthy();
    expect(document.querySelector("[data-reason]")).toBeNull();
  });

  it("D6: a row's own source_url entry still shows its reason", () => {
    render(
      <Provenance
        sourceUrl={null}
        sourceUrlMissing={{ field: "source_url", reason: "source_missing" }}
        capturedAt="2026-10-21T10:35:59Z"
        recordCid="bafkreirecord"
        runId="run"
      />,
    );
    expect(document.querySelector("[data-reason='source_missing']")).not.toBeNull();
  });
});
