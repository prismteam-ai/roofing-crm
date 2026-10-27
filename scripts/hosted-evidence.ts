import { queryFromUrl } from "../packages/map-domain/src/index";
/** Parent-invoked clean-browser proof. Keys/codes and raw protected observation rows are never returned. */
import { chromium, expect } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
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
  await context.route("**/*", async (route) => {
    const u = new URL(route.request().url());
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
    assertedQuery: query,
    positiveCount: result.total,
    renderedIdsDigest: createHash("sha256")
      .update(JSON.stringify(ids.sort()))
      .digest("hex"),
    maskSelectors: masks,
    maskedCounts,
    blockedOrigins: [...blockedOrigins],
    pageErrors,
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
