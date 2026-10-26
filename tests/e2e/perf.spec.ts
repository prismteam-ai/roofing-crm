// T018a (B-03): adapted from the A-03/B-02 copy of this file (its own header recorded that
// history) for this story's NFR-001 — radius/threshold-change latency on `search.properties`/
// `search.permits`, not Task A's Permits-page User Timing marks (this app has no such
// instrumentation; `crm:duckdb:init`/`crm:query:list`/`crm:query:count` were never ported here).
// Black-box timing instead: `performance.now()` around the change event, until the results list
// (`[data-testid="search-results"]`) settles — the same shape as
// testplans/B-03-test-cases.md's B-03-TC-NF-01 (radius change 5→25 mi, then a threshold change),
// 20 timed runs after one untimed warm-up, p95 < 3,000 ms (architecture-constitution.md §10).
import { expect, test } from "@playwright/test";
import { PERF_PIN, ROOF_ANY_PARAM } from "./lib/run-fixtures.js";
import { runtimeUrl } from "./lib/runtime.js";
import { AUTH_STATE_PATH, openSignedIn, SEEDED_PASSWORD, requirePassword } from "./lib/auth.js";

// Signed in once by the `setup` project (tests/e2e/lib/auth.ts); sign-in itself is B-01's job.
test.use({ storageState: AUTH_STATE_PATH });

const TIMED_RUNS = 20;
const P95_LIMIT_MS = 3_000;

interface Summary {
  n: number;
  p50Ms: number;
  p95Ms: number;
}

function summarize(valuesMs: number[]): Summary {
  const sorted = [...valuesMs].sort((a, b) => a - b);
  const pick = (p: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
  return { n: sorted.length, p50Ms: pick(0.5), p95Ms: pick(0.95) };
}

/** Opens the perf pin (fixtures file) by URL at 5 mi and returns once the first search response
 *  landed and rendered. */
async function openPinAndWait(page: import("@playwright/test").Page): Promise<void> {
  await openSignedIn(page, `/?lat=${PERF_PIN.lat}&lng=${PERF_PIN.lng}&r=5&${ROOF_ANY_PARAM}`);
  await page
    .locator('[data-testid="search-results"]')
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
}

/** True for a `search.properties` response whose input carries this radius. */
function isPropertiesFor(radiusMi: number) {
  const radius = new RegExp(`"radiusMi":${String(radiusMi)}[,}]`);
  return (response: import("@playwright/test").Response): boolean =>
    response.url().includes("search.properties") && radius.test(decodeURIComponent(response.url()));
}

/** A change that never settled counts as this many ms (and is reported, never dropped). */
const NO_ANSWER_MS = 32_000;

/** One timed run: changes the radius, waits for the NEW `search.properties` response for exactly
 *  this radius (so a list already on screen cannot end the timer early) and for the list to be
 *  re-rendered, returns the elapsed time in ms. Every run uses a radius not asked for before, so
 *  the client cache cannot answer it. The results list is what a person waits for; the permit
 *  markers load beside it. */
async function timedRadiusChange(
  page: import("@playwright/test").Page,
  toRadiusMi: number,
): Promise<number> {
  const radius = page.getByRole("spinbutton", { name: "Radius" });
  const properties = page.waitForResponse(isPropertiesFor(toRadiusMi), { timeout: NO_ANSWER_MS });
  const started = await page.evaluate(() => performance.now());
  await radius.fill(String(toRadiusMi));
  await radius.blur();
  try {
    const response = await properties;
    expect(response.ok(), `search.properties ${String(toRadiusMi)} mi`).toBe(true);
  } catch {
    return NO_ANSWER_MS;
  }
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
  await page
    .locator('[data-testid="search-results"]')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  const ended = await page.evaluate(() => performance.now());
  return ended - started;
}

test.describe("B-03-TC-NF-01: radius change p95 < 3 s end to end, 20 runs", () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test("@scenario:B-03-TC-NF-01", async ({ page }, testInfo) => {
    // The timing is the API's, not the layout's: one viewport is enough, and three would triple
    // a run that already takes minutes.
    test.skip(testInfo.project.name !== "desktop-1440", "API timing, measured once (desktop)");
    requirePassword();
    if (!SEEDED_PASSWORD) return;

    await openPinAndWait(page);

    // One untimed warm-up on the 442k index (cold Lambda and DuckDB start, browser connection).
    await timedRadiusChange(page, 5.5);

    const timingsMs: number[] = [];
    for (let i = 1; i <= TIMED_RUNS; i += 1) {
      // 6, 7 ... 25 mi: 20 distinct radii, each a real re-fetch of a larger set (never a no-op or
      // a client-cache hit), ending at the 25 mi hard case.
      timingsMs.push(await timedRadiusChange(page, 5 + i));
    }

    const summary = summarize(timingsMs);
    console.log(
      `NF-01 radii 6..25 mi, timings ms: ${timingsMs.map(Math.round).join(", ")} | ${JSON.stringify(summary)}`,
    );
    await testInfo.attach("tc-nf-01-radius-change-timings.json", {
      body: JSON.stringify({ url: `${runtimeUrl()}/`, timingsMs, summary }, null, 2),
      contentType: "application/json",
    });

    expect(summary.n).toBe(TIMED_RUNS);
    expect(summary.p95Ms, `radius-change p95 < ${P95_LIMIT_MS} ms`).toBeLessThan(P95_LIMIT_MS);
  });
});
