/**
 * Design tests for the territory county catalog picker.
 *
 * The heading lists catalog counties, filters them before selection, and on
 * first paint keeps a map-ready county when defaultCounty names overlay Chester.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { TerritoryCountyCatalogPicker } from "../../src/chrome/TerritoryCountyCatalogPicker";
import {
  filterPublishedCountyCatalogListItems,
  formatTerritoryCountyHeading,
  LEE_FALLBACK_PUBLISHED_COUNTY_CATALOG_LIST,
  resolveCoverageModeForCountyKey,
  resolveDefaultCountyKeyFromCatalog,
  resolveMapSearchReadyCountyKeyFallback,
  type PublishedCountyCatalogListItem,
} from "../../src/chrome/published-county-catalog-list-item";

afterEach(() => {
  cleanup();
});

const PUBLISHED_COUNTY_CATALOG_LIST_FIXTURE: PublishedCountyCatalogListItem[] = [
  {
    countyKey: "lee",
    countyName: "Lee",
    stateCode: "FL",
    propertyDatasetAvailable: true,
    mapSearchReady: true,
  },
  {
    countyKey: "miami-dade",
    countyName: "Miami-Dade",
    stateCode: "FL",
    propertyDatasetAvailable: true,
    mapSearchReady: true,
  },
  {
    countyKey: "rock-island",
    countyName: "Rock Island",
    stateCode: "IL",
    propertyDatasetAvailable: true,
    mapSearchReady: true,
  },
];

const OVERLAY_CHESTER_CATALOG_LIST_FIXTURE: PublishedCountyCatalogListItem[] = [
  {
    countyKey: "lee",
    countyName: "Lee",
    stateCode: "FL",
    propertyDatasetAvailable: true,
    mapSearchReady: true,
  },
  {
    countyKey: "chester",
    countyName: "Chester",
    stateCode: "PA",
    propertyDatasetAvailable: true,
    mapSearchReady: false,
  },
];

describe("TerritoryCountyCatalogPicker design", () => {
  it("opens a filterable catalog list from the territory heading", () => {
    // Given Lee is the selected published county
    const selectedCountyKeys: string[] = [];
    render(
      createElement(TerritoryCountyCatalogPicker, {
        publishedCountyCatalogListItems: PUBLISHED_COUNTY_CATALOG_LIST_FIXTURE,
        selectedCountyKey: "lee",
        onSelectedCountyKeyChange: (countyKey) => {
          selectedCountyKeys.push(countyKey);
        },
      }),
    );

    // When the operator opens the heading and filters for Miami
    fireEvent.click(screen.getByTestId("territory-county-catalog-picker"));
    fireEvent.change(screen.getByTestId("territory-county-catalog-filter"), {
      target: { value: "miami" },
    });

    // Then only Miami-Dade remains and selecting it notifies the parent
    expect(screen.getByRole("option", { name: /miami-dade county, fl/i })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /lee county, fl/i })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /miami-dade county, fl/i }));
    expect(selectedCountyKeys).toEqual(["miami-dade"]);
  });

  it("formats catalog headings without labeling Lee as Chester", () => {
    // Given published catalog rows including Lee and Chester
    // When headings are resolved
    const leeHeading = formatTerritoryCountyHeading(
      PUBLISHED_COUNTY_CATALOG_LIST_FIXTURE[0] as PublishedCountyCatalogListItem,
    );
    const chesterHeading = formatTerritoryCountyHeading({
      countyKey: "chester",
      countyName: "Chester",
      stateCode: "PA",
      propertyDatasetAvailable: true,
      mapSearchReady: false,
    });

    // Then Lee stays Lee County, FL and Chester names real vs demo labels
    expect(leeHeading).toBe("Lee County, FL");
    expect(leeHeading).not.toMatch(/chester/i);
    expect(chesterHeading).toBe("Chester (real)");
    expect(
      formatTerritoryCountyHeading({
        countyKey: "chester-demo",
        countyName: "Chester (demo data)",
        stateCode: "PA",
        propertyDatasetAvailable: true,
        mapSearchReady: true,
      }),
    ).toBe("Chester (demo data)");
    const montgomeryHeading = formatTerritoryCountyHeading({
      countyKey: "montgomery",
      countyName: "Montgomery",
      stateCode: "PA",
      propertyDatasetAvailable: true,
      mapSearchReady: false,
    });
    expect(montgomeryHeading).toBe("Montgomery County, PA");
    expect(resolveCoverageModeForCountyKey("lee")).toBe("lee_dev_fallback");
    expect(resolveCoverageModeForCountyKey("montgomery")).toBe(
      "montgomery_roof_age_demo",
    );
    expect(resolveCoverageModeForCountyKey("montgomery", false)).toBeNull();
    expect(resolveCoverageModeForCountyKey("chester", false)).toBeNull();
    expect(resolveCoverageModeForCountyKey("chester")).toBe("chester_real_limited");
    expect(resolveCoverageModeForCountyKey("chester-demo")).toBe(
      "chester_demo_synthetic",
    );
    expect(resolveCoverageModeForCountyKey("miami-dade")).toBeNull();
    expect(
      filterPublishedCountyCatalogListItems(
        [
          {
            countyKey: "lee",
            countyName: "Lee",
            stateCode: "FL",
            propertyDatasetAvailable: true,
            mapSearchReady: true,
          },
          {
            countyKey: "chester",
            countyName: "Chester (real)",
            stateCode: "PA",
            propertyDatasetAvailable: true,
            mapSearchReady: true,
          },
          {
            countyKey: "chester-demo",
            countyName: "Chester (demo data)",
            stateCode: "PA",
            propertyDatasetAvailable: true,
            mapSearchReady: true,
          },
        ],
        "",
      ).map((item) => item.countyKey),
    ).toEqual(["chester-demo", "chester", "lee"]);
    expect(
      filterPublishedCountyCatalogListItems(
        PUBLISHED_COUNTY_CATALOG_LIST_FIXTURE,
        "illinois",
      ),
    ).toHaveLength(0);
    expect(
      filterPublishedCountyCatalogListItems(
        PUBLISHED_COUNTY_CATALOG_LIST_FIXTURE,
        "IL",
      ).map((item) => item.countyKey),
    ).toEqual(["rock-island"]);
  });

  it("keeps lee selected when defaultCounty names overlay chester", () => {
    // Given overlay Chester is listable but not map-ready
    // When first paint resolves the default county key
    const resolvedCountyKey = resolveDefaultCountyKeyFromCatalog(
      "chester",
      OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
    );

    // Then the selected key stays lee
    expect(resolvedCountyKey).toBe("lee");
  });

  it("selects lee when defaultCounty is lee and map-ready", () => {
    // Given lee is map-ready in the catalog
    // When first paint resolves the default county key
    const resolvedCountyKey = resolveDefaultCountyKeyFromCatalog(
      "lee",
      OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
    );

    // Then the selected key is lee
    expect(resolvedCountyKey).toBe("lee");
  });

  it("falls back to a map-ready county when default fetch would leave overlay selected", () => {
    // Given the catalog list fell back to Lee-only after defaultCounty failed
    const fallbackCountyKey = resolveMapSearchReadyCountyKeyFallback(
      "chester",
      LEE_FALLBACK_PUBLISHED_COUNTY_CATALOG_LIST,
    );

    // Then the fallback list still names a map-ready county
    expect(fallbackCountyKey).toBe("lee");
    expect(
      formatTerritoryCountyHeading(LEE_FALLBACK_PUBLISHED_COUNTY_CATALOG_LIST[0]),
    ).toBe("Lee County, FL");
  });

  it("keeps overlay chester selected when it is listed in the catalog", () => {
    // Given overlay Chester is listable
    // When the operator has already chosen that row
    const selectedCountyKey = resolveMapSearchReadyCountyKeyFallback(
      "chester",
      OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
    );

    // Then the selection stays on Chester instead of snapping back to Lee
    expect(selectedCountyKey).toBe("chester");
  });

  it("shows Lee County, FL on first paint when overlay chester is the API default", () => {
    // Given overlay Chester is the defaultCounty key but not map-ready
    const firstPaintCountyKey = resolveDefaultCountyKeyFromCatalog(
      "chester",
      OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
    );
    render(
      createElement(TerritoryCountyCatalogPicker, {
        publishedCountyCatalogListItems: OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
        selectedCountyKey: firstPaintCountyKey,
        onSelectedCountyKeyChange: () => {},
      }),
    );

    // Then the territory heading names Lee County, FL
    const picker = screen.getByTestId("territory-county-catalog-picker");
    expect(picker.textContent).toContain("Lee County, FL");
    expect(picker.textContent).not.toMatch(/west chester/i);
  });

  it("overlay chester option is not aria-disabled", () => {
    // Given overlay Chester is listable but not map-ready
    render(
      createElement(TerritoryCountyCatalogPicker, {
        publishedCountyCatalogListItems: OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
        selectedCountyKey: "lee",
        onSelectedCountyKeyChange: () => {},
      }),
    );

    // When the operator opens the territory heading
    fireEvent.click(screen.getByTestId("territory-county-catalog-picker"));

    // Then Chester stays selectable instead of looking like a broken tab
    const chesterOption = screen.getByRole("option", {
      name: /chester \(real\)/i,
    });
    expect(chesterOption.getAttribute("aria-disabled")).not.toBe("true");
    expect(chesterOption.hasAttribute("disabled")).toBe(false);
  });

  it("overlay chester option includes not-map-ready copy", () => {
    // Given overlay Chester is listable but not map-ready
    render(
      createElement(TerritoryCountyCatalogPicker, {
        publishedCountyCatalogListItems: OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
        selectedCountyKey: "lee",
        onSelectedCountyKeyChange: () => {},
      }),
    );

    // When the operator opens the territory heading
    fireEvent.click(screen.getByTestId("territory-county-catalog-picker"));

    // Then Chester names the quiet not-map-ready note
    const chesterOption = screen.getByRole("option", {
      name: /chester \(real\)/i,
    });
    expect(chesterOption.textContent).toMatch(/not on the published map yet/i);
  });

  it("lee option has no not-map-ready copy", () => {
    // Given Lee is map-ready in the catalog
    render(
      createElement(TerritoryCountyCatalogPicker, {
        publishedCountyCatalogListItems: OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
        selectedCountyKey: "lee",
        onSelectedCountyKeyChange: () => {},
      }),
    );

    // When the operator opens the territory heading
    fireEvent.click(screen.getByTestId("territory-county-catalog-picker"));

    // Then Lee has no overlay-only note
    const leeOption = screen.getByRole("option", { name: /lee county, fl/i });
    expect(leeOption.textContent).not.toMatch(/not on the published map yet/i);
  });

  it("heading becomes Chester (real) after overlay select", () => {
    // Given Lee is selected and overlay Chester is listed
    let selectedCountyKey = "lee";
    const { rerender } = render(
      createElement(TerritoryCountyCatalogPicker, {
        publishedCountyCatalogListItems: OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
        selectedCountyKey,
        onSelectedCountyKeyChange: (countyKey) => {
          selectedCountyKey = countyKey;
        },
      }),
    );

    // When the operator chooses Chester (real)
    fireEvent.click(screen.getByTestId("territory-county-catalog-picker"));
    fireEvent.click(screen.getByRole("option", { name: /chester \(real\)/i }));
    rerender(
      createElement(TerritoryCountyCatalogPicker, {
        publishedCountyCatalogListItems: OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
        selectedCountyKey,
        onSelectedCountyKeyChange: (countyKey) => {
          selectedCountyKey = countyKey;
        },
      }),
    );

    // Then the heading names Chester (real)
    expect(selectedCountyKey).toBe("chester");
    expect(screen.getByTestId("territory-county-catalog-picker").textContent).toMatch(
      /chester \(real\)/i,
    );
  });
});
