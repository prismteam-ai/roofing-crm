/**
 * Design tests for live properties.get drawer enrichment.
 *
 * MapLibre is stubbed; asserts the shell calls properties.get on row select and
 * renders permit status, open duration, contractor, and BBB from the response.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";
import type {
  PropertiesGetApiClient,
  PropertiesGetResult,
} from "../../src/map/create-http-properties-get-api-client";
import type { SearchInRadiusCandidate } from "../../src/map/SearchInRadiusCandidateList";

afterEach(() => {
  cleanup();
});

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

const SAMPLE_CANDIDATE: SearchInRadiusCandidate = {
  propertyId: "lee-prop-permit-live",
  parcelIdentifier: "permit-live",
  latitude: 26.64,
  longitude: -81.87,
  builtYear: 1990,
  addressStreet: "88 Permit Ln",
  addressCity: "Fort Myers",
  gisMuni: null,
  distanceMiles: 0.5,
};

function createMockPropertiesGetApiClient(
  result: PropertiesGetResult,
): PropertiesGetApiClient {
  return {
    async getProperty() {
      return result;
    },
  };
}

describe("Property drawer properties.get design", () => {
  // Given a live properties.get client returns roofing permits and BBB
  // When the user opens a candidate row with permit notes enabled
  // Then the drawer shows contractor, open duration, and BBB rating
  it("loads properties.get on row select and renders permit detail", async () => {
    const propertiesGetResult: PropertiesGetResult = {
      propertyId: "lee-prop-permit-live",
      county: "lee",
      parcelIdentifier: "permit-live",
      addressStreet: "88 Permit Ln",
      addressCity: "Fort Myers",
      addressZip: "33901",
      latitude: 26.64,
      longitude: -81.87,
      builtYear: 1990,
      builtYearSource: null,
      roofAgeBasis: "structure_year_built",
      hasPermits: true,
      permitCount: 1,
      permitDetailsSource: "consolidated_permits",
      hasBbbContractor: true,
      bbb: { ratingLetter: "A", ratingScore: 92 },
      permits: [
        {
          permitId: "BP-2015-roof",
          permitType: "Roofing",
          status: "Open",
          issuedDate: "2015-04-01",
          openedDate: "2015-04-01",
          closedDate: null,
          description: "Roof tear-off",
          contractorName: "Gulf Coast Roofing",
          sourceSystem: null,
          provenanceClass: null,
        },
      ],
    };

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [SAMPLE_CANDIDATE],
        propertiesGetApiClient: createMockPropertiesGetApiClient(propertiesGetResult),
        propertyPermitDetailsByPropertyId: {
          "lee-prop-permit-live": propertiesGetResult.permits,
        },
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));

    fireEvent.click(screen.getByRole("checkbox", { name: /permit open for/i }));
    await waitFor(() => {
      expect(
        screen.getByTestId("search-in-radius-candidate-row-lee-prop-permit-live"),
      ).toBeTruthy();
    });
    fireEvent.click(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-permit-live"),
    );

    await waitFor(() => {
      expect(screen.getByTestId("property-permit-layer-list")).toBeTruthy();
    });

    const permitRow = screen.getByTestId("property-permit-layer-row-BP-2015-roof");
    expect(permitRow.textContent).toMatch(/gulf coast roofing/i);
    expect(permitRow.textContent).toMatch(/Permit open ~\d+ yr/i);
    expect(screen.getByTestId("published-property-drawer-bbb").textContent).toMatch(
      /A/,
    );
  });

  it("shows synthetic demo label when permitDetailsSource is synthetic_demo", async () => {
    const propertiesGetResult: PropertiesGetResult = {
      propertyId: "lee-prop-permit-live",
      county: "lee",
      parcelIdentifier: "permit-live",
      addressStreet: "88 Permit Ln",
      addressCity: "Fort Myers",
      addressZip: "33901",
      latitude: 26.64,
      longitude: -81.87,
      builtYear: 1990,
      builtYearSource: null,
      roofAgeBasis: "structure_year_built",
      hasPermits: true,
      permitCount: 1,
      permitDetailsSource: "synthetic_demo",
      hasBbbContractor: true,
      bbb: { ratingLetter: "A", ratingScore: 92 },
      permits: [
        {
          permitId: "SYNTHETIC-lee-prop-permit-live-1",
          permitType: "Roofing",
          status: "Open",
          issuedDate: "2015-04-01",
          openedDate: "2015-04-01",
          closedDate: null,
          description: "Synthetic demo roofing permit",
          contractorName: "Gulf Coast Roofing LLC",
          sourceSystem: null,
          provenanceClass: null,
        },
      ],
    };

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [SAMPLE_CANDIDATE],
        propertiesGetApiClient: createMockPropertiesGetApiClient(propertiesGetResult),
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));
    fireEvent.click(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-permit-live"),
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("published-property-drawer-synthetic-demo").textContent,
      ).toBe("Synthetic data for evaluation.");
    });
    expect(screen.queryByTestId("property-permit-layer-synthetic-demo")).toBeNull();
  });

  // Given properties.get fails for the selected parcel
  // When the drawer opens
  // Then an honest error is shown without inventing permits or BBB
  it("shows an error when properties.get fails", async () => {
    const failingClient: PropertiesGetApiClient = {
      async getProperty() {
        throw new Error("properties.get failed: upstream timeout");
      },
    };

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [SAMPLE_CANDIDATE],
        propertiesGetApiClient: failingClient,
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));

    fireEvent.click(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-permit-live"),
    );

    await waitFor(() => {
      expect(screen.getByTestId("published-property-detail-error")).toBeTruthy();
    });

    expect(screen.getByTestId("published-property-detail-error").textContent).toMatch(
      /could not load property details/i,
    );
    expect(screen.queryByTestId("published-property-drawer-bbb")).toBeNull();
  });

  it("does not immediately retry properties.get after a permanent Oracle miss", async () => {
    let getPropertyCallCount = 0;
    const failingClient: PropertiesGetApiClient = {
      async getProperty() {
        getPropertyCallCount += 1;
        throw new Error("getOracleProperty payload missing propertyId");
      },
    };

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [SAMPLE_CANDIDATE],
        propertiesGetApiClient: failingClient,
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));

    fireEvent.click(
      screen.getByTestId("search-in-radius-candidate-row-lee-prop-permit-live"),
    );

    await waitFor(() => {
      expect(screen.getByTestId("published-property-detail-error")).toBeTruthy();
    });

    const callsWhenErrorAppeared = getPropertyCallCount;
    expect(callsWhenErrorAppeared).toBeGreaterThanOrEqual(1);

    await new Promise((resolve) => {
      window.setTimeout(resolve, 80);
    });

    expect(getPropertyCallCount).toBe(callsWhenErrorAppeared);
    expect(getPropertyCallCount).toBe(1);
  });
});
