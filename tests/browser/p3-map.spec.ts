import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CONTRACT_VERSION } from "../../packages/contracts/src/index";
const origin = "https://dsynthetic123.cloudfront.net",
  mapOrigin = "https://maps.geo.us-east-1.amazonaws.com",
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
  test(`Amazon Location ${fail ? "failure retains accessible offline points" : "mock style loads with exact origin-only referrer"}`, async ({
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
        expect(u.searchParams.has("key")).toBe(true);
        if (fail)
          return route.fulfill({ status: 503, body: "Synthetic map outage" });
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            version: 8,
            sources: {},
            layers: [
              {
                id: "synthetic-paper",
                type: "background",
                paint: { "background-color": "#e6ebe4" },
              },
            ],
          }),
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
            kind: "amazon-location",
            apiKey: "synthetic-not-service-map-material",
            allowedOrigin: origin,
            region: "us-east-1",
            style: "Standard",
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            restrictionsDigest: "a".repeat(64),
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
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://maps.geo.us-east-1.amazonaws.com; img-src 'self' data: blob: https://maps.geo.us-east-1.amazonaws.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'",
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
          r.path === "/v2/styles/Standard/descriptor" &&
          r.referer === origin + "/",
      ),
    ).toBe(true);
    await expect(
      page
        .getByRole("link", { name: "Amazon Location data attribution" })
        .first(),
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
