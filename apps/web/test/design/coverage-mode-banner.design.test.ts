/**
 * Design tests for coverage-mode honesty (Lee fallback vs Chester / Montgomery).
 *
 * Territory heading names the served place; a visible coverage sentence sits
 * under the h1. Chester and Montgomery also keep copy under roofs-in-radius.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { CoverageModeBanner } from "../../src/chrome/CoverageModeBanner";
import { OperateWorkspaceHeader } from "../../src/chrome/OperateWorkspaceHeader";
import {
  CHESTER_PARCEL_COUNT,
  MONTGOMERY_ROOF_AGE_DEMO_PARCEL_COUNT,
  resolveCoverageModeBannerCopy,
  resolveTerritoryHeading,
} from "../../src/chrome/coverage-mode-banner-copy";
import type { PublishedCountyCatalogListItem } from "../../src/chrome/published-county-catalog-list-item";

afterEach(() => {
  cleanup();
});

const LEE_OVERLAY_CATALOG_LIST_FIXTURE: PublishedCountyCatalogListItem[] = [
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

function visibleTextContent(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".sr-only").forEach((node) => {
    node.remove();
  });
  return clone.textContent ?? "";
}

describe("CoverageModeBanner design", () => {
  it("mentions Chester unpublished when coverage is lee_dev_fallback", () => {
    // Given the published catalog omits Chester (Lee is the served default)
    // When the coverage note renders in lee_dev_fallback
    render(
      createElement(CoverageModeBanner, {
        coverageMode: "lee_dev_fallback",
      }),
    );

    // Then the heading owns Lee and the note names Chester as unpublished
    expect(resolveTerritoryHeading("lee_dev_fallback")).toMatch(/lee county,\s*fl/i);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/chester/i);
    expect(banner.textContent).toMatch(/not in the published catalog|unpublished/i);
    expect(banner.textContent).not.toMatch(/lee county,\s*fl/i);
  });

  it("mentions 87274 and 42 of 73 when coverage is chester_real_limited", () => {
    // Given Chester (real) is the served default
    // When the coverage note renders in chester_real_limited
    const { unmount } = render(
      createElement(CoverageModeBanner, {
        coverageMode: "chester_real_limited",
      }),
    );

    // Then the heading names Chester (real) and the note carries honesty copy
    expect(resolveTerritoryHeading("chester_real_limited")).toBe("Chester (real)");
    const chesterBanner = screen.getByRole("status");
    expect(chesterBanner.textContent).toMatch(/87,?274/);
    expect(chesterBanner.textContent).toMatch(/42 of 73/i);
    expect(chesterBanner.textContent).toMatch(/no published roof ages/i);
    unmount();

    // And when Lee fallback is shown instead, 87,274 is not claimed as current coverage
    render(
      createElement(CoverageModeBanner, {
        coverageMode: "lee_dev_fallback",
      }),
    );
    const leeBanner = screen.getByRole("status");
    expect(leeBanner.textContent).not.toMatch(/87,?274/);
    expect(String(CHESTER_PARCEL_COUNT)).toBe("87274");
  });

  it("uses verbatim demo labeling when coverage is chester_demo_synthetic", () => {
    render(
      createElement(CoverageModeBanner, {
        coverageMode: "chester_demo_synthetic",
      }),
    );

    expect(resolveTerritoryHeading("chester_demo_synthetic")).toBe(
      "Chester (demo data)",
    );
    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/87,?274/);
    expect(banner.textContent).toMatch(/42 of 73 municipalities/i);
    expect(banner.textContent).toMatch(/Synthetic data for evaluation\./);
  });

  it("does not label Lee as Chester County PA", () => {
    // Given Lee is the served county
    // When banner copy is resolved for lee_dev_fallback
    const copy = resolveCoverageModeBannerCopy("lee_dev_fallback");

    // Then the served place is Lee County, FL — not Chester County, PA
    expect(resolveTerritoryHeading("lee_dev_fallback")).toBe("Lee County, FL");
    expect(resolveTerritoryHeading("lee_dev_fallback")).not.toMatch(/chester/i);
    expect(copy).not.toMatch(/chester county,\s*pa/i);
    expect(copy).not.toMatch(/chester county pa/i);

    render(
      createElement(CoverageModeBanner, {
        coverageMode: "lee_dev_fallback",
      }),
    );
    const banner = screen.getByRole("status");
    expect(banner.textContent).not.toMatch(/chester county,\s*pa/i);
  });

  it("mentions partial roll and roof-age demo when coverage is montgomery_roof_age_demo", () => {
    render(
      createElement(CoverageModeBanner, {
        coverageMode: "montgomery_roof_age_demo",
      }),
    );

    expect(resolveTerritoryHeading("montgomery_roof_age_demo")).toBe(
      "Montgomery County, PA",
    );
    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/26,?444/);
    expect(banner.textContent).toMatch(/11 of 62 munis/i);
    expect(banner.textContent).toMatch(/roof-age demo only/i);
    expect(banner.textContent).toMatch(/no permits/i);
    expect(banner.textContent).toMatch(/not on the oracle catalog/i);
    expect(String(MONTGOMERY_ROOF_AGE_DEMO_PARCEL_COUNT)).toBe("26444");
    expect(resolveCoverageModeBannerCopy("montgomery_roof_age_demo")).toMatch(
      /no permits/i,
    );
  });

  it("Lee coverage chip text is in the document and not solely sr-only", () => {
    // Given Lee is the served map-ready county
    render(
      createElement(CoverageModeBanner, {
        coverageMode: "lee_dev_fallback",
      }),
    );

    // Then the coverage sentence is readable, not screen-reader-only
    const banner = screen.getByTestId("coverage-mode-banner");
    expect(visibleTextContent(banner)).toMatch(/chester unpublished/i);
    expect(banner.querySelector(".sr-only")).toBeNull();
  });

  it("chip is in the header title block below the picker", () => {
    // Given the operate workspace title block with Lee coverage
    render(
      createElement(OperateWorkspaceHeader, {
        operatorLede: "Walk the radius. Convert a roof.",
        publishedCountyCatalogListItems: LEE_OVERLAY_CATALOG_LIST_FIXTURE,
        selectedCountyKey: "lee",
        onSelectedCountyKeyChange: () => {},
        coverageMode: "lee_dev_fallback",
      }),
    );

    // Then the coverage sentence sits in the header under the territory heading
    const header = screen.getByTestId("operate-workspace-header");
    const picker = screen.getByTestId("territory-county-catalog-picker");
    const banner = screen.getByTestId("coverage-mode-banner");
    expect(header.contains(picker)).toBe(true);
    expect(header.contains(banner)).toBe(true);
    expect(picker.closest("h1")?.contains(banner)).toBe(false);
    expect(visibleTextContent(banner)).toMatch(/chester unpublished/i);
  });

  it("opening the picker does not unmount the chip", () => {
    // Given the title-block coverage chip is showing for Lee
    render(
      createElement(OperateWorkspaceHeader, {
        operatorLede: "Walk the radius. Convert a roof.",
        publishedCountyCatalogListItems: LEE_OVERLAY_CATALOG_LIST_FIXTURE,
        selectedCountyKey: "lee",
        onSelectedCountyKeyChange: () => {},
        coverageMode: "lee_dev_fallback",
      }),
    );

    // When the operator opens the territory listbox
    fireEvent.click(screen.getByTestId("territory-county-catalog-picker"));

    // Then the coverage sentence stays in the header while counties are listed
    expect(screen.getByRole("listbox")).toBeTruthy();
    const banner = screen.getByTestId("coverage-mode-banner");
    expect(screen.getByTestId("operate-workspace-header").contains(banner)).toBe(true);
    expect(visibleTextContent(banner)).toMatch(/chester unpublished/i);
  });

  it("header omits published-pilot chip when overlay Chester is selected", () => {
    render(
      createElement(OperateWorkspaceHeader, {
        operatorLede: "Walk the radius. Convert a roof.",
        publishedCountyCatalogListItems: LEE_OVERLAY_CATALOG_LIST_FIXTURE,
        selectedCountyKey: "chester",
        onSelectedCountyKeyChange: () => {},
        coverageMode: null,
      }),
    );

    expect(screen.queryByTestId("coverage-mode-banner")).toBeNull();
    expect(screen.getByTestId("territory-county-catalog-picker").textContent).toMatch(
      /chester \(real\)/i,
    );
  });
});
