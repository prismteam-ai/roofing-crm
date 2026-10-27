/** A provider needs explicit origin approval and required attribution before use. No provider is contacted by default. */
export type BasemapProvider =
  | AmazonLocationProvider
  | { kind: "offline"; attribution: string }
  | {
      kind: "raster";
      id: string;
      template: string;
      approvedOrigin: string;
      attribution: string;
      maxZoom: number;
    };
export const OFFLINE_BASEMAP: BasemapProvider = {
  kind: "offline",
  attribution: "Coordinate plot · no street basemap",
};
export function validateBasemap(provider: BasemapProvider): BasemapProvider {
  if (provider.kind === "offline" || provider.kind === "amazon-location")
    return provider;
  const sample = provider.template
    .replaceAll("{z}", "0")
    .replaceAll("{x}", "0")
    .replaceAll("{y}", "0");
  const url = new URL(sample),
    origin = new URL(provider.approvedOrigin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.origin !== origin.origin ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !provider.attribution.trim() ||
    !Number.isInteger(provider.maxZoom) ||
    provider.maxZoom < 0 ||
    provider.maxZoom > 22
  )
    throw new Error(
      "Basemap requires an exact approved HTTPS origin, attribution and bounded zoom",
    );
  // URL key/token embedding is not permitted. A future authenticated map proxy can use same-origin requests.
  if (/[?&](?:key|token|api[-_]?key|credential|signature)=/i.test(url.search))
    throw new Error("Basemap credentials must not be embedded in public URLs");
  return provider;
}
export interface AmazonLocationProvider {
  kind: "amazon-location";
  apiKey: string;
  allowedOrigin: string;
  region: "us-east-1";
  style: "Standard";
  expiresAt: string;
  restrictionsDigest: string;
  attribution: string;
}
export const LOCATION_ORIGIN = "https://maps.geo.us-east-1.amazonaws.com";
export const LOCATION_ATTRIBUTION =
  '<a href="https://docs.aws.amazon.com/location/latest/developerguide/data-attribution.html" target="_blank" rel="noreferrer">Amazon Location data attribution</a>';
export function amazonLocationProvider(
  input: unknown,
  pageOrigin: string,
  now = Date.now(),
): AmazonLocationProvider {
  const x = input as Partial<AmazonLocationProvider>;
  if (
    x.kind !== "amazon-location" ||
    x.region !== "us-east-1" ||
    x.style !== "Standard" ||
    x.allowedOrigin !== pageOrigin ||
    !/^https:\/\/d[a-z0-9]+\.cloudfront\.net$/.test(pageOrigin) ||
    typeof x.apiKey !== "string" ||
    x.apiKey.length < 10 ||
    x.apiKey.length > 2048 ||
    !x.expiresAt ||
    !Number.isFinite(Date.parse(x.expiresAt)) ||
    Date.parse(x.expiresAt) <= now ||
    !x.restrictionsDigest ||
    !/^[a-f0-9]{64}$/.test(x.restrictionsDigest)
  )
    throw new Error("Restricted Amazon Location configuration rejected");
  return { ...x, attribution: LOCATION_ATTRIBUTION } as AmazonLocationProvider;
}
export function locationRequest(
  provider: AmazonLocationProvider,
  resource: string,
): {
  url: string;
  referrerPolicy: "strict-origin-when-cross-origin";
  credentials: "same-origin";
} {
  const url = new URL(resource, LOCATION_ORIGIN);
  if (
    url.origin !== LOCATION_ORIGIN ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/v2\/(?:styles\/Standard\/(?:descriptor|sprites[^?#]*)|tiles\/[^?#]+|glyphs\/[^?#]+)$/.test(
      url.pathname,
    ) ||
    [...url.searchParams.keys()].some(
      (key) =>
        !["key", "color-scheme", "political-view", "language"].includes(key),
    )
  )
    throw new Error(
      "Map resource is outside the exact approved Amazon Location paths",
    );
  url.searchParams.set("key", provider.apiKey);
  return {
    url: url.href,
    referrerPolicy: "strict-origin-when-cross-origin",
    credentials: "same-origin",
  };
}
