import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { callsTo, candidate, permitOf, renderApp, searchResult } from "../../../test/mock-api.tsx";

vi.mock("../map/webgl.ts", () => ({ webglAvailable: () => false }));

const OLD = candidate({
  propertyId: "A",
  address: "1 OLD PERMIT ST",
  openRoofPermits: [permitOf("ftl:OLD", 7)],
});
const NEW = candidate({
  propertyId: "B",
  address: "2 NEW PERMIT ST",
  roofAgeYears: null,
  openRoofPermits: [permitOf("ftl:NEW", 2)],
});

const property = (over: Record<string, unknown> = {}) => ({
  property: {
    parcel_identifier: "A",
    property_cid: "bafyprop",
    manifest_cid: "bafkreiaw4jf6",
    address: "1 OLD PERMIT ST",
    city: "FORT LAUDERDALE",
    zip: "33301",
    lat: 26.12,
    lon: -80.13,
    year_built: 1941,
    roof_date: null,
    roof_age_years: 85,
    roof_age_basis: "year_built",
    owner_location_class: "in_county",
    property_type: "single_family",
    property_usage_type: null,
    last_sale_date: "2001-05-01",
    permit_jurisdiction_covered: true,
    source_url: "https://bcpa.net/record/A",
    provenance: [],
    ...over,
  },
  appraiser_url: "https://web.bcpa.net/A",
  permits: [
    {
      permit_key: "ftl:OLD",
      permit_number: "OLD",
      status: "open",
      raw_status: "ISSUED",
      is_roofing: true,
      description: "REROOF",
      permit_type: "ROOF",
      issue_date: "2019-02-01",
      completion_date: null,
      open_days: 2600,
      contractor_name: "ACME ROOFING LLC",
      contractor_license: "CCC1",
      source_url: "https://ftl.gov/permit/OLD",
    },
    {
      permit_key: "ftl:X",
      permit_number: "X",
      status: "open",
      raw_status: "ISSUED",
      is_roofing: true,
      description: "REROOF",
      permit_type: "ROOF",
      issue_date: "2020-01-01",
      completion_date: null,
      open_days: 2100,
      contractor_name: "NOBBB ROOFS",
      contractor_license: "CCC2",
      source_url: "https://ftl.gov/permit/X",
    },
  ],
});
const permitDetail = ({ id }: { id: string }) => ({
  permit: {
    permit_key: id,
    contractor_license_status: "C",
    bbb_rating: id === "ftl:OLD" ? "A+" : null,
    bbb_accredited: id === "ftl:OLD" ? "Yes" : null,
    property_improvement_cid: "bafypi",
  },
  property: null,
  contractor: {
    contractor_name: "X",
    source_url: "https://dbpr.example/license",
    bbb_rating: null,
    bbb_accredited: null,
  },
});

describe("candidates", () => {
  test("filtering by min open years hides newer permits", async () => {
    const { calls } = renderApp({
      "map.search": (i) =>
        searchResult(
          [OLD, NEW].filter((c) =>
            c.openRoofPermits.every((p) => (p.openDays ?? 0) / 365.25 >= i.minOpenYears),
          ),
        ),
    });
    expect(await screen.findByTestId("candidate-B")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Permit open ≥/), { target: { value: "5" } });
    await waitFor(() => expect(screen.queryByTestId("candidate-B")).toBeNull());
    expect(screen.getByTestId("candidate-A")).toBeInTheDocument();
    expect(callsTo(calls, "map.search").at(-1)?.input.minOpenYears).toBe(5);
  });

  test("detail shows contractor and BBB grade; a missing grade shows 'No BBB data'", async () => {
    renderApp({
      "map.search": () => searchResult([OLD]),
      "property.get": () => property(),
      "permit.get": permitDetail,
    });
    fireEvent.click(within(await screen.findByTestId("candidate-A")).getByRole("button"));
    const withGrade = await screen.findByTestId("permit-ftl:OLD");
    expect(withGrade).toHaveTextContent("Contractor: ACME ROOFING LLC");
    expect(withGrade).toHaveTextContent("license CCC1");
    await waitFor(() => expect(withGrade).toHaveTextContent("BBB A+ · accredited"));
    await waitFor(() => expect(screen.getByTestId("permit-ftl:X")).toHaveTextContent("No BBB data"));
    expect(screen.getByRole("dialog")).toHaveTextContent("85 years");
    expect(screen.getByRole("dialog")).toHaveTextContent("basis: year built");
  });

  test("a radius crossing jurisdictions without permit data shows a coverage note naming them", async () => {
    renderApp({ "map.search": () => searchResult([OLD], { permitGaps: ["Oakland Park", "Lauderhill"] }) });
    expect(await screen.findByTestId("permit-gaps")).toHaveTextContent(
      "No permit data in this run for Oakland Park, Lauderhill",
    );
  });

  test("bulk convert creates leads and reports duplicates as existing", async () => {
    const { calls } = renderApp({
      "map.search": () => searchResult([OLD, NEW]),
      "leads.createMany": () => ({ created: 1, existing: 1, leads: [] }),
    });
    fireEvent.click(within(await screen.findByTestId("candidate-A")).getByRole("checkbox"));
    fireEvent.click(within(screen.getByTestId("candidate-B")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Convert 2 to leads/ }));
    expect(await screen.findByText(/Created 1 lead, 1 already existed\./)).toBeInTheDocument();
    expect(callsTo(calls, "leads.createMany")[0].input).toEqual({
      items: [
        { propertyId: "A", permitId: "ftl:OLD" },
        { propertyId: "B", permitId: "ftl:NEW" },
      ],
    });
  });

  test("provenance links open the source URLs", async () => {
    renderApp({
      "map.search": () => searchResult([OLD]),
      "property.get": () => property(),
      "permit.get": permitDetail,
    });
    fireEvent.click(within(await screen.findByTestId("candidate-A")).getByRole("button"));
    const src = await screen.findByRole("link", { name: "Property appraiser record (source)" });
    expect(src).toHaveAttribute("href", "https://bcpa.net/record/A");
    expect(src).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /Elephant property/ })).toHaveAttribute(
      "href",
      "https://ipfs.filebase.io/ipfs/bafyprop",
    );
    expect(screen.getAllByRole("link", { name: "Permit source" })[0]).toHaveAttribute(
      "href",
      "https://ftl.gov/permit/OLD",
    );
  });

  test("converting from the drawer uses the longest-open permit and reports an existing lead", async () => {
    const { calls } = renderApp({
      "map.search": () => searchResult([OLD]),
      "property.get": () => property(),
      "permit.get": permitDetail,
      "leads.create": () => ({ created: false, lead: {} }),
    });
    fireEvent.click(within(await screen.findByTestId("candidate-A")).getByRole("button"));
    fireEvent.click(await screen.findByRole("button", { name: "Convert to lead" }));
    expect(await screen.findByText(/Already a lead/)).toBeInTheDocument();
    expect(callsTo(calls, "leads.create")[0].input).toEqual({ propertyId: "A", permitId: "ftl:OLD" });
  });
});
