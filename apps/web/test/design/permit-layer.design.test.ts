/**
 * Design tests for the long-open roofing permit layer (honest empty).
 *
 * MapLibre is stubbed; asserts empty-state copy, /roof/i filtering, and no
 * invented close dates when published permits are missing or incomplete.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";
import { selectSearchInRadiusCandidatesForPermitLayer } from "../../src/map/select-search-in-radius-candidates-for-permit-layer";
import {
  PROPERTY_PERMIT_LAYER_EMPTY_COPY,
  PropertyPermitLayerPanel,
  formatPropertyPermitClosedDateLabel,
  formatPropertyPermitLayerRowCopy,
  isRoofingPropertyPermitDetail,
  selectRoofingPropertyPermitDetails,
  type PropertyPermitDetail,
} from "../../src/map/PropertyPermitLayerPanel";

afterEach(() => {
  cleanup();
});

/**
 * Stub canvas so jsdom never loads MapLibre GL.
 */
function StubMapLibreMapCanvas(props: MapLibreMapCanvasProps): ReactElement {
  return createElement(
    "button",
    {
      type: "button",
      "data-testid": "map-pin-drop",
      onClick: () => {
        props.onSearchMapCenterDrop({
          latitude: props.mapViewCenter.latitude,
          longitude: props.mapViewCenter.longitude,
        });
      },
    },
    "Drop pin",
  );
}

function dropSearchPin(): void {
  fireEvent.click(screen.getByTestId("map-pin-drop"));
}

function openMapSearchFilterHud(): void {
  fireEvent.click(screen.getByTestId("map-search-filter-hud-toggle"));
}

describe("Permit layer design", () => {
  // Given published permits[] is empty (Lee unserved / no rows)
  // When the permit layer panel renders
  // Then honest empty copy is shown and no fake close dates appear
  it("empty permits[] renders honest empty copy", () => {
    render(
      createElement(PropertyPermitLayerPanel, {
        permits: [],
      }),
    );

    expect(screen.getByTestId("property-permit-layer-empty").textContent).toBe(
      PROPERTY_PERMIT_LAYER_EMPTY_COPY,
    );
    expect(screen.getByTestId("property-permit-layer-empty").textContent).toMatch(
      /no.*roofing permits/i,
    );
    expect(screen.queryByTestId("property-permit-layer-list")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  // Given mixed permit types including roofing
  // When the layer selects candidates for the lead layer
  // Then only /roof/i type or description rows remain
  it("roofing /roof/i type is used when permits exist", () => {
    const permits: PropertyPermitDetail[] = [
      {
        permitId: "BP-roof",
        permitType: "Roofing",
        status: "Open",
        issuedDate: "2018-01-01",
        openedDate: "2018-01-01",
        closedDate: null,
        description: "Re-roof shingles",
        contractorName: "A",
        sourceSystem: null,
        provenanceClass: null,
      },
      {
        permitId: "BP-elec",
        permitType: "Electrical",
        status: "Open",
        issuedDate: "2019-01-01",
        openedDate: "2019-01-01",
        closedDate: null,
        description: "Service upgrade",
        contractorName: "B",
        sourceSystem: null,
        provenanceClass: null,
      },
    ];

    const roofingPermits = selectRoofingPropertyPermitDetails(permits);

    expect(roofingPermits).toHaveLength(1);
    expect(isRoofingPropertyPermitDetail(permits[0]!)).toBe(true);
    expect(isRoofingPropertyPermitDetail(permits[1]!)).toBe(false);

    render(
      createElement(PropertyPermitLayerPanel, {
        permits,
      }),
    );

    expect(screen.getByTestId("property-permit-layer-list").textContent).toMatch(
      /roofing/i,
    );
    expect(screen.getByTestId("property-permit-layer-list").textContent).not.toMatch(
      /electrical/i,
    );
  });

  // Given a roofing permit with null closedDate
  // When closed-date label is formatted for display
  // Then no calendar date is invented
  it("no invented close date on null dates", () => {
    const label = formatPropertyPermitClosedDateLabel(null);

    expect(label).toMatch(/no close date/i);
    expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}/);

    render(
      createElement(PropertyPermitLayerPanel, {
        permits: [
          {
            permitId: "BP-open",
            permitType: "Roofing",
            status: "Open",
            issuedDate: "2015-04-01",
            openedDate: "2015-04-01",
            closedDate: null,
            description: "Roof tear-off",
            contractorName: "Local Roofing Co",
            sourceSystem: null,
            provenanceClass: null,
          },
        ],
      }),
    );

    const row = screen.getByTestId("property-permit-layer-row-BP-open");
    expect(row.textContent).toMatch(/no close date/i);
    expect(row.textContent).not.toMatch(/open · open/i);
    expect(row.textContent).not.toMatch(/closed:\s*\d{4}-\d{2}-\d{2}/i);
  });

  it("formats synthetic demo permits without repeating open status", () => {
    const rowCopy = formatPropertyPermitLayerRowCopy(
      {
        permitId: "SYNTHETIC-lee-prop-browser-verify-1",
        permitType: "Roofing",
        status: "Open",
        issuedDate: "2014-01-01",
        openedDate: "2014-01-01",
        closedDate: null,
        description: "Synthetic demo roofing permit",
        contractorName: "Palmetto Roofing Group",
        sourceSystem: null,
        provenanceClass: "synthetic_demo",
      },
      2026,
    );

    expect(rowCopy).toBe(
      "Roofing · Permit open ~12 yr, no close date on file · Palmetto Roofing Group · Demo data",
    );
  });

  // Given the map search shell mounts for Lee fallback
  // When permit layer chrome renders
  // Then the control is off and the empty strip is not taking map height
  it("defaults permit notes off without a full-width empty strip", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      }),
    );

    openMapSearchFilterHud();

    const permitToggle = screen.getByRole("checkbox", {
      name: /permit open for/i,
    });
    expect(permitToggle).toBeTruthy();
    expect(permitToggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByTestId("property-permit-layer-empty")).toBeNull();
    expect(screen.queryByTestId("property-permit-layer-panel")).toBeNull();
    expect(screen.queryByText(/click the map to set the search center/i)).toBeNull();
  });

  // Given a Lee door is open and permit notes are on
  // When the drawer shows permit notes for that street
  // Then honest empty copy is bound to the street, not a map-wide strip
  it("binds permit notes to the open street drawer", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [
          {
            propertyId: "lee-prop-permit-bind",
            parcelIdentifier: "permit-bind",
            latitude: 26.64,
            longitude: -81.87,
            builtYear: 1990,
            addressStreet: "12 Maple St",
            addressCity: "Fort Myers",
            gisMuni: null,
            distanceMiles: 0.4,
          },
        ],
      }),
    );
    dropSearchPin();

    fireEvent.click(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-permit-bind"),
    );
    openMapSearchFilterHud();
    fireEvent.click(screen.getByRole("checkbox", { name: /permit open for/i }));

    expect(screen.getByTestId("property-permit-layer-panel")).toBeTruthy();
    expect(screen.getByTestId("property-permit-layer-empty").textContent).toBe(
      PROPERTY_PERMIT_LAYER_EMPTY_COPY,
    );
    expect(screen.getByTestId("published-property-drawer").textContent).toMatch(
      /12 maple st/i,
    );
  });

  // Given injected permit summaries for two streets
  // When the long-open permit layer is enabled
  // Then only the qualifying street remains and shows a permit chip
  it("filters the candidate list to long-open roofing permits", () => {
    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [
          {
            propertyId: "lee-prop-short",
            parcelIdentifier: "short",
            latitude: 26.64,
            longitude: -81.87,
            builtYear: 1995,
            addressStreet: "1 Short Permit St",
            addressCity: "Fort Myers",
            gisMuni: null,
            distanceMiles: 0.5,
          },
          {
            propertyId: "lee-prop-long",
            parcelIdentifier: "long",
            latitude: 26.65,
            longitude: -81.86,
            builtYear: 1980,
            addressStreet: "9 Long Permit St",
            addressCity: "Fort Myers",
            gisMuni: null,
            distanceMiles: 0.8,
          },
        ],
        propertyPermitDetailsByPropertyId: {
          "lee-prop-short": [
            {
              permitId: "BP-short",
              permitType: "Roofing",
              status: "Open",
              issuedDate: "2023-01-01",
              openedDate: "2023-01-01",
              closedDate: null,
              description: "Re-roof",
              contractorName: "Short Co",
              sourceSystem: null,
              provenanceClass: null,
            },
          ],
          "lee-prop-long": [
            {
              permitId: "BP-long",
              permitType: "Roofing",
              status: "Open",
              issuedDate: "2014-01-01",
              openedDate: "2014-01-01",
              closedDate: null,
              description: "Roof tear-off",
              contractorName: "Long Co",
              sourceSystem: null,
              provenanceClass: null,
            },
          ],
        },
      }),
    );
    dropSearchPin();

    openMapSearchFilterHud();
    fireEvent.click(screen.getByRole("checkbox", { name: /permit open for/i }));

    expect(
      screen.queryByTestId("search-in-radius-candidate-row-lee-prop-short"),
    ).toBeNull();
    expect(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-long"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("search-in-radius-candidate-permit-chip-lee-prop-long")
        .textContent,
    ).toMatch(/Permit open · 12 yr/i);
  });

  it("re-filters candidates when the minimum open-permit years threshold increases", () => {
    const candidates = [
      {
        propertyId: "lee-prop-long",
        parcelIdentifier: "long",
        latitude: 26.65,
        longitude: -81.86,
        builtYear: 1980,
        addressStreet: "9 Long Permit St",
        addressCity: "Fort Myers",
        gisMuni: null,
        distanceMiles: 0.8,
      },
    ];
    const permitDetailsByPropertyId = {
      "lee-prop-long": [
        {
          permitId: "BP-long",
          permitType: "Roofing",
          status: "Open",
          issuedDate: "2014-01-01",
          openedDate: "2014-01-01",
          closedDate: null,
          description: "Roof tear-off",
          contractorName: "Long Co",
          sourceSystem: null,
          provenanceClass: null,
        },
      ],
    };

    const atFiveYears = selectSearchInRadiusCandidatesForPermitLayer({
      searchInRadiusCandidates: candidates,
      propertyPermitLayerEnabled: true,
      permitDetailsByPropertyId,
      minOpenPermitYears: 5,
      currentUtcYear: 2026,
    });
    const atThirteenYears = selectSearchInRadiusCandidatesForPermitLayer({
      searchInRadiusCandidates: candidates,
      propertyPermitLayerEnabled: true,
      permitDetailsByPropertyId,
      minOpenPermitYears: 13,
      currentUtcYear: 2026,
    });

    expect(atFiveYears).toHaveLength(1);
    expect(atThirteenYears).toHaveLength(0);
  });
});
