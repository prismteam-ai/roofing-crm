import { expect, type Page, test } from "@playwright/test";

/**
 * README demo transcript, end to end, on real data (the pinned published Oracle run).
 * Serial: one browser page walks the whole demo, like a person would.
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let agentConfigured = false;
const grader = () => test.info().project.name === "grader-like";
/** Waits until no search is in flight, so the list shows the current filters. */
const settled = () => expect(page.locator("section.candidates")).toHaveAttribute("aria-busy", "false");
const count = async () => {
  await settled();
  return Number((await page.getByTestId("candidate-count").innerText()).replace(/[^\d]/g, ""));
};
const roofAges = async () => {
  await settled();
  const t = await page
    .locator(".candidate-list > li .chip")
    .filter({ hasText: /^roof \d+ y/ })
    .allInnerTexts();
  return t.map((a) => Number(a.match(/roof (\d+) y/)![1]));
};
const firstRows = () => page.locator(".candidate-list > li");

test.beforeAll(async ({ browser, baseURL }, info) => {
  const ctx = await browser.newContext(info.project.use);
  page = await ctx.newPage();
  const health = await page.request.get(`${baseURL}/health`);
  agentConfigured = Boolean((await health.json()).agentConfigured);
});
test.afterAll(async () => page?.context().close());

test("1. opens on Broward County, sets the center (GPS or city search) and a 5-mile radius", async () => {
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Broward County data · run" })).toBeVisible();
  await expect(page.getByTestId("center-label")).toContainText("Broward County center (26.1500, -80.3000)");

  if (grader()) {
    // No WebGL: a notice replaces the map; the rest works. No GPS permission: a message, county center kept.
    await expect(page.getByTestId("map-unavailable")).toBeVisible();
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText(/Location (permission was denied|is unavailable)/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("center-label")).toContainText("Broward County center");
    await page.getByLabel("City or place").fill("Fort Lauderdale");
    await page.getByRole("button", { name: "Go" }).click();
    await expect(page.getByTestId("center-label")).toContainText(/Center: Fort Lauderdale/i);
  } else {
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByTestId("center-label")).toContainText("your location (26.1224, -80.1373)");
  }
  await page.getByLabel("Radius in miles").fill("5");
  await expect(page.getByTestId("radius-value")).toHaveText("5 mi");
  await expect.poll(count).toBeGreaterThan(100);
});

test("2. aged roofs over 15 years, then open roofing permits with long-open emphasis", async () => {
  // Aged roofs only.
  await page.getByLabel("Open roofing permits").uncheck();
  const ages = await roofAges();
  expect(ages.length).toBeGreaterThan(10);
  expect(Math.min(...ages)).toBeGreaterThanOrEqual(15);

  // Open permits only: long-open first, emphasized.
  await page.getByLabel("Open roofing permits").check();
  await page.getByLabel("Aged roofs").uncheck();
  await settled();
  await expect(firstRows().first().locator(".chip.permit")).toBeVisible();
  await expect(firstRows().first().locator(".chip.long-open")).toContainText("Long-open");
  await page.getByLabel("Aged roofs").check();
});

test("3. property detail shows contractor and BBB; converting two candidates creates leads", async () => {
  await page.getByLabel("Aged roofs").uncheck();
  await settled();
  const first = firstRows().first();
  const address = (await first.locator(".addr").innerText()).trim();
  await first.getByRole("button").click();
  const drawer = page.getByRole("dialog", { name: "Property detail" });
  await expect(drawer.getByRole("heading", { name: address })).toBeVisible();
  await expect(drawer).toContainText("Roof age");
  const card = drawer.locator(".permit-card").first();
  await expect(card).toContainText("Contractor:");
  await expect(card).toContainText(/BBB [A-F][+-]?|No BBB data/);
  await expect(drawer.getByRole("link", { name: "Property appraiser record (source)" })).toHaveAttribute(
    "href",
    /^https:\/\//,
  );
  await drawer.getByRole("button", { name: "Close detail" }).click();

  const picks = [firstRows().nth(0), firstRows().nth(1)];
  const names = [];
  for (const p of picks) {
    names.push((await p.locator(".addr").innerText()).trim());
    await p.getByRole("checkbox").check();
  }
  await page.getByRole("button", { name: /Convert 2 to leads/ }).click();
  await expect(
    page.getByText(
      /Created 2 leads\.|Created 1 lead, 1 already existed\.|Created 0 leads, 2 already existed\./,
    ),
  ).toBeVisible();

  // Converting the same property again returns the existing lead (Review Focus 3).
  await firstRows().nth(0).getByRole("checkbox").check();
  await page.getByRole("button", { name: /Convert 1 to leads/ }).click();
  await expect(page.getByText("Created 0 leads, 1 already existed.")).toBeVisible();

  await page
    .getByRole("link", { name: /^Leads/ })
    .first()
    .click();
  for (const n of names)
    await expect(page.locator(".leads-table").getByRole("button", { name: n })).toBeVisible();
  await page.getByRole("link", { name: "Map" }).click();
  await page.getByLabel("Aged roofs").check();
});

test("4. the agent answers a roofing question with results on the map, then a 'near that area' follow-up", async () => {
  test.skip(!agentConfigured, "the API has no Claude API key (set ANTHROPIC_API_KEY in .env)");
  const panel = page.getByRole("region", { name: "Ask about roofing opportunities" });
  await panel
    .getByLabel("Question")
    .fill("open roofing permits older than five years within five miles of Fort Lauderdale");
  await panel.getByRole("button", { name: "Ask" }).click();
  const answer = panel.locator(".answer").last();
  await expect(answer).toBeVisible({ timeout: 120_000 });
  await expect(answer.locator("summary")).toContainText("Retrieved evidence");
  await answer.locator("summary").click();
  await expect(answer).toContainText("find_open_roof_permits");
  await answer.getByRole("button", { name: /Show \d+ results? on map/ }).click();
  await expect(page.getByTestId("center-label")).toContainText(/FORT LAUDERDALE|agent answer/i);

  await panel.getByLabel("Question").fill("which of those near that area have a roof older than 50 years?");
  await panel.getByRole("button", { name: "Ask" }).click();
  await expect(panel.locator(".answer")).toHaveCount(2, { timeout: 120_000 });
  await expect(panel.locator(".answer").last()).toContainText(
    /Reused the previous search area|FORT LAUDERDALE/i,
  );
});

test("5. filters by roof age, permit open years and radius, on candidates and on the Leads page", async () => {
  // Candidates.
  // Roof age: every roof shown meets the threshold (the aged-roof layer keeps the oldest first).
  await page.locator("#map-roof").fill("90");
  await expect.poll(async () => Math.min(...(await roofAges()))).toBeGreaterThanOrEqual(90);
  // Open years: with only the permit layer, every permit shown has been open 7+ years. (Every
  // open Fort Lauderdale permit is 5+ years old: its permit layer stops in January 2021.)
  await page.getByLabel("Aged roofs").uncheck();
  const allPermits = await count();
  await page.locator("#map-open").fill("7");
  await expect.poll(count).toBeLessThan(allPermits);
  const open = (await page.locator(".candidate-list .chip.permit").allInnerTexts()).map((t) =>
    Number(t.match(/open (\d+) year/)?.[1] ?? 0),
  );
  expect(open.length).toBeGreaterThan(0);
  expect(Math.min(...open)).toBeGreaterThanOrEqual(7);
  // Radius.
  const wide = await count();
  await page.getByLabel("Radius in miles").fill("1");
  await expect.poll(count).toBeLessThan(wide);
  await expect(page.getByTestId("center-label")).toBeVisible();
  await page.getByLabel("Radius in miles").fill("5");
  await page.locator("#map-open").fill("0");
  await page.locator("#map-roof").fill("15");
  await page.getByLabel("Aged roofs").check();

  // Outside Broward: a pin in the ocean (Review Focus 1).
  await page.getByLabel("Latitude").fill("26.1");
  await page.getByLabel("Longitude").fill("-79.8");
  await page.getByRole("button", { name: "Set center" }).click();
  await expect(page.getByTestId("outside-coverage")).toContainText("Outside Broward coverage");
  await page.getByLabel("City or place").fill("Fort Lauderdale");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByTestId("outside-coverage")).toHaveCount(0);

  // Leads page: seeds (8+ year permits, 60+ year roofs) and the two converted leads.
  await page
    .getByRole("link", { name: /^Leads/ })
    .first()
    .click();
  const leads = async () => Number((await page.getByTestId("lead-count").innerText()).match(/\d+/)![0]);
  await expect.poll(leads).toBeGreaterThanOrEqual(3);
  const all = await leads();
  await page.locator("#leads-roof").fill("200");
  await expect.poll(leads).toBe(0);
  await page.locator("#leads-roof").fill("0");
  await page.locator("#leads-open").fill("8");
  await expect.poll(leads).toBeLessThan(all);
  await expect.poll(leads).toBeGreaterThanOrEqual(1);
  await page.locator("#leads-open").fill("0");
  await expect.poll(leads).toBe(all);
  await page.getByRole("checkbox", { name: /Within/ }).check();
  await page.getByLabel("Lead radius in miles").fill("0.25");
  await expect.poll(leads).toBeLessThan(all);
  await page.getByRole("checkbox", { name: /Within/ }).uncheck();

  // A lead's lifecycle: only allowed transitions, a note on the timeline, Contact disabled.
  await page.locator(".leads-table tbody tr").first().getByRole("button").click();
  const detail = page.getByRole("dialog", { name: "Lead detail" });
  await expect(detail.getByLabel("Change status").locator("option")).toHaveText([
    "Move to…",
    "Contacted",
    "Lost",
  ]);
  await detail.getByLabel("Change status").selectOption("contacted");
  await expect(detail).toContainText("Status: Contacted");
  await detail.getByLabel("Add a note").fill("Called owner, left voicemail");
  await detail.getByRole("button", { name: "Add note" }).click();
  await expect(detail.getByTestId("timeline")).toContainText("Called owner, left voicemail");
  await expect(detail.getByRole("button", { name: "Contact" })).toBeDisabled();
  await detail.getByRole("button", { name: "Close lead" }).click();
});

test("6. future CRM sections are visible but disabled", async () => {
  for (const s of [
    "Campaigns",
    "Estimates & Quotes",
    "Jobs & Scheduling",
    "Invoicing",
    "Storm Tracking",
    "Team & Territories",
  ]) {
    const el = page.locator('[aria-disabled="true"]', { hasText: s });
    await expect(el).toBeVisible();
    await expect(el).not.toHaveAttribute("href");
  }
});
