// Drawer extras (CRM-HANDOFF §4.3): out-of-area pill, "reroof permit not counted" note with the
// roof evidence line, disabled "Coming soon" rows, and the lazy "Similar properties" section.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";

vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useCreateLead: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
  useLeadPresence: () => ({ isPending: false, data: null }),
  usePrefetchLeadsList: () => () => Promise.resolve(),
}));

const similarState = vi.hoisted(() => ({
  enabledCalls: [] as boolean[],
  result: { isPending: false, isError: false, data: undefined } as Record<string, unknown>,
}));
vi.mock("../../src/routes/Map/PropertyDetail/similarApi", () => ({
  useSimilarProperties: (_cid: string, enabled: boolean) => {
    similarState.enabledCalls.push(enabled);
    return similarState.result;
  },
}));

import {
  PropertyDetail,
  type PropertyDetailData,
} from "../../src/routes/Map/PropertyDetail/PropertyDetail";
import { ResultRow } from "../../src/routes/Map/ResultRow";

afterEach(() => {
  cleanup();
  similarState.enabledCalls = [];
});

const base = {
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
  structureBuiltYear: 1985,
  isLongTenure: null,
  ownerKind: null,
  ownerAreaClass: null,
  ownerIsOutOfArea: null,
  missingReasons: [],
  capturedAt: "2026-10-21T10:40:04Z",
  cid: "bafkreitablecid",
  runId: "travis-full-run3-20261025",
} as unknown as Provenanced<CrmProperty>;

const permit = (over: Record<string, unknown>) =>
  ({
    propertyCid: base.propertyCid,
    permitCid: "bafkreipermit1",
    permitNumber: "2026-115882 BP",
    improvementType: "Roofing",
    improvementAction: "Replace",
    statusClass: "open",
    issueDate: "2026-09-04T00:00:00.000Z",
    finalDate: null,
    openDays: 47,
    contractorResolution: "unresolved",
    missingReasons: [],
    capturedAt: "2026-10-21T10:35:59Z",
    cid: "bafkreipermittablecid",
    runId: "travis-full-run3-20261025",
    ...over,
  }) as unknown as Provenanced<CrmPermit>;

function drawer(
  property: Provenanced<CrmProperty>,
  permits: Provenanced<CrmPermit>[],
  onSelectProperty?: (cid: string) => void,
) {
  const data: PropertyDetailData = {
    property,
    permits,
    bbbStatus: null,
    bbbStatusReason: null,
    lineageUrl: "https://example.com/lineage",
  };
  render(
    <MemoryRouter>
      <PropertyDetail data={data} onClose={() => undefined} onSelectProperty={onSelectProperty} />
    </MemoryRouter>,
  );
}

describe("out-of-area pill", () => {
  it("shows Out-of-area owner, Local owner, and nothing for null on a result row", () => {
    const { rerender } = render(
      <ResultRow row={{ ...base, ownerIsOutOfArea: true } as typeof base} />,
    );
    expect(screen.getByText("Out-of-area owner")).toBeTruthy();
    rerender(<ResultRow row={{ ...base, ownerIsOutOfArea: false } as typeof base} />);
    expect(screen.getByText("Local owner")).toBeTruthy();
    rerender(<ResultRow row={base} />);
    expect(screen.queryByText("Out-of-area owner")).toBeNull();
    expect(screen.queryByText("Local owner")).toBeNull();
  });

  it("words the class on the result row so it matches the drawer", () => {
    render(
      <ResultRow
        row={{ ...base, ownerIsOutOfArea: false, ownerAreaClass: "regional" } as typeof base}
      />,
    );
    expect(screen.getByText("Regional owner")).toBeTruthy();
  });

  it.each([
    ["in_county", false, "Local"],
    ["regional", false, "Regional"],
    ["out_of_area", true, "Out-of-area"],
  ])("drawer Owner section: mailing location and %s pill", (cls, out, label) => {
    drawer(
      {
        ...base,
        ownerAreaClass: cls,
        ownerIsOutOfArea: out,
        ownerMailingStateCode: "TX",
        ownerMailingPostalCode: "78660",
      } as unknown as typeof base,
      [],
    );
    expect(document.querySelector('[data-field="owner_mailing_location"]')?.textContent).toBe(
      `TX 78660 ${label}`,
    );
    expect(document.querySelector('[data-field="owner_area_class"]')?.textContent).toBe(label);
  });

  it("drawer Owner section: unknown class keeps its stated reason on both rows", () => {
    drawer(
      {
        ...base,
        ownerAreaClass: "unknown",
        missingReasons: [
          { field: "owner_area_class", reason: "no_mailing_address" },
          { field: "owner_mailing_postal_code", reason: "no_mailing_address" },
        ],
      } as unknown as typeof base,
      [],
    );
    const mailing = document.querySelector('[data-field="owner_mailing_location"]');
    expect(mailing?.textContent).not.toBe("");
    expect(mailing?.textContent).not.toContain("Local");
    expect(document.querySelector('[data-field="owner_area_class"]')?.textContent).not.toBe("");
  });

  it("drawer Owner section tolerates an index without the v1.2 fields", () => {
    drawer(base, []);
    expect(document.querySelector('[data-field="owner_mailing_location"]')?.textContent).toContain(
      "not published",
    );
  });

  it("result row title: address with the TCAD id under it, and without one the TCAD id", () => {
    const { rerender } = render(
      <ResultRow
        row={{ ...base, unnormalizedAddress: "100 MAIN ST, AUSTIN, TX 78701" } as never}
      />,
    );
    expect(screen.getByText("100 MAIN ST, AUSTIN, TX 78701")).toBeTruthy();
    expect(screen.getByText("TCAD 192820")).toBeTruthy();
    rerender(<ResultRow row={base} />);
    expect(screen.getByText("TCAD 192820")).toBeTruthy();
    expect(screen.getByText(/Address not published/)).toBeTruthy();
  });

  it("drawer header: the street address is the title and the TCAD id is under it", () => {
    drawer(
      { ...base, unnormalizedAddress: "2725 WOODALL DR 1401, CEDAR PARK, TX 78613" } as never,
      [],
    );
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toContain("2725 WOODALL DR 1401, CEDAR PARK, TX 78613");
    expect(heading.textContent).toContain("TCAD 192820");
    expect(heading.textContent).not.toContain("not published");
  });
});

describe("roof evidence and the unfinaled reroof note", () => {
  it("explains an open permit that is not counted, with the evidence line", () => {
    drawer(base, [permit({})]);
    expect(
      screen.getByText(/A roofing permit exists but was never finaled, so it is not counted/),
    ).toBeTruthy();
    const evidence = document.querySelector("[data-roof-evidence]");
    expect(evidence?.textContent).toContain("TCAD parcels");
    expect(evidence?.textContent).toContain("Run 3");
    expect(evidence?.textContent).toContain("bafk");
  });

  it("is absent with no permits, with a finaled closed permit, or when a permit dated the roof", () => {
    drawer(base, []);
    expect(document.querySelector("[data-reroof-note]")).toBeNull();
    cleanup();
    drawer(base, [permit({ statusClass: "closed", finalDate: "2020-01-01T00:00:00.000Z" })]);
    expect(document.querySelector("[data-reroof-note]")).toBeNull();
    cleanup();
    drawer({ ...base, roofAgeBasis: "permit" } as typeof base, [permit({})]);
    expect(document.querySelector("[data-reroof-note]")).toBeNull();
    expect(document.querySelector("[data-roof-evidence]")?.textContent).toContain("Austin permits");
  });
});

describe("coming soon rows", () => {
  it("are disabled and say why", () => {
    drawer(base, []);
    const street = screen.getByRole("button", { name: /Street View/ });
    expect((street as HTMLButtonElement).disabled).toBe(true);
    expect(street.getAttribute("title")).toBe("No imagery in the published data");
    const merged = screen.getByRole("button", { name: /Merged from/ });
    expect((merged as HTMLButtonElement).disabled).toBe(true);
    expect(merged.getAttribute("title")).toBe("No merge data in the published contract");
  });
});

describe("Similar properties", () => {
  const open = () => {
    const details = document.querySelector("[data-similar-properties]") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));
  };

  it("does not load until opened, then lists rows that open the property", () => {
    similarState.result = {
      isPending: false,
      isError: false,
      data: {
        found: true,
        reason: null,
        radiusMi: 1,
        roofAgeBandYears: 5,
        limit: 5,
        similar: [
          {
            propertyCid: "cid-2",
            requestIdentifier: "555",
            distanceMi: 0.456,
            roofAgeYears: 38,
            roofAgeConfidence: "medium",
            roofAgeBasis: "built_year",
          },
        ],
      },
    };
    const onSelect = vi.fn();
    drawer(base, [], onSelect);
    expect(similarState.enabledCalls).toEqual([]);
    open();
    expect(screen.getByText(/TCAD 555 · 0.46 mi · roof 38 yrs/)).toBeTruthy();
    // The rules come from the response and say "structure type", as the server matches it.
    expect(
      screen.getByText(
        "Up to 5, nearest first, within 1 mile with the same structure type and a roof age within 5 years",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open TCAD 555" }));
    expect(onSelect).toHaveBeenCalledWith("cid-2");
  });

  it("shows loading, the empty reason and an error", () => {
    similarState.result = { isPending: true, isError: false, data: undefined };
    drawer(base, []);
    open();
    expect(screen.getByText(/Loading similar properties/)).toBeTruthy();
    cleanup();

    similarState.result = {
      isPending: false,
      isError: false,
      data: {
        found: true,
        similar: [],
        reason: "no_roof_age",
        radiusMi: 2,
        roofAgeBandYears: 3,
        limit: 5,
      },
    };
    drawer(base, []);
    open();
    expect(screen.getByText(/no roof age to compare/)).toBeTruthy();
    cleanup();

    similarState.result = { isPending: false, isError: true, data: undefined };
    drawer(base, []);
    open();
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
  });
});
