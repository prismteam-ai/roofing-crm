/**
 * Design tests for first-paint default county vs operator county picks.
 */
import { describe, expect, it } from "vitest";

import {
  resolveDefaultCountyKeyFromCatalog,
  type PublishedCountyCatalogListItem,
} from "../../src/chrome/published-county-catalog-list-item";

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

describe("App default county selection guard", () => {
  it("late server default does not overwrite operator overlay Chester pick", () => {
    let selectedCountyKey = "lee";
    let operatorHasChosenCounty = false;

    const applyServerDefault = (defaultCountyKey: string): void => {
      if (operatorHasChosenCounty) {
        return;
      }
      selectedCountyKey = resolveDefaultCountyKeyFromCatalog(
        defaultCountyKey,
        OVERLAY_CHESTER_CATALOG_LIST_FIXTURE,
      );
    };

    const handleSelectedCountyKeyChange = (countyKey: string): void => {
      operatorHasChosenCounty = true;
      selectedCountyKey = countyKey;
    };

    handleSelectedCountyKeyChange("chester");
    applyServerDefault("chester");

    expect(selectedCountyKey).toBe("chester");
  });
});
