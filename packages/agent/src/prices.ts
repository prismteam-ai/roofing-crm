import { createHash } from "node:crypto";
import { DomainError } from "../../contracts/src/index";
import {
  MICRO_MODEL,
  LITE_MODEL,
  reviewModel,
} from "../../runtime-config/src/index";
import { reserveCost, type VerifiedPrice } from "./campaign";

export const REGIONAL_PRICE_LIST_URL =
  "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/us-east-2/index.json";
const PRICE_SKUS = {
  [MICRO_MODEL]: {
    name: "Nova Micro",
    token: "NovaMicro",
    input: "XAR69MSGZSU6FEM9",
    output: "YUSGHKDUPQRC75RK",
  },
  [LITE_MODEL]: {
    name: "Nova Lite",
    token: "NovaLite",
    input: "QRGWJ3P8FT28EYX2",
    output: "CBZ6A6U7XK8WJ3KA",
  },
} as const;
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
function unavailable(): never {
  throw new DomainError(
    "COST_LIMIT_REACHED",
    "Current approved regional model prices are unavailable; no provider call permitted",
  );
}
/** Parse only the already-approved direct regional on-demand SKUs; never choose a similarly named offering. */
export function parseRegionalPriceList(
  input: unknown,
  modelId: string,
  verifiedAt: number,
  bodySha256: string,
): VerifiedPrice {
  reviewModel(modelId, true);
  if (!Number.isFinite(verifiedAt) || !/^[a-f0-9]{64}$/.test(bodySha256))
    return unavailable();
  const root = object(input),
    products = object(root.products),
    terms = object(object(root.terms).OnDemand),
    spec = PRICE_SKUS[modelId as keyof typeof PRICE_SKUS];
  if (
    root.offerCode !== "AmazonBedrock" ||
    typeof root.version !== "string" ||
    typeof root.publicationDate !== "string" ||
    !Number.isFinite(Date.parse(root.publicationDate)) ||
    Date.parse(root.publicationDate) > verifiedAt
  )
    return unavailable();
  const read = (side: "input" | "output") => {
    const sku = spec[side],
      product = object(products[sku]),
      a = object(product.attributes);
    if (
      product.sku !== sku ||
      a.servicecode !== "AmazonBedrock" ||
      a.regionCode !== "us-east-2" ||
      a.feature !== "On-demand Inference" ||
      a.model !== spec.name ||
      a.usagetype !== `USE1-${spec.token}-${side}-tokens` ||
      a.inferenceType !== (side === "input" ? "Input tokens" : "Output tokens")
    )
      return unavailable();
    const offers = Object.values(object(terms[sku])).map(object);
    if (
      offers.length !== 1 ||
      offers[0].sku !== sku ||
      typeof offers[0].effectiveDate !== "string" ||
      !Number.isFinite(Date.parse(offers[0].effectiveDate)) ||
      Date.parse(offers[0].effectiveDate) > verifiedAt
    )
      return unavailable();
    const dimensions = Object.values(object(offers[0].priceDimensions)).map(
      object,
    );
    if (
      dimensions.length !== 1 ||
      dimensions[0].unit !== "1K tokens" ||
      dimensions[0].beginRange !== "0" ||
      dimensions[0].endRange !== "Inf"
    )
      return unavailable();
    const usd = object(dimensions[0].pricePerUnit).USD;
    if (
      typeof usd !== "string" ||
      !/^\d+(?:\.\d+)?$/.test(usd) ||
      !Number.isFinite(Number(usd)) ||
      Number(usd) <= 0
    )
      return unavailable();
    return Number((Number(usd) * 1000).toPrecision(12));
  };
  const price: VerifiedPrice = {
    modelId,
    region: "us-east-2",
    inputUsdPerMillion: read("input"),
    outputUsdPerMillion: read("output"),
    verifiedAt: new Date(verifiedAt).toISOString(),
    source: REGIONAL_PRICE_LIST_URL,
    priceListSha256: bodySha256,
    priceListVersion: root.version,
    priceListPublicationDate: root.publicationDate,
    priceSkus: { input: spec.input, output: spec.output },
  };
  reserveCost(1, price, verifiedAt);
  return price;
}
/** Anonymous fixed-origin metadata only. Runtime must reserve the P4 request allowance before calling this. */
export async function refreshRegionalPrice(
  modelId: string,
  transport: typeof fetch = fetch,
  clock = Date.now,
): Promise<VerifiedPrice> {
  reviewModel(modelId, true);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined,
    reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await transport(REGIONAL_PRICE_LIST_URL, {
          redirect: "error",
          credentials: "omit",
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          response.status !== 200 ||
          response.redirected ||
          (response.url && response.url !== REGIONAL_PRICE_LIST_URL) ||
          Number(response.headers.get("content-length") ?? 0) > 2000000 ||
          !response.body
        ) {
          void response.body?.cancel().catch(() => {});
          return unavailable();
        }
        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        for (;;) {
          const part = await reader.read();
          if (controller.signal.aborted) return unavailable();
          if (part.done) break;
          bytes += part.value.length;
          if (bytes > 2000000) {
            void reader.cancel().catch(() => {});
            return unavailable();
          }
          chunks.push(part.value);
        }
        const body = Buffer.concat(chunks);
        return parseRegionalPriceList(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)),
          modelId,
          clock(),
          createHash("sha256").update(body).digest("hex"),
        );
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          void reader?.cancel().catch(() => {});
          reject(new Error("Bounded price metadata deadline exceeded"));
        }, 5000);
      }),
    ]);
  } catch {
    return unavailable();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/** Fresh stored price or bounded official refresh; no stale-price fallback and no write privilege. */
export function verifiedPriceProvider(
  modelId: string,
  stored: () => Promise<unknown>,
  transport: typeof fetch = fetch,
  clock = Date.now,
) {
  reviewModel(modelId, true);
  let cached: VerifiedPrice | undefined;
  return async () => {
    if (cached) {
      try {
        reserveCost(1, cached, clock());
        return cached;
      } catch {
        cached = undefined;
      }
    }
    const candidate = await stored();
    try {
      if (object(candidate).modelId !== modelId) return unavailable();
      reserveCost(1, candidate as VerifiedPrice, clock());
      cached = candidate as VerifiedPrice;
    } catch {
      cached = await refreshRegionalPrice(modelId, transport, clock);
    }
    return cached;
  };
}
