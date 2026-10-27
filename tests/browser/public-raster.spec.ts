import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CONTRACT_VERSION } from "../../packages/contracts/src/index";
const origin = "https://dsynthetic123.cloudfront.net",
  mapOrigin = "https://tile.openstreetmap.org",
  snapshotId = "map-browser-synthetic",
  queryHash = "synthetic-map-query";
const source = {
  sourceId: "synthetic-map",
  recordId: "SYN-MAP-1",
  kind: "synthetic",
  observedAt: "2026-10-27T20:00:00Z",
  digest: "synthetic",
};
const property = {
  id: "SYN-MAP-1",
  nativeId: "SYN-MAP-1",
  parcelIds: [],
  address: "Synthetic map fixture",
  usage: "residential",
  coordinates: { lat: 42.66, lng: -83.29 },
  roof: {
    ageYears: 20,
    basis: "built_year",
    confidence: "low",
    asOf: "2026-10-27",
    caveats: ["Synthetic building year proxy"],
  },
  permits: [],
  ownership: {
    lastTransferDate: null,
    historyCoverage: "unknown",
    ownerRegion: "unknown",
  },
  provenance: [source],
  distanceMeters: 0,
};
for (const fail of [false, true])
  test(`OpenStreetMap ${fail ? "failure retains accessible offline points" : "mock style loads with exact origin-only referrer"}`, async ({
    context,
    page,
  }) => {
    const requested: { path: string; referer: string | undefined }[] = [],
      external: string[] = [],
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.origin === mapOrigin) {
        requested.push({
          path: u.pathname,
          referer: route.request().headers().referer,
        });
        expect(u.search).toBe("");
        if (fail)
          return route.fulfill({ status: 503, body: "Synthetic map outage" });
        return route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
            "base64",
          ),
          headers: { "Cache-Control": "public, max-age=604800" },
        });
      }
      if (u.origin !== origin) {
        if (["blob:", "data:"].includes(u.protocol)) return route.continue();
        external.push(u.origin);
        return route.abort();
      }
      if (u.pathname.startsWith("/api/")) {
        let data: unknown;
        if (u.pathname === "/api/health")
          data = {
            snapshotId,
            contractVersion: CONTRACT_VERSION,
            mode: "synthetic",
            dataMode: "synthetic",
            accessMode: "local",
            provider: "deterministic-offline",
          };
        else if (u.pathname === "/api/search")
          data = {
            contractVersion: CONTRACT_VERSION,
            snapshotId,
            queryHash,
            rows: [property],
            total: 1,
            truncated: false,
            nextCursor: null,
            limitations: ["Synthetic only"],
          };
        else if (u.pathname === "/api/map-config")
          data = {
            kind: "raster",
            id: "openstreetmap-standard",
            template: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            approvedOrigin: mapOrigin,
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
            maxZoom: 18,
            allowedOrigin: origin,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          };
        else if (u.pathname === "/api/leads") data = [];
        else data = property;
        return route.fulfill({
          contentType: "application/json",
          headers: { "Cache-Control": "no-store" },
          body: JSON.stringify(data),
        });
      }
      const file = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
      if (
        !/^(?:index\.html|release-identity\.json|assets\/[A-Za-z0-9_.-]+)$/.test(
          file,
        )
      )
        throw new Error("Unapproved static request");
      return route.fulfill({
        body: readFileSync(path.resolve("dist", file)),
        contentType: file.endsWith(".html")
          ? "text/html"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".json")
              ? "application/json"
              : "application/javascript",
        headers: {
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://tile.openstreetmap.org; img-src 'self' data: blob: https://tile.openstreetmap.org; worker-src 'self' blob:; object-src 'none'; base-uri 'self'",
        },
      });
    });
    await page.goto(`${origin}/?private-query-value=must-not-leak`);
    await expect(page.getByTestId("property-row")).toHaveCount(1);
    await expect.poll(() => requested.length).toBeGreaterThan(0);
    await expect(page.getByTestId("property-map")).toHaveAttribute(
      "data-map-renderer",
      fail ? "fallback" : "maplibre",
    );
    const mapIds = JSON.parse(
      (await page
        .getByTestId("property-map")
        .getAttribute("data-property-ids"))!,
    );
    expect(mapIds).toEqual([property.id]);
    expect(
      requested.every(
        (r) =>
          /^\/\d+\/\d+\/\d+\.png$/.test(r.path) && r.referer === origin + "/",
      ),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "OpenStreetMap contributors" }).first(),
    ).toBeVisible();
    if (fail)
      await expect(page.getByLabel("Accessible map fallback")).toBeVisible();
    await page.getByTestId("property-row").click();
    await expect(page.getByTestId("property-detail")).toContainText(
      "Building year proxy",
    );
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
