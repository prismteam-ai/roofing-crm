import { describe, it, expect, vi } from "vitest";
import {
  parseRegionalPriceList,
  verifiedPriceProvider,
  refreshRegionalPrice,
  REGIONAL_PRICE_LIST_URL,
} from "../packages/agent/src/prices";
import { MICRO_MODEL, LITE_MODEL } from "../packages/runtime-config/src/index";
const now = Date.parse("2026-10-28T02:00:00Z"),
  digest = "a".repeat(64);
function fixture() {
  const products: Record<string, unknown> = {},
    terms: Record<string, unknown> = {};
  for (const [model, token, side, sku, usd] of [
    ["Nova Micro", "NovaMicro", "input", "5UG3KNNU32Z3GKP2", "0.000035"],
    ["Nova Micro", "NovaMicro", "output", "JG8SSMVQ7JJMK7UN", "0.00014"],
    ["Nova Lite", "NovaLite", "input", "68N2Y76KQKQ4CEB8", "0.00006"],
    ["Nova Lite", "NovaLite", "output", "T4U7KW6SXXKERZG3", "0.00024"],
  ]) {
    products[sku] = {
      sku,
      attributes: {
        servicecode: "AmazonBedrock",
        regionCode: "us-east-2",
        feature: "On-demand Inference",
        model,
        usagetype: `USE2-${token}-${side}-tokens`,
        inferenceType: side === "input" ? "Input tokens" : "Output tokens",
      },
    };
    terms[sku] = {
      term: {
        sku,
        effectiveDate: "2026-10-16T00:00:00Z",
        priceDimensions: {
          rate: {
            unit: "1K tokens",
            beginRange: "0",
            endRange: "Inf",
            pricePerUnit: { USD: usd },
          },
        },
      },
    };
  }
  return {
    offerCode: "AmazonBedrock",
    version: "synthetic-offer-version",
    publicationDate: "2026-10-16T21:08:06Z",
    products,
    terms: { OnDemand: terms },
  };
}
describe("bounded official price freshness", () => {
  it("selects only exact direct-region approved on-demand SKU/rates", () => {
    expect(
      parseRegionalPriceList(fixture(), MICRO_MODEL, now, digest),
    ).toMatchObject({
      inputUsdPerMillion: 0.035,
      outputUsdPerMillion: 0.14,
      priceListSha256: digest,
    });
    expect(
      parseRegionalPriceList(fixture(), LITE_MODEL, now, digest),
    ).toMatchObject({ inputUsdPerMillion: 0.06, outputUsdPerMillion: 0.24 });
  });
  it("rejects substitutions, ambiguous tiers, wrong units, future publications and zero price", () => {
    for (const change of [
      (x: ReturnType<typeof fixture>) => {
        (
          x.products["5UG3KNNU32Z3GKP2"] as {
            attributes: { regionCode: string };
          }
        ).attributes.regionCode = "us-east-1";
      },
      (x: ReturnType<typeof fixture>) => {
        (
          x.products["5UG3KNNU32Z3GKP2"] as { attributes: { feature: string } }
        ).attributes.feature = "Batch Inference";
      },
      (x: ReturnType<typeof fixture>) => {
        x.publicationDate = "2099-01-01T00:00:00Z";
      },
      (x: ReturnType<typeof fixture>) => {
        (
          x.terms.OnDemand["5UG3KNNU32Z3GKP2"] as {
            term: { priceDimensions: { rate: { unit: string } } };
          }
        ).term.priceDimensions.rate.unit = "hour";
      },
      (x: ReturnType<typeof fixture>) => {
        (
          x.terms.OnDemand["5UG3KNNU32Z3GKP2"] as {
            term: {
              priceDimensions: { rate: { pricePerUnit: { USD: string } } };
            };
          }
        ).term.priceDimensions.rate.pricePerUnit.USD = "0";
      },
      (x: ReturnType<typeof fixture>) => {
        x.terms.OnDemand["5UG3KNNU32Z3GKP2"] = {
          term: {},
          ambiguousSecondTerm: {},
        };
      },
    ]) {
      const x = fixture();
      change(x);
      expect(() => parseRegionalPriceList(x, MICRO_MODEL, now, digest)).toThrow(
        "prices are unavailable",
      );
    }
  });
  it("uses fresh stored/cached prices without an outgoing request", async () => {
    const price = parseRegionalPriceList(fixture(), MICRO_MODEL, now, digest);
    let reads = 0,
      calls = 0;
    const get = verifiedPriceProvider(
      MICRO_MODEL,
      async () => {
        reads++;
        return price;
      },
      async () => {
        calls++;
        throw Error("No network expected");
      },
      () => now,
    );
    await get();
    await get();
    expect(reads).toBe(1);
    expect(calls).toBe(0);
  });
  it("refreshes stale pricing once through fixed anonymous HTTPS with bounded transport", async () => {
    let reads = 0,
      calls = 0;
    const old = {
      ...parseRegionalPriceList(fixture(), MICRO_MODEL, now, digest),
      verifiedAt: new Date(now - 86400001).toISOString(),
    };
    const get = verifiedPriceProvider(
      MICRO_MODEL,
      async () => {
        reads++;
        return old;
      },
      async (input, init) => {
        calls++;
        expect(input).toBe(REGIONAL_PRICE_LIST_URL);
        expect(init?.redirect).toBe("error");
        expect(init?.credentials).toBe("omit");
        expect(init?.headers).toBeUndefined();
        expect(init?.signal).toBeDefined();
        return new Response(JSON.stringify(fixture()));
      },
      () => now,
    );
    const result = await get();
    await get();
    expect(result.verifiedAt).toBe(new Date(now).toISOString());
    expect(reads).toBe(1);
    expect(calls).toBe(1);
  });
  it("fails closed on transport/error/oversize/redirect and never uses stale prices", async () => {
    const redirected = new Response("{}");
    Object.defineProperty(redirected, "redirected", { value: true });
    for (const response of [
      new Response("bad", { status: 503 }),
      new Response("x".repeat(2000001)),
      new Response("{}", { headers: { "content-length": "2000001" } }),
      redirected,
    ])
      await expect(
        refreshRegionalPrice(
          MICRO_MODEL,
          async () => response,
          () => now,
        ),
      ).rejects.toThrow("prices are unavailable");
    await expect(
      refreshRegionalPrice(
        MICRO_MODEL,
        async () => {
          throw Error("synthetic private transport message");
        },
        () => now,
      ),
    ).rejects.toThrow("prices are unavailable");
  });
  it("enforces the five-second wall bound even when a transport or body ignores abort", async () => {
    vi.useFakeTimers();
    try {
      for (const transport of [
        async () => new Promise<Response>(() => {}),
        async () => new Response(new ReadableStream<Uint8Array>()),
      ]) {
        const result = refreshRegionalPrice(MICRO_MODEL, transport, () => now);
        const rejected = expect(result).rejects.toThrow(
          "prices are unavailable",
        );
        await vi.advanceTimersByTimeAsync(5000);
        await rejected;
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
