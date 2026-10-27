/** A provider needs explicit origin approval and required attribution before use. No provider is contacted by default. */
export type BasemapProvider =
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
  if (provider.kind === "offline") return provider;
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
