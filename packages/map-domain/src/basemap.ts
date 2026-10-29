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
  region: "us-east-2";
  style: "Standard";
  expiresAt: string;
  restrictionsDigest: string;
  attribution: string;
}
export const LOCATION_ORIGIN = "https://maps.geo.us-east-2.amazonaws.com";
export const LOCATION_ATTRIBUTION =
  '<a href="https://docs.aws.amazon.com/location/latest/developerguide/data-attribution.html" target="_blank" rel="noreferrer">Amazon Location data attribution</a>';
/** The captured Standard descriptor uses this versioned sprite path; AWS also documents the unversioned form. */
export function locationResourceClass(
  pathname: string,
): "style" | "sprite" | "glyph" | "tile" | undefined {
  if (pathname === "/v2/styles/Standard/descriptor") return "style";
  if (
    /^\/v2\/styles\/(?:4_1_0-beta_1\/)?Standard\/Light\/Default\/sprites\/sprites(?:@2x)?(?:\.(?:png|json))?$/.test(
      pathname,
    )
  )
    return "sprite";
  if (/^\/v2\/glyphs\/[^?#]+$/.test(pathname)) return "glyph";
  if (/^\/v2\/tiles\/[^?#]+$/.test(pathname)) return "tile";
  return undefined;
}
export function amazonLocationProvider(
  input: unknown,
  pageOrigin: string,
  now = Date.now(),
): AmazonLocationProvider {
  const x = input as Partial<AmazonLocationProvider>;
  if (
    x.kind !== "amazon-location" ||
    x.region !== "us-east-2" ||
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
    !locationResourceClass(url.pathname) ||
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

export const OSM_ORIGIN = "https://tile.openstreetmap.org";
export const OSM_TEMPLATE = OSM_ORIGIN + "/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>';
/** Fixed free review provider. No credentials, geocoding, bulk/offline fetch or arbitrary endpoint. */
export function openStreetMapProvider(
  input: unknown,
  pageOrigin: string,
  now = Date.now(),
): Extract<BasemapProvider, { kind: "raster" }> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Public raster configuration rejected");
  const x = input as Record<string, unknown>;
  const keys = [
    "kind",
    "id",
    "template",
    "approvedOrigin",
    "attribution",
    "maxZoom",
    "allowedOrigin",
    "expiresAt",
  ];
  const expires =
    typeof x.expiresAt === "string" ? Date.parse(x.expiresAt) : NaN;
  if (
    Object.keys(x).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(x, k)) ||
    x.kind !== "raster" ||
    x.id !== "openstreetmap-standard" ||
    x.template !== OSM_TEMPLATE ||
    x.approvedOrigin !== OSM_ORIGIN ||
    x.attribution !== OSM_ATTRIBUTION ||
    x.maxZoom !== 18 ||
    x.allowedOrigin !== pageOrigin ||
    !/^https:\/\/d[a-z0-9]+\.cloudfront\.net$/.test(pageOrigin) ||
    !Number.isFinite(expires) ||
    expires <= now ||
    expires > now + 14 * 86400000
  )
    throw new Error("Public raster configuration rejected");
  return {
    kind: "raster",
    id: "openstreetmap-standard",
    template: OSM_TEMPLATE,
    approvedOrigin: OSM_ORIGIN,
    attribution: OSM_ATTRIBUTION,
    maxZoom: 18,
  };
}
