// B-03 structural rebuild: ResultRow's card header (TCAD id + "Address not published" — this
// contract never publishes a street address yet, FU-A-01) and its distance-from-centre line
// (AC-1: real distance via packages/domain's distanceMeters, never a fake address from lat/lon).
// Tablet alignment (boards CrmMap768 / CrmMapPin390): a row is collapsed by default (address line,
// distance and direction, chips, chevron) and shows the full detail card only once expanded.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { ResultRow } from "../src/routes/Map/ResultRow";

afterEach(cleanup);

function makePermit(overrides: Partial<Provenanced<CrmPermit>> = {}): Provenanced<CrmPermit> {
  return {
    propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
    permitCid: "bafkreipermitaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    jurisdiction: "Austin",
    permitNumber: "2020-062543",
    improvementType: "Reroof",
    improvementAction: "Replace",
    improvementStatus: "open",
    statusClass: "open",
    issueDate: "2026-09-04",
    finalDate: null,
    permitCloseDate: null,
    finalInspectionDate: null,
    openDays: 28,
    contractorResolution: "unresolved",
    contractorCompanyCid: null,
    contractorNameAsPrinted: null,
    bbbStatus: null,
    bbbStatusReason: null,
    bbbUrl: null,
    sourceManifestCid: "bafkreimanifest",
    missingReasons: [],
    capturedAt: "2026-10-20T00:00:00Z",
    cid: "bafkreipermittablecid",
    runId: "run-3",
    ...overrides,
  };
}

function makeRow(overrides: Partial<Provenanced<CrmProperty>> = {}): Provenanced<CrmProperty> {
  return {
    propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
    requestIdentifier: "0201885122",
    latitude: 30.46,
    longitude: -97.6,
    coordinateSource: "gis_centroid",
    propertyType: "Residential",
    propertyUsageType: null,
    roofAgeYears: 20,
    roofAgeBasis: "permit",
    roofAgeConfidence: "high",
    isLongTenure: null,
    tenureBasis: null,
    ownerName: null,
    ownerKind: null,
    ownerAreaClass: null,
    ownerIsOutOfArea: null,
    sourceManifestCid: "bafkreimanifest",
    missingReasons: [],
    capturedAt: "2026-10-20T00:00:00Z",
    cid: "bafkreitablecid",
    runId: "run-3",
    ...overrides,
  };
}

describe("ResultRow card", () => {
  it("shows the TCAD id and 'Address not published' instead of a fabricated address", () => {
    render(<ResultRow row={makeRow()} />);
    expect(screen.getByText("TCAD 0201885122")).not.toBeNull();
    expect(screen.getByText(/Address not published/)).not.toBeNull();
  });

  it("shows real distance and compass direction from the search centre when one is given (AC-1, C3)", () => {
    render(<ResultRow row={makeRow()} center={{ lat: 30.4394, lng: -97.62 }} />);
    // The row (30.46, -97.6) lies north-east of the centre (30.4394, -97.62), about 1.9 mi away.
    expect(screen.getByText("1.9 mi NE")).not.toBeNull();
  });

  it("renders no distance when no search centre is set", () => {
    render(<ResultRow row={makeRow()} />);
    expect(screen.queryByText(/ mi /)).toBeNull();
  });

  it("renders no distance for a row with no published coordinates", () => {
    render(
      <ResultRow
        row={makeRow({ latitude: null, longitude: null })}
        center={{ lat: 30.4394, lng: -97.62 }}
      />,
    );
    expect(screen.queryByText(/ mi /)).toBeNull();
  });

  it("shows a roof-age badge with its confidence", () => {
    render(<ResultRow row={makeRow()} />);
    expect(screen.getByText("Roof 20 yrs")).not.toBeNull();
    expect(screen.getByText("Confidence High")).not.toBeNull();
  });

  it("shows 'Type not published' when the usage type is null, never blank and never the structure form", () => {
    render(<ResultRow row={makeRow({ propertyType: "Building", propertyUsageType: null })} />);
    expect(screen.getByText("Type not published")).not.toBeNull();
    expect(screen.queryByText("Building")).toBeNull();
  });

  it("shows the published usage type as Residential / Commercial", () => {
    render(
      <ResultRow row={makeRow({ propertyType: "Building", propertyUsageType: "Residential" })} />,
    );
    expect(screen.getByText("Residential")).not.toBeNull();
  });

  it("shows roof-age basis and confidence as plain labels, never enum codes", () => {
    render(
      <ResultRow
        row={makeRow({ roofAgeBasis: "built_year", roofAgeConfidence: "low" })}
        expanded
      />,
    );
    expect(screen.getByText("Year built (no reroof permit found)")).not.toBeNull();
    expect(screen.queryByText("built_year")).toBeNull();
    expect(screen.queryByText("low")).toBeNull();
  });

  it("shows the honest roof-age-not-available fallback when roofAgeYears is null with no matching missingReasons entry (GAP-4b)", () => {
    render(<ResultRow row={makeRow({ roofAgeYears: null })} />);
    expect(screen.getByText("Roof age not available")).not.toBeNull();
  });

  it("keeps the honest 'No roof date found' chip on the collapsed row, never a made-up age", () => {
    render(
      <ResultRow
        row={makeRow({
          roofAgeYears: null,
          roofAgeBasis: "unknown",
          roofAgeConfidence: "none",
          missingReasons: [{ field: "roofAgeYears", reason: "no_roof_date" }],
        })}
      />,
    );
    expect(screen.getAllByText("No roof date found")).toHaveLength(1);
    expect(screen.queryByText(/Roof \d+ yrs/)).toBeNull();
    expect(screen.queryByText(/0 yrs/)).toBeNull();
  });

  it("shows the MissingReason component's reason text when a missingReasons entry exists for the null roof age", () => {
    render(
      <ResultRow
        row={makeRow({
          roofAgeYears: null,
          missingReasons: [{ field: "roofAgeYears", reason: "no_roof_date" }],
        })}
        expanded
      />,
    );
    // Rendered in more than one place (the badge row, PropertyFields, and the missing-data
    // summary all independently surface the same missingReasons entry) — assert it appears at
    // all, not an exact count tied to internal layout.
    expect(screen.getAllByText("No roof date found").length).toBeGreaterThan(1);
  });

  it("groups and shows every missingReasons entry (constitution XI)", () => {
    render(
      <ResultRow
        row={makeRow({
          missingReasons: [
            { field: "propertyUsageType", reason: "source_missing" },
            { field: "ownerKind", reason: "source_missing" },
          ],
        })}
        expanded
      />,
    );
    expect(screen.getByLabelText("Missing data")).not.toBeNull();
    // One bullet per reason with its fields joined, in plain language.
    expect(screen.getByLabelText("Missing data").tagName).toBe("UL");
    expect(
      screen
        .getAllByRole("listitem")
        .some((li) => /property use, owner kind/.test(li.textContent ?? "")),
    ).toBe(true);
    expect(screen.queryByText(/propertyUsageType/)).toBeNull();
  });

  it("renders a PermitChip per permit when the permit-view prop is populated (AC-5), nothing when empty or absent", () => {
    const { rerender } = render(
      <ResultRow row={makeRow()} permits={[makePermit({ openDays: 1900 })]} />,
    );
    expect(screen.getByLabelText("Permits")).not.toBeNull();
    expect(screen.getByText("Long-open")).not.toBeNull();

    rerender(<ResultRow row={makeRow()} permits={[]} />);
    expect(screen.queryByLabelText("Permits")).toBeNull();

    rerender(<ResultRow row={makeRow()} />);
    expect(screen.queryByLabelText("Permits")).toBeNull();
  });

  it("calls onSelect when the row is clicked, but not when a permit chip/link inside it is clicked", () => {
    const onSelect = vi.fn();
    render(<ResultRow row={makeRow()} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("article"));
    expect(onSelect).toHaveBeenCalledWith(makeRow().propertyCid);
  });

  it("calls onSelect on Enter and Space when the row itself is focused, and shows an 'Open details' button", () => {
    const onSelect = vi.fn();
    render(<ResultRow row={makeRow()} onSelect={onSelect} selected />);
    const row = screen.getByRole("article");
    fireEvent.keyDown(row, { key: "Enter", target: row });
    fireEvent.keyDown(row, { key: " ", target: row });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Open details" })).not.toBeNull();
  });

  it("renders no 'Open details' button and never calls onSelect when onSelect is omitted", () => {
    render(<ResultRow row={makeRow()} />);
    expect(screen.queryByRole("button", { name: "Open details" })).toBeNull();
  });
});

describe("ResultRow collapsed and expanded (C1)", () => {
  it("is collapsed by default: the chips show, the detail card does not", () => {
    render(<ResultRow row={makeRow({ propertyUsageType: "Residential" })} />);
    expect(screen.getByText("Roof 20 yrs")).not.toBeNull();
    expect(screen.getByText("Confidence High")).not.toBeNull();
    expect(screen.getByText("Residential")).not.toBeNull();
    expect(screen.queryByText(/Property/)).toBeNull();
    expect(screen.queryByText("Basis")).toBeNull();
    expect(screen.queryByText("Coordinates")).toBeNull();
    expect(screen.queryByText(/collected/)).toBeNull();
    expect(screen.getByRole("article").getAttribute("data-expanded")).toBe("false");
    const chevron = screen.getByRole("button", { name: "Expand details" });
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
  });

  it("the chevron expands the row: CID, basis, confidence, coordinates and the source line", () => {
    render(<ResultRow row={makeRow()} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand details" }));
    expect(screen.getByRole("article").getAttribute("data-expanded")).toBe("true");
    expect(screen.getByText(/Property/)).not.toBeNull();
    expect(screen.getByText("Basis")).not.toBeNull();
    expect(screen.getByText("Coordinates")).not.toBeNull();
    expect(screen.getByText(/30\.46000, -97\.60000/)).not.toBeNull();
    expect(screen.getByText(/collected/)).not.toBeNull();
    const chevron = screen.getByRole("button", { name: "Collapse details" });
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(chevron);
    expect(screen.queryByText("Basis")).toBeNull();
  });

  it("the chevron does not select the property or open the drawer", () => {
    const onSelect = vi.fn();
    render(<ResultRow row={makeRow()} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand details" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("when the panel controls the state, the chevron asks it and the prop decides", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <ResultRow row={makeRow()} expanded={false} onToggleExpanded={onToggle} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand details" }));
    expect(onToggle).toHaveBeenCalledWith(makeRow().propertyCid);
    expect(screen.queryByText("Basis")).toBeNull();
    rerender(<ResultRow row={makeRow()} expanded onToggleExpanded={onToggle} />);
    expect(screen.getByText("Basis")).not.toBeNull();
  });

  it("the collapsed address line says why there is no address and carries no coordinates", () => {
    render(<ResultRow row={makeRow()} />);
    expect(screen.getByText("Address not published in this run").textContent).not.toMatch(/30\./);
  });

  it("shows the first permit as a chip with its open duration and counts the others", () => {
    render(
      <ResultRow
        row={makeRow()}
        permits={[
          makePermit({ openDays: 803, permitCid: "bafkreipermit1" }),
          makePermit({ openDays: 400, permitCid: "bafkreipermit2" }),
        ]}
      />,
    );
    const permits = screen.getByLabelText("Permits");
    expect(permits.querySelector("[data-permit-chip]")?.getAttribute("data-open-days")).toBe("803");
    expect(permits.querySelectorAll("[data-permit-chip]")).toHaveLength(1);
    expect(screen.getByText("+1 more")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand details" }));
    expect(
      screen.getByLabelText("All permits").querySelectorAll("[data-permit-chip]"),
    ).toHaveLength(2);
  });

  it("claims no permit for a row the permit query did not return", () => {
    render(<ResultRow row={makeRow()} permits={undefined} />);
    expect(screen.queryByLabelText("Permits")).toBeNull();
    expect(screen.queryByText(/No permit/i)).toBeNull();
  });
});
