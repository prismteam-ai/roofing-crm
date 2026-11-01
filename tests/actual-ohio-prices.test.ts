import { expect, it } from "vitest";
import captured from "./fixtures/aws-bedrock-ohio-20261028.json" with { type: "json" };
import {
  parseRegionalPriceList,
  REGIONAL_PRICE_LIST_URL,
} from "../packages/agent/src/prices";
import { MICRO_MODEL, LITE_MODEL } from "../packages/runtime-config/src/index";
const at = Date.parse(captured.provenance.capturedAt);
it("parses the actual captured Ohio direct on-demand products and terms independently of synthetic fixtures", () => {
  expect(captured.provenance.sourceUrl).toBe(REGIONAL_PRICE_LIST_URL);
  expect(captured.provenance.fullCatalogSha256).toBe(
    "a70d0dc26904126b0c892fb56c77390ca481d483a4977bb4eda3bb123cfda71b",
  );
  expect(captured.provenance.fullCatalogBytes).toBe(1257350);
  expect(
    parseRegionalPriceList(
      captured.catalog,
      MICRO_MODEL,
      at,
      captured.provenance.fullCatalogSha256,
    ),
  ).toMatchObject({
    region: "us-east-2",
    inputUsdPerMillion: 0.035,
    outputUsdPerMillion: 0.14,
    priceListVersion: "20261028192216",
    priceSkus: { input: "5UG3KNNU32Z3GKP2", output: "JG8SSMVQ7JJMK7UN" },
  });
  expect(
    parseRegionalPriceList(
      captured.catalog,
      LITE_MODEL,
      at,
      captured.provenance.fullCatalogSha256,
    ),
  ).toMatchObject({
    region: "us-east-2",
    inputUsdPerMillion: 0.06,
    outputUsdPerMillion: 0.24,
    priceSkus: { input: "68N2Y76KQKQ4CEB8", output: "T4U7KW6SXXKERZG3" },
  });
});
it("rejects the real cheaper cache rate as a substitute for the captured input SKU, and refuses a cross-region usage type", () => {
  const replaced = structuredClone(captured.catalog) as {
    products: Record<string, unknown>;
    terms: { OnDemand: Record<string, unknown> };
  };
  delete replaced.products["5UG3KNNU32Z3GKP2"];
  delete replaced.terms.OnDemand["5UG3KNNU32Z3GKP2"];
  replaced.products[captured.excludedCacheCandidate.product.sku] =
    captured.excludedCacheCandidate.product;
  replaced.terms.OnDemand[captured.excludedCacheCandidate.product.sku] =
    captured.excludedCacheCandidate.terms;
  expect(() =>
    parseRegionalPriceList(
      replaced,
      MICRO_MODEL,
      at,
      captured.provenance.fullCatalogSha256,
    ),
  ).toThrow("prices are unavailable");
  const wrongRegion = structuredClone(captured.catalog);
  wrongRegion.products["5UG3KNNU32Z3GKP2"].attributes.usagetype =
    "USE1-NovaMicro-input-tokens";
  expect(() =>
    parseRegionalPriceList(
      wrongRegion,
      MICRO_MODEL,
      at,
      captured.provenance.fullCatalogSha256,
    ),
  ).toThrow("prices are unavailable");
});
