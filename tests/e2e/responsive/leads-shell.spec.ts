// B-09 T049 (US3, AC-5; agent-design.md smeargle §2): responsive coverage for the Leads screens
// (LeadsList, LeadDetail) at 390/768/1440, run via playwright.config.ts's three viewport projects
// against RUNTIME_URL. `tests/e2e/responsive/map-shell.spec.ts` only covers Map+AppShell — its own
// header comment and smeargle's design consult both say so explicitly — so LeadDetail/LeadsList
// get their own file here, following that file's exact shape (`signIn()` helper,
// `document.fonts.ready`) and reusing its assertions verbatim: no horizontal overflow, the shared
// AppShell/NavRail compact-vs-rail visibility swap and row-vs-column layout switch at the 600px
// rail breakpoint (this app's one real "breakpoints config" — see map-shell.spec.ts's header),
// bounding-box containment, and the Atlas token audit. `Leads.module.css` itself defines no
// `@media` query of its own (checked before writing this file) — LeadsList/LeadDetail have no
// bespoke responsive layout to assert beyond the shared AppShell shell they render inside, so this
// file does not invent one; it proves the shell behaves the same way on these two routes as it
// does on Map, and that neither screen's own content causes overflow at any width. Not business
// logic (filters, status updates, notes) — that's tests/e2e/B-07.spec.ts's job.
import { expect, test } from "@playwright/test";
import { atlasTokenAudit, AUDITED_PROPERTIES } from "../lib/atlas-tokens.js";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";

// Signed in once by the `setup` project (tests/e2e/lib/auth.ts); this file tests layout, not sign-in.
test.use({ storageState: AUTH_STATE_PATH });

async function gotoLeadsList(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/leads");
  await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test.describe("Responsive design: LeadsList screen", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    await gotoLeadsList(page);
  });

  test("renders with no horizontal overflow", async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("shows the roadmap sections in the surface this breakpoint owns (More sheet below 600px, nav rail from 600px)", async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const isCompact = (viewport?.width ?? 0) < 600;

    const moreTrigger = page.getByRole("button", { name: "More", exact: true });
    const navRail = page.locator('[aria-label="Roadmap sections (not yet built)"]');

    if (isCompact) {
      await expect(moreTrigger).toBeVisible();
      await expect(navRail).toBeHidden();
    } else {
      await expect(moreTrigger).toBeHidden();
      await expect(navRail).toBeVisible();
    }
  });

  test("the primary nav switches from row (bottom bar) to column (left rail) layout at the rail breakpoint", async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const isCompact = (viewport?.width ?? 0) < 600;
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav).toHaveCSS("flex-direction", isCompact ? "row" : "column");
  });

  test("the lead filter controls stay reachable without horizontal scroll", async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const filters = page.locator('[aria-label="Lead filters"]');
    await expect(filters).toBeVisible();
    const box = await filters.boundingBox();
    expect(box).not.toBeNull();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });

  test("passes the Atlas design-token audit (no non-token color, type, spacing or radius values)", async ({
    page,
  }) => {
    const audit = await page.evaluate(atlasTokenAudit, AUDITED_PROPERTIES);
    expect(audit.checkedElements).toBeGreaterThan(0);
    expect(audit.violations, JSON.stringify(audit.violations, null, 2)).toEqual([]);
  });
});

test.describe("Responsive design: LeadDetail screen", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    await gotoLeadsList(page);
  });

  test("renders with no horizontal overflow and passes the Atlas token audit", async ({ page }) => {
    // Reaching LeadDetail needs a real lead on the deployed index (a seeded/fixture-free
    // navigation step, not business-logic coverage — tests/e2e/B-07.spec.ts owns the lead
    // lifecycle itself). When the hosted account has none yet, this is an honest skip, not a
    // false pass — same "a degraded/absent state is valid proof, not failure" precedent
    // map-shell.spec.ts's CrmMapIndexDown390 case sets.
    const firstCard = page.locator("li[data-lead-id] a").first();
    test.skip((await firstCard.count()) === 0, "No lead exists yet on the deployed index");

    await firstCard.click();
    await expect(page.locator("#lead-title")).toBeVisible(); // not "any h2": the desktop layout keeps the Leads list pane beside the lead
    await page.evaluate(() => document.fonts.ready);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    const audit = await page.evaluate(atlasTokenAudit, AUDITED_PROPERTIES);
    expect(audit.checkedElements).toBeGreaterThan(0);
    expect(audit.violations, JSON.stringify(audit.violations, null, 2)).toEqual([]);
  });
});
