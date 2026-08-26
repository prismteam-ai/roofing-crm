import { describe, expect, it } from "vitest";
import {
  listPublishedCounties,
  parsePublishedCountyCatalog,
} from "./published-county-catalog.js";

describe("parsePublishedCountyCatalog", () => {
  // Given a live-shaped catalog payload with lee and no chester
  // When parsePublishedCountyCatalog runs
  // Then only listed keys appear and propertyDatasetAvailable follows queryTableUrl
  it("maps catalog counties and property table availability", () => {
    const entries = parsePublishedCountyCatalog({
      counties: [
        {
          countyKey: "Lee",
          stateCode: "FL",
          queryTableUrl: "https://example.invalid/lee",
        },
        {
          countyKey: "chester",
          stateCode: "PA",
          queryTableUrl: null,
        },
        {
          countyKey: "miami-dade",
          stateCode: "FL",
        },
      ],
    });

    expect(entries).toEqual([
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
        propertyDatasetAvailable: false,
        mapSearchReady: false,
      },
      {
        countyKey: "miami-dade",
        countyName: "Miami-Dade",
        stateCode: "FL",
        propertyDatasetAvailable: false,
        mapSearchReady: false,
      },
    ]);
  });
});

describe("listPublishedCounties", () => {
  // Given an injectable catalog loader
  // When listPublishedCounties runs
  // Then it returns parsed entries from that payload
  it("loads via injectable transport", async () => {
    const entries = await listPublishedCounties(async () => ({
      counties: [
        {
          countyKey: "lee",
          stateCode: "FL",
          queryTableUrl: "https://example.invalid/lee",
        },
      ],
    }));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.countyKey).toBe("lee");
    expect(entries[0]?.propertyDatasetAvailable).toBe(true);
  });
});
