/**
 * Favicon and header brand share the map-center Target mark.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { OperateWorkspaceHeader } from "../../src/chrome/OperateWorkspaceHeader";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

afterEach(() => {
  cleanup();
});

describe("favicon", () => {
  it("index.html links the plat target icon for tabs and home screens", () => {
    const html = readFileSync(join(webRoot, "index.html"), "utf8");

    expect(html).toContain('rel="icon" href="/favicon.svg" type="image/svg+xml"');
    expect(html).toContain('rel="icon" href="/favicon.ico" sizes="32x32"');
    expect(html).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(html).toContain('name="theme-color" content="#e8e2d6"');
  });

  it("favicon.svg is the map-center target on linen plat paper", () => {
    const svg = readFileSync(join(webRoot, "public/favicon.svg"), "utf8");

    expect(svg).toContain('r="10"');
    expect(svg).toContain('r="6"');
    expect(svg).toContain('r="2"');
    expect(svg).toContain("#e8e2d6");
    expect(svg).toContain("#2c2a26");
    expect(svg).not.toContain("M3.2 11.1");
  });

  it("header brand sits the same target mark to the left of RoofRadar", () => {
    render(
      createElement(OperateWorkspaceHeader, {
        operatorLede: "Walk the radius. Convert a roof.",
        publishedCountyCatalogListItems: [
          {
            countyKey: "lee",
            countyName: "Lee",
            stateCode: "FL",
            propertyDatasetAvailable: true,
            mapSearchReady: true,
          },
        ],
        selectedCountyKey: "lee",
        onSelectedCountyKeyChange: () => {},
        coverageMode: null,
      }),
    );

    const brand = screen.getByTestId("roof-radar-brand");
    expect(brand.textContent).toMatch(/roofradar/i);
    expect(brand.querySelector("svg")).toBeTruthy();
  });
});
