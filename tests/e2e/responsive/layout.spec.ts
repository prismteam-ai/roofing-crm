// Layout geometry at 390/768/1440 (design-review-log rows 60–68; boards CrmMap390/768/1440,
// CrmProperty390/1440, CrmShell390/1440, CrmLeads390/1440). The other responsive specs check
// overflow, nav mode and tokens; none of them measured where the panes actually sit, which is how
// a map stacked under its filters with the results below the fold went unnoticed. This file
// asserts what a person would see, with bounding boxes against the viewport and the shell's own
// bar, rail and bottom navigation: three panes side by side on desktop, a map-first screen with a
// results sheet on compact, the drawer's shape, Sign out and the data chip reachable, rail items
// contained, and readable values. Visual and responsive checks only: nothing is created, filtered
// or signed out (the Sign out control is shown, never pressed). Read-only browsing as the seeded
// admin with the saved session; runs in the parallel phase.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { LAYOUT_SEARCH_PATH } from "../lib/run-fixtures.js";
import { settledBox } from "../lib/layout.js";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";

test.use({ storageState: AUTH_STATE_PATH });

type MapLayout = "panes" | "docked" | "sheet";
type DrawerLayout = "side" | "full";

interface Layout {
  /** Primary navigation: bottom bar below 600 px, rail from 600 px (AppShell.module.css). */
  readonly nav: "bottom" | "rail";
  /** Map screen: three panes from 1280 px; a docked split (map above, results panel below, no sheet handle) from 600 to 1279 px; map plus results bottom sheet below 600 px (Map.module.css, ResultsSheet.module.css). */
  readonly map: MapLayout;
  /** Property drawer: side sheet in the three-pane layout (from 1280 px), full-height sheet below. */
  readonly drawer: DrawerLayout;
  /** Leads filters: a sheet behind a Filters button below 600 px, inline from 600 px. */
  readonly leadsFilters: "sheet" | "inline";
  /** Top bar: the county label and the long data text need 840 px; below, the chip is short (the top bar keeps its own 840 px break). */
  readonly topBar: "compact" | "full";
}

/** One entry per viewport project in playwright.config.ts. */
const LAYOUTS: Record<string, Layout> = {
  "mobile-390": {
    nav: "bottom",
    map: "sheet",
    drawer: "full",
    leadsFilters: "sheet",
    topBar: "compact",
  },
  "tablet-768": {
    nav: "rail",
    map: "docked",
    drawer: "full",
    leadsFilters: "inline",
    topBar: "compact",
  },
  "desktop-1440": {
    nav: "rail",
    map: "panes",
    drawer: "side",
    leadsFilters: "inline",
    topBar: "full",
  },
};

const DESIGN = {
  /** Rounding slack for edges that should meet exactly. */
  edge: 1,
  /** The drawer's side sheet is 440 px on the boards; anything wider than this crowds the map. */
  drawerMaxWidth: 480,
  /** On a sheet layout the map should own at least half of the window's height. */
  mapMinHeightShare: 0.5,
  /** In the docked split (below the 1280 px three-pane break) the map must keep at least this width. */
  mapMinWidthDocked: 520,
} as const;

/** An east Travis County pin that has result rows under Run 2 at 3 mi and answers in about 2 s;
 *  see lib/run-fixtures.ts for how it was read. */
const SEARCH_PATH = LAYOUT_SEARCH_PATH;

/** ISO date-times and snake_case codes must never reach the screen (design-review-log row 68). */
const RAW_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const RAW_SNAKE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function ensureBox(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, "element has a layout box").not.toBeNull();
  return box as Box;
}

const right = (b: Box): number => b.x + b.width;
const bottom = (b: Box): number => b.y + b.height;

function layoutFor(projectName: string): Layout {
  const layout = LAYOUTS[projectName];
  if (layout === undefined) throw new Error(`No layout expectations for project ${projectName}`);
  return layout;
}

function viewportOf(page: Page): { width: number; height: number } {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("viewport size not set");
  return viewport;
}

function expectInsideViewport(box: Box, page: Page, what: string): void {
  const { width, height } = viewportOf(page);
  expect(box.x, `${what}: left edge on screen`).toBeGreaterThanOrEqual(-DESIGN.edge);
  expect(box.y, `${what}: top edge on screen`).toBeGreaterThanOrEqual(-DESIGN.edge);
  expect(right(box), `${what}: right edge on screen`).toBeLessThanOrEqual(width + DESIGN.edge);
  expect(bottom(box), `${what}: bottom edge in the first viewport`).toBeLessThanOrEqual(
    height + DESIGN.edge,
  );
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
  const h = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
  return w > DESIGN.edge && h > DESIGN.edge ? w * h : 0;
}

async function ready(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
}

const shell = (page: Page) => ({
  bar: page.getByRole("banner"),
  nav: page.getByRole("navigation", { name: "Primary" }),
});

const mapScreen = (page: Page) => ({
  region: page.locator('[data-route="map"]'),
  canvas: page.getByTestId("crm-map"),
  // A pane (role region) from 1280 px, a sheet (role dialog, closed until opened) below.
  filters: page
    .locator('[data-route="map"]')
    .getByRole("region", { name: "Filters" })
    .or(page.locator('[data-route="map"]').getByRole("dialog", { name: "Filters" })),
  results: page.getByRole("region", { name: "Results", exact: true }),
  handle: page.getByRole("button", { name: /results sheet/ }),
  firstRow: page.locator("[data-result-row]").first(),
  drawer: page.locator('[role="dialog"][data-property-cid]'),
});

async function openMapSearch(page: Page): Promise<void> {
  await page.goto(SEARCH_PATH);
  await expect(mapScreen(page).region).toBeVisible();
  await expect(
    mapScreen(page).firstRow,
    "the pin's radius search lists at least one property",
  ).toBeAttached({ timeout: 30_000 });
  await ready(page);
}

test.describe("Layout: Map screen", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    await openMapSearch(page);
  });

  test("the map screen fills the main region edge to edge (no page margin)", async ({
    page,
  }, testInfo) => {
    const layout = layoutFor(testInfo.project.name);
    const { width, height } = viewportOf(page);
    const bar = await ensureBox(shell(page).bar);
    const nav = await ensureBox(shell(page).nav);
    const region = await ensureBox(mapScreen(page).region);

    expect(
      Math.abs(region.y - bottom(bar)),
      "map screen starts right under the top bar",
    ).toBeLessThanOrEqual(DESIGN.edge);
    expect(
      Math.abs(right(region) - width),
      "map screen meets the right window edge",
    ).toBeLessThanOrEqual(DESIGN.edge);
    if (layout.nav === "rail") {
      expect(
        Math.abs(region.x - right(nav)),
        "map screen meets the navigation rail",
      ).toBeLessThanOrEqual(DESIGN.edge);
      expect(
        Math.abs(bottom(region) - height),
        "map screen reaches the bottom of the window",
      ).toBeLessThanOrEqual(DESIGN.edge);
    } else {
      expect(Math.abs(region.x), "map screen meets the left window edge").toBeLessThanOrEqual(
        DESIGN.edge,
      );
      expect(
        Math.abs(bottom(region) - nav.y),
        "map screen reaches the bottom navigation",
      ).toBeLessThanOrEqual(DESIGN.edge);
    }
  });

  test("desktop: filters left, map centre, results right, all in the first viewport, no overlap", async ({
    page,
  }, testInfo) => {
    test.skip(layoutFor(testInfo.project.name).map !== "panes", "three panes from 1280 px only");
    const screen = mapScreen(page);
    const filters = await ensureBox(screen.filters);
    const canvas = await ensureBox(screen.canvas);
    const results = await ensureBox(screen.results);
    const { width } = viewportOf(page);

    expectInsideViewport(filters, page, "filters pane");
    expectInsideViewport(canvas, page, "map");
    expectInsideViewport(results, page, "results pane");

    expect(right(filters), "filters sit left of the map").toBeLessThanOrEqual(
      canvas.x + DESIGN.edge,
    );
    expect(right(canvas), "results sit right of the map").toBeLessThanOrEqual(
      results.x + DESIGN.edge,
    );
    expect(overlapArea(filters, canvas), "filters and map do not overlap").toBe(0);
    expect(overlapArea(canvas, results), "map and results do not overlap").toBe(0);
    expect(overlapArea(filters, results), "filters and results do not overlap").toBe(0);

    expect(
      Math.abs(right(results) - width),
      "results pane meets the right window edge",
    ).toBeLessThanOrEqual(DESIGN.edge);
    expect(canvas.width, "the map is the widest pane").toBeGreaterThan(
      Math.max(filters.width, results.width),
    );
  });

  test("phone: the map fills the width under the toolbar, the results handle is in view", async ({
    page,
  }, testInfo) => {
    test.skip(layoutFor(testInfo.project.name).map !== "sheet", "results sheet below 600 px only");
    const screen = mapScreen(page);
    const region = await ensureBox(screen.region);
    const canvas = await ensureBox(screen.canvas);
    const { height } = viewportOf(page);

    expect(Math.abs(canvas.x - region.x), "map meets the left edge").toBeLessThanOrEqual(
      DESIGN.edge,
    );
    expect(Math.abs(right(canvas) - right(region)), "map meets the right edge").toBeLessThanOrEqual(
      DESIGN.edge,
    );
    expect(
      Math.abs(bottom(canvas) - bottom(region)),
      "map runs to the bottom of the screen",
    ).toBeLessThanOrEqual(DESIGN.edge);
    expect(canvas.height, "map owns most of the screen height").toBeGreaterThanOrEqual(
      height * DESIGN.mapMinHeightShare,
    );

    await expect(screen.handle).toBeVisible();
    const handle = await ensureBox(screen.handle);
    expectInsideViewport(handle, page, "results sheet handle");
    expect(handle.y, "the handle sits over the map, not below it").toBeGreaterThanOrEqual(canvas.y);
    expect(bottom(handle), "the handle is above the bottom of the map").toBeLessThanOrEqual(
      bottom(region) + DESIGN.edge,
    );
  });

  /** The docked split from 600 to 1279 px: the map above, the results panel below it, both inside
   *  the window, no sheet handle, no sideways scroll. */
  async function expectDockedSplit(page: Page, what: string): Promise<void> {
    const screen = mapScreen(page);
    await expect(screen.canvas).toBeVisible();
    await expect(
      screen.results,
      `${what}: the results panel is visible without a handle`,
    ).toBeVisible();
    await expect(screen.handle, `${what}: no results sheet handle`).toBeHidden();
    const canvas = await ensureBox(screen.canvas);
    const results = await ensureBox(screen.results);
    expectInsideViewport(canvas, page, `${what}: map`);
    expectInsideViewport(results, page, `${what}: results panel`);
    expect(bottom(canvas), `${what}: the map sits above the results`).toBeLessThanOrEqual(
      results.y + DESIGN.edge,
    );
    expect(overlapArea(canvas, results), `${what}: map and results do not overlap`).toBe(0);
    expect(canvas.width, `${what}: the map keeps its working width`).toBeGreaterThanOrEqual(
      DESIGN.mapMinWidthDocked,
    );
    expect(await screen.filters.isVisible(), `${what}: no filters pane below 1280 px`).toBe(false);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `${what}: no horizontal overflow`).toBeLessThanOrEqual(clientWidth);
  }

  test("tablet: docked split, the map above the results, no sheet handle", async ({
    page,
  }, testInfo) => {
    test.skip(layoutFor(testInfo.project.name).map !== "docked", "docked split at 600 to 1279 px");
    await expectDockedSplit(page, "768 px");
  });

  test("1032 px: docked split, the map keeps at least 520 px, no sheet handle", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "one extra width, checked once");
    await page.setViewportSize({ width: 1032, height: 800 });
    await ready(page);
    await expectDockedSplit(page, "1032 px");
  });

  test("opening a result shows the property drawer in the shape this width owns", async ({
    page,
  }, testInfo) => {
    const layout = layoutFor(testInfo.project.name);
    const screen = mapScreen(page);
    await screen.firstRow.getByRole("button", { name: "Open details" }).click();
    await expect(screen.drawer).toBeVisible({ timeout: 20_000 });
    await ready(page);

    // The drawer slides in: measure it once its box stopped moving, not after a guessed delay.
    const drawer = await settledBox(screen.drawer);
    const region = await ensureBox(screen.region);
    const { width } = viewportOf(page);
    expect(
      Math.abs(drawer.y - region.y),
      "drawer starts at the top of the map screen",
    ).toBeLessThanOrEqual(DESIGN.edge);
    expect(
      Math.abs(bottom(drawer) - bottom(region)),
      "drawer runs the full height",
    ).toBeLessThanOrEqual(DESIGN.edge);
    expect(
      Math.abs(right(drawer) - width),
      "drawer meets the right window edge",
    ).toBeLessThanOrEqual(DESIGN.edge);

    if (layout.drawer === "full") {
      expect(
        Math.abs(drawer.x - region.x),
        "full-height sheet covers the screen width",
      ).toBeLessThanOrEqual(DESIGN.edge);
    } else {
      expect(drawer.width, "side sheet stays narrow").toBeLessThanOrEqual(DESIGN.drawerMaxWidth);
      const createLead = screen.drawer.getByRole("button", { name: "Create lead", exact: true });
      // The drawer checks Leads first, so the button appears once that lookup answers.
      await expect(createLead).toBeVisible({ timeout: 15_000 });
      const action = await ensureBox(createLead);
      expectInsideViewport(action, page, "Create lead");
      expect(action.y, "Create lead is inside the drawer").toBeGreaterThanOrEqual(drawer.y);
    }
  });

  test("results and drawer show readable values: no ISO timestamps, no snake_case codes", async ({
    page,
  }) => {
    const screen = mapScreen(page);
    const resultsText = await page.getByTestId("search-results").innerText();
    expect(resultsText, "results list has no raw ISO timestamps").not.toMatch(RAW_ISO);
    expect(resultsText, "results list has no snake_case codes").not.toMatch(RAW_SNAKE);

    await screen.firstRow.getByRole("button", { name: "Open details" }).click();
    await expect(screen.drawer).toBeVisible({ timeout: 20_000 });
    const drawerText = await screen.drawer.innerText();
    expect(drawerText, "drawer has no raw ISO timestamps").not.toMatch(RAW_ISO);
    expect(drawerText, "drawer has no snake_case codes").not.toMatch(RAW_SNAKE);
  });
});

test.describe("Layout: app shell", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    await page.goto("/");
    await expect(mapScreen(page).region).toBeVisible();
    await ready(page);
  });

  test("Sign out is reachable: account menu from 600 px, More sheet at 390", async ({
    page,
  }, testInfo) => {
    const layout = layoutFor(testInfo.project.name);
    let signOut: Locator;
    if (layout.nav === "rail") {
      await page.getByRole("banner").getByRole("button", { name: "Account" }).click();
      signOut = page.getByRole("menu", { name: "Account" }).getByRole("menuitem", {
        name: "Sign out",
      });
    } else {
      await shell(page).nav.getByRole("button", { name: "More", exact: true }).click();
      signOut = page.getByRole("dialog", { name: "More" }).getByRole("button", {
        name: /Sign out/,
      });
      await signOut.scrollIntoViewIfNeeded();
    }
    await expect(signOut).toBeVisible();
    expectInsideViewport(await ensureBox(signOut), page, "Sign out");
    await page.keyboard.press("Escape");
  });

  test("the data chip is visible in the top bar from 600 px", async ({ page }, testInfo) => {
    test.skip(layoutFor(testInfo.project.name).nav !== "rail", "chip checked from 600 px");
    const chip = shell(page).bar.getByRole("button", { name: /^Data:/ });
    await expect(chip).toBeVisible();
    expectInsideViewport(await ensureBox(chip), page, "data chip");
  });

  test("every navigation rail item, label and Soon pill stays inside the rail", async ({
    page,
  }, testInfo) => {
    test.skip(layoutFor(testInfo.project.name).nav !== "rail", "rail from 600 px only");
    const nav = shell(page).nav;
    await expect(nav.locator("[data-roadmap-section]").first()).toBeVisible();
    const spills = await nav.evaluate((rail, edge) => {
      const box = rail.getBoundingClientRect();
      const items = rail.querySelectorAll("a, [data-roadmap-section]");
      const out: string[] = [];
      for (const item of Array.from(items)) {
        for (const el of [item, ...Array.from(item.querySelectorAll("*"))]) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < box.left - edge || r.right > box.right + edge) {
            const name = (item as HTMLElement).innerText.replace(/\s+/g, " ").trim();
            out.push(`${name}: ${Math.round(r.left)}–${Math.round(r.right)}`);
          }
        }
      }
      return out;
    }, DESIGN.edge);
    expect(spills, "no rail item spills past the rail's edges").toEqual([]);
  });
});

test.describe("Layout: Leads filters", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    // With filters in the URL the panel is shown whether or not this user has leads (with no
    // leads at all and no filter, the page shows "No leads yet" and hides the panel by design), so
    // the layout check does not depend on what other specs have created.
    await page.goto("/leads?roof=20&permit=open");
    await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
    await ready(page);
  });

  test("filters are a sheet behind a button at 390 and inline from 600 px", async ({
    page,
  }, testInfo) => {
    const region = page.getByRole("region", { name: "Lead filters" });
    const toggle = region.getByRole("button", { name: /^Filters/ });
    const statusChips = region.getByRole("group", { name: "Lead status" });

    if (layoutFor(testInfo.project.name).leadsFilters === "sheet") {
      await expect(toggle).toBeVisible();
      await expect(statusChips).toBeHidden();
      await toggle.click();
      const sheet = page.getByRole("dialog", { name: "Filters" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("group", { name: "Lead status" })).toBeVisible();
      const box = await ensureBox(sheet);
      const { width } = viewportOf(page);
      expect(box.width, "the sheet spans the window width").toBeGreaterThanOrEqual(
        width - DESIGN.edge * 2,
      );
      await page.keyboard.press("Escape");
    } else {
      await expect(toggle).toBeHidden();
      await expect(statusChips).toBeVisible();
      expectInsideViewport(await ensureBox(statusChips), page, "lead status chips");
    }
  });
});

test.describe("Layout: top bar below 840 px and the open Coming-soon page", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    await page.goto("/leads");
    await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
    await ready(page);
  });

  test("the bar fits its title, data chip and menus; the county label and long data text only from 840 px", async ({
    page,
  }, testInfo) => {
    const layout = layoutFor(testInfo.project.name);
    const bar = shell(page).bar;
    const chip = bar.getByRole("button", { name: /^Data:/ });
    const account = bar.getByRole("button", { name: "Account" });
    const county = bar.locator("[data-county]");
    await expect(chip).toBeVisible();
    // The label depends on the run being read, so wait for it before judging what the chip shows.
    await expect(chip).toHaveAttribute("data-state", "ready");

    if (layout.topBar === "compact") {
      await expect(county, "county label is dropped below 840 px").toBeHidden();
      // The chip reads like "Run 3" or "Data", never the long "Data: CountyLens run ..." text.
      // Visible text only: the long label stays in the DOM, hidden, for the accessible name.
      await expect(chip).not.toContainText("CountyLens", { useInnerText: true });
      await expect(chip, "the full run stays in the tooltip").toHaveAttribute(
        "title",
        /CountyLens/,
      );
    } else {
      await expect(county).toBeVisible();
      // The wide chip names the run in words ("Run 24 Oct 2026", earlier "Data: CountyLens run ...").
      await expect(chip).toContainText(/run/i, { useInnerText: true });
    }

    const chipBox = await ensureBox(chip);
    const accountBox = await ensureBox(account);
    expectInsideViewport(chipBox, page, "data chip");
    expectInsideViewport(accountBox, page, "account button");
    expect(overlapArea(chipBox, accountBox), "chip and account do not overlap").toBe(0);
    const title = bar.getByRole("heading", { name: "Roofing CRM" });
    expect(overlapArea(await ensureBox(title), chipBox), "title and chip do not overlap").toBe(0);
    const apps = bar.getByRole("button", { name: "Apps" });
    if (layout.nav === "rail") {
      expect(overlapArea(await ensureBox(apps), chipBox), "Apps and chip do not overlap").toBe(0);
    }
  });

  test("the open Coming-soon section is the current page (aria-current) in the rail or the More sheet", async ({
    page,
  }, testInfo) => {
    await page.goto("/coming-soon/campaigns");
    await ready(page);
    const layout = layoutFor(testInfo.project.name);
    if (layout.nav === "rail") {
      const rail = shell(page).nav;
      const current = rail.locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveAttribute("data-roadmap-section", "campaigns");
    } else {
      await shell(page).nav.getByRole("button", { name: "More", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "More" });
      await expect(sheet.locator('[aria-current="page"][data-roadmap-section]')).toHaveAttribute(
        "data-roadmap-section",
        "campaigns",
      );
      await page.keyboard.press("Escape");
    }
  });
});

// ---- No horizontal scroll at the narrowest widths a person meets -----------------------------
// The page must never scroll sideways: scrollWidth of the document stays within the window width.
// One project is enough (the viewport is set per case); each case waits for its own content first.
const NO_SCROLL_WIDTHS = [360, 600, 1280] as const;
const SHEET_WIDTHS = [360, 600] as const;
const AI_WIDTHS = [1280, 360] as const;
const SEARCH_QUERY = SEARCH_PATH.slice(1); // "?lat=...&lng=...&r=3"

async function expectNoSideScroll(page: Page, what: string): Promise<void> {
  await ready(page);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    `${what}: scrollWidth ${scrollWidth} within window ${innerWidth}`,
  ).toBeLessThanOrEqual(innerWidth);
}

test.describe("Layout: no horizontal scroll at 360, 600 and 1280 px", () => {
  // Playwright requires the first argument to be a destructuring pattern, even an empty one.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(async ({}, testInfo) => {
    requirePassword();
    test.skip(testInfo.project.name !== "desktop-1440", "viewport is set per case; run once");
  });

  for (const width of NO_SCROLL_WIDTHS) {
    test(`${width}: the map at the east pin`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openMapSearch(page);
      await expectNoSideScroll(page, `map at ${width}`);
    });

    test(`${width}: the list view`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/?${SEARCH_QUERY}&view=list`);
      await expect(mapScreen(page).region).toBeVisible();
      await expect(
        page.locator("[data-result-row], [data-state^='CrmCandidates']").first(),
      ).toBeAttached({
        timeout: 30_000,
      });
      await expectNoSideScroll(page, `list view at ${width}`);
    });

    test(`${width}: /leads`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/leads");
      await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
      await expectNoSideScroll(page, `leads at ${width}`);
    });
  }

  for (const width of SHEET_WIDTHS) {
    test(`${width}: the phone Filters sheet open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openMapSearch(page);
      await page
        .locator('[data-route="map"]')
        .getByRole("button", { name: /^Filters/ })
        .click();
      await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
      await expectNoSideScroll(page, `Filters sheet at ${width}`);
    });
  }

  for (const width of AI_WIDTHS) {
    test(`${width}: the AI panel`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/?mode=ai");
      await expect(page.locator('[data-panel="ask"]')).toBeVisible();
      await expectNoSideScroll(page, `AI panel at ${width}`);
    });
  }
});
