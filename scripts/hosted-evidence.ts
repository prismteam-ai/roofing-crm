import {
  assertFrontendIdentity,
  assertAssetDigests,
} from "../packages/hosted-runtime/src/evidence-identity";
import type { RuntimeIdentity } from "../packages/hosted-runtime/src/release";
import { queryFromUrl } from "../packages/map-domain/src/index";
/** Parent-invoked clean-browser proof. Keys/codes and raw protected observation rows are never returned. */
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const get = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing private evidence input: ${k}`);
  return v;
};
if (process.env.PRISM_CLOUD_EXECUTION_APPROVED !== "yes")
  throw new Error("Parent-owned hosted evidence approval required");
const origin = get("PRISM_REVIEW_ORIGIN"),
  dir = path.resolve(get("PRISM_PRIVATE_OPERATIONS_DIR"));
if (
  !/^https:\/\/d[a-z0-9]+\.cloudfront\.net$/.test(origin) ||
  dir.startsWith(process.cwd() + path.sep)
)
  throw new Error("Exact review origin/private evidence destination required");
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const packaged = JSON.parse(
  await readFile("build/release-package.json", "utf8"),
) as { identity: RuntimeIdentity; archiveSha256: string };
const archiveSha = hash(await readFile("build/crm-lambda.zip"));
if (
  archiveSha !== get("PRISM_EXPECTED_ARCHIVE_SHA256") ||
  archiveSha !== packaged.archiveSha256 ||
  packaged.identity.head !== get("PRISM_EXPECTED_HEAD") ||
  packaged.identity.tree !== get("PRISM_EXPECTED_TREE")
)
  throw new Error("Evidence package does not match the private release pins");
let expectedAssets: Record<string, string> | undefined;
if (process.env.PRISM_EXPECTED_FRONTEND_ASSET_MANIFEST) {
  const raw = await readFile(
    process.env.PRISM_EXPECTED_FRONTEND_ASSET_MANIFEST,
  );
  if (hash(raw) !== get("PRISM_EXPECTED_FRONTEND_ASSET_MANIFEST_SHA256"))
    throw new Error("Expected frontend manifest digest mismatch");
  expectedAssets = JSON.parse(raw.toString("utf8")) as Record<string, string>;
}
let code = "";
for await (const x of process.stdin) {
  code += String(x);
  if (code.length > 1024) throw new Error("Private input too long");
}
code = code.trim();
if (!code) throw new Error("Review code required on private stdin");
await mkdir(dir, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const blockedOrigins = new Set<string>(),
  pageErrors: string[] = [],
  masks = [
    '[data-testid="property-row"]',
    ".detail-drawer > h2",
    ".detail-id",
    ".detail-main-signal > strong",
    ".permit-detail",
    ".detail-drawer > p:not(.basis)",
    ".citation > span",
    ".saved-lead h3",
    ".agent-result-links",
    ".agent-answer code",
    ".agent-answer pre",
  ];

try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    page = await context.newPage();
  const assetDigests: Record<string, string> = {},
    assetReads: Promise<void>[] = [];
  page.on("response", (response) => {
    const u = new URL(response.url());
    if (
      u.origin === origin &&
      /^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(u.pathname)
    )
      assetReads.push(
        response.body().then((body) => {
          assetDigests[u.pathname.slice(1)] = hash(body);
        }),
      );
  });
  await context.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    // OSM forbids headless bots that force tile rendering. All automated map
    // interaction uses this synthetic raster; visible browser proof is separate.
    if (u.origin === "https://tile.openstreetmap.org") {
      if (!/^\/\d+\/\d+\/\d+\.png$/.test(u.pathname) || u.search)
        throw new Error("Unexpected raster tile path");
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAADIElEQVR4nO3UoREAIBDAsN9/SO5wbAFjIBoRX9XZZ12gaX4HAP8YAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQZAIQ9x582u/yk3+IAAAAASUVORK5CYII=",
          "base64",
        ),
        headers: { "Cache-Control": "public, max-age=604800" },
      });
    }
    if (
      [origin, "https://maps.geo.us-east-1.amazonaws.com"].includes(u.origin) ||
      ["data:", "blob:"].includes(u.protocol)
    )
      await route.continue();
    else {
      blockedOrigins.add(u.origin);
      await route.abort();
    }
  });
  page.on("pageerror", () =>
    pageErrors.push("Page script error (details redacted)"),
  );
  await page.goto(origin);
  await page.getByLabel("Review access code", { exact: true }).fill(code);
  code = "";
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-query-hash",
    /\S+/,
  );
  const health = await (
    await context.request.get(`${origin}/api/health`)
  ).json();
  if (
    health.head !== get("PRISM_EXPECTED_HEAD") ||
    health.tree !== get("PRISM_EXPECTED_TREE") ||
    health.region !== "us-east-1" ||
    health.stage !== "p3-review"
  )
    throw new Error("Evidence runtime identity mismatch");
  await page
    .getByLabel("Filter by roof age", { exact: true })
    .setChecked(false);
  await page.getByLabel("Permit status", { exact: true }).selectOption("any");
  await expect(page.getByText("Updating search…")).toHaveCount(0);
  await expect(page.getByTestId("property-row").first()).toBeVisible();
  const state = await page
    .locator(".app-shell")
    .evaluate((e) =>
      Object.fromEntries(
        [...e.attributes]
          .filter((a) => a.name.startsWith("data-"))
          .map((a) => [a.name, a.value]),
      ),
    );
  assertFrontendIdentity(state, health, packaged.identity);
  if (
    process.env.PRISM_ORACLE_ORIGIN &&
    state["data-oracle-origin"] !== process.env.PRISM_ORACLE_ORIGIN
  )
    throw new Error("Rendered Oracle link does not match the approved origin");
  const frontendConfigSha256 = hash(
    JSON.stringify({
      oracleOrigin: state["data-oracle-origin"],
      region: state["data-region"],
      stage: state["data-stage"],
    }),
  );
  if (
    process.env.PRISM_EXPECTED_FRONTEND_CONFIG_SHA256 &&
    frontendConfigSha256 !== process.env.PRISM_EXPECTED_FRONTEND_CONFIG_SHA256
  )
    throw new Error("Rendered frontend configuration digest mismatch");
  await Promise.all(assetReads);
  if (expectedAssets) assertAssetDigests(assetDigests, expectedAssets);
  const snapshot = health.snapshotId,
    query = queryFromUrl(new URL(page.url()).search, snapshot);
  const response = await context.request.post(`${origin}/api/search`, {
    data: query,
  });
  if (!response.ok()) throw new Error("Evidence query failed");
  const result = await response.json();
  if (
    !result.total ||
    result.snapshotId !== snapshot ||
    state["data-query-hash"] !== result.queryHash
  )
    throw new Error("Positive current evidence predicate failed");
  // The DOM query identity is checked before capture; private row values are never serialized into evidence.
  const ids = await page
    .getByTestId("property-row")
    .evaluateAll((rows) =>
      rows.map((r) => r.getAttribute("data-property-id")).filter(Boolean),
    );
  if (
    JSON.stringify(ids.sort()) !==
    JSON.stringify(result.rows.map((r: { id: string }) => r.id).sort())
  )
    throw new Error("Rendered IDs differ from the exact asserted query");
  const protectedMode = health.dataMode === "protected-real";
  const maskedCounts = Object.fromEntries(
    await Promise.all(
      masks.map(async (s) => [s, await page.locator(s).count()]),
    ),
  );
  const metadata = {
    head: health.head,
    tree: health.tree,
    buildId: health.buildId,
    contractVersion: health.contractVersion,
    region: health.region,
    stage: health.stage,
    mode: protectedMode ? "protected-real" : "real-public",
    snapshotId: snapshot,
    snapshotDigest: health.snapshotDigest ?? health.digest,
    dom: state,
    frontendIdentityVerified: true,
    frontendConfigSha256,
    assetDigests,
    ...(expectedAssets
      ? {
          expectedFrontendAssetManifestSha256: get(
            "PRISM_EXPECTED_FRONTEND_ASSET_MANIFEST_SHA256",
          ),
        }
      : {}),
    assertedQuery: query,
    positiveCount: result.total,
    renderedIdsDigest: createHash("sha256")
      .update(JSON.stringify(ids.sort()))
      .digest("hex"),
    maskSelectors: masks,
    maskedCounts,
    blockedOrigins: [...blockedOrigins],
    pageErrors,
    mapTiles:
      "synthetic raster in headless validation; live visible-browser proof recorded separately",
    apiKeysRetained: false,
    rawRowsRetained: false,
  };
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1100 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.screenshot({
      path: path.join(dir, `crm-${name}-masked.png`),
      mask: masks.map((s) => page.locator(s)),
      fullPage: false,
    });
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Open the review workspace" }),
  ).toBeVisible();
  if (blockedOrigins.size || pageErrors.length)
    throw new Error(
      "Hosted evidence encountered unexpected origins or script errors",
    );
  await writeFile(
    path.join(dir, "crm-hosted-masked-evidence.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      {
        status: "passed",
        head: health.head,
        tree: health.tree,
        buildId: health.buildId,
        maskedSelectors: masks,
        rawRowsRetained: false,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
