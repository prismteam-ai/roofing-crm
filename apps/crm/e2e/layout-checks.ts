/**
 * Layout checks of the aside at each breakpoint, shared by the hosted suite (crm.spec.ts, test 42) and the local
 * lane (e2e/local), so both run the same steps and the same assertions.
 *
 * styles.css turns the page into one column at max-width 760px (760 itself is one column). There the aside is
 * below the map and nothing may cover the content that follows the controls; in the wider layouts the controls
 * stay in one place at the top of the aside while the rest scrolls below them.
 */
import { expect, type Locator, type Page } from "@playwright/test";

export type LayoutBreakpoint = {
  name: string;
  viewport: { width: number; height: number };
  oneColumn: boolean;
};
/** Breakpoints of the aside (responsive-design-tests method): two one-column widths and the two wider layouts. */
export const LAYOUT_BREAKPOINTS: LayoutBreakpoint[] = [
  {
    name: "phone (one column)",
    viewport: { width: 390, height: 844 },
    oneColumn: true,
  },
  {
    name: "widest one column",
    viewport: { width: 759, height: 900 },
    oneColumn: true,
  },
  { name: "tablet", viewport: { width: 768, height: 1024 }, oneColumn: false },
  {
    name: "desktop",
    viewport: { width: 1280, height: 800 },
    oneColumn: false,
  },
];

/** Van Nuys, the suite's usual start. */
const START = "/?lat=34.199&lon=-118.487&z=13";
/** The elements that follow the controls in the aside, plus the agent's button and box. */
const FOLLOWING =
  "aside > section.controls ~ *, [data-testid=agent-open], [data-testid=agent-body]";

/** Opens a details element by a click on its summary, as a user does. */
const expand = async (details: Locator) => {
  if (!(await details.evaluate((e) => (e as HTMLDetailsElement).open)))
    await details.locator(":scope > summary").click();
  await expect(details).toHaveAttribute("open", "");
};

/**
 * Opens the page at the breakpoint, drops the pin at the map center and opens the results, the long-open permits
 * and the leads, so the aside is taller than its window.
 */
export async function openLayout(page: Page, bp: LayoutBreakpoint) {
  await page.setViewportSize(bp.viewport);
  await page.goto(START);
  await expect(page.getByTestId("map")).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
  await page.getByTestId("map").click(); // pin at the center
  await expect(page.getByTestId("result-count")).toHaveAttribute(
    "data-count",
    /^[1-9]\d*$/,
    { timeout: 20_000 },
  );
  for (const id of ["results-details", "permits-details", "leads-details"]) {
    const d = page.getByTestId(id);
    await expect(d).toBeAttached({ timeout: 20_000 });
    await expand(d);
  }
}

/**
 * Scrolls the aside from its top to its end in small steps; at each step, for each element that follows the
 * controls and is (partly) in view, the topmost element at the center of its visible part must be that element or
 * inside it. Returns the steps where it was not (empty when nothing covers the content), and the number of checks.
 */
const coveredContent = (page: Page) =>
  page.evaluate((selector) => {
    const aside = document.querySelector("aside")!;
    const name = (e: Element | null) =>
      !e
        ? "nothing"
        : (e.getAttribute("data-testid") ??
          `${e.tagName.toLowerCase()}${e.className ? `.${String(e.className).split(" ")[0]}` : ""}`);
    const end = aside.scrollHeight - aside.clientHeight;
    const steps = new Set([end]);
    for (let y = 0; y < end; y += 20) steps.add(y);
    const covered: string[] = [];
    let checks = 0;
    for (const y of steps) {
      aside.scrollTop = y;
      const a = aside.getBoundingClientRect();
      const top = Math.max(a.top + aside.clientTop, 0),
        bottom = Math.min(
          a.top + aside.clientTop + aside.clientHeight,
          innerHeight,
        ),
        left = Math.max(a.left + aside.clientLeft, 0),
        right = Math.min(
          a.left + aside.clientLeft + aside.clientWidth,
          innerWidth,
        );
      for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        const t = Math.max(r.top, top),
          b = Math.min(r.bottom, bottom),
          l = Math.max(r.left, left),
          rt = Math.min(r.right, right);
        if (b - t < 1 || rt - l < 1) continue; // not in view at this step
        checks++;
        const hit = document.elementFromPoint((l + rt) / 2, (t + b) / 2);
        if (!hit || !el.contains(hit))
          covered.push(`${name(el)} covered by ${name(hit)} at scroll ${y}`);
      }
    }
    aside.scrollTop = 0;
    return { covered, checks };
  }, FOLLOWING);

/**
 * One column: nothing covers the content below the controls at any scroll position, and "Ask the agent" (with
 * the aside scrolled to its end) opens with a plain click, no force; then the agent's box is not covered either.
 * Wider layouts: the controls keep their sticky rule and stay in place while the aside scrolls.
 */
export async function expectLayout(page: Page, bp: LayoutBreakpoint) {
  const aside = page.locator("aside");
  const controls = page.locator("aside > section.controls");
  if (bp.oneColumn) {
    const before = await coveredContent(page);
    expect(before.checks).toBeGreaterThan(0);
    // Soft: when content is covered, the click below still runs and reports its own failure.
    expect
      .soft(before.covered, "content covered before the agent is opened")
      .toEqual([]);
    await aside.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.getByTestId("agent-open").click({ timeout: 5_000 });
    await expect(page.getByTestId("agent-body")).toBeVisible();
    const after = await coveredContent(page);
    expect(after.covered, "content covered after the agent is opened").toEqual(
      [],
    );
  } else {
    // The wider layouts keep the controls' rule as it was (sticky at the aside's top, its own scroll when tall).
    await expect(controls).toHaveCSS("position", "sticky");
    await expect(controls).toHaveCSS("top", "-12px");
    await expect(controls).toHaveCSS("z-index", "4");
    await expect(controls).toHaveCSS("overflow-y", "auto");
    await expect(controls).toHaveCSS(
      "max-height",
      `${0.6 * bp.viewport.height}px`,
    );
    const y0 = (await controls.boundingBox())!.y;
    await aside.evaluate((el) => el.scrollTo(0, 600));
    await expect
      .poll(() => aside.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    expect(
      Math.abs((await controls.boundingBox())!.y - y0),
    ).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("radius")).toBeInViewport();
  }
  await expectLeadsBox(page);
  await expectNoSideScroll(page);
}

/** The boxes that must never scroll sideways: the aside, the controls (with the ownership filter) and the leads. */
const NO_SIDE_SCROLL = [
  "aside",
  "aside > section.controls",
  "[data-testid=ownership]",
  "[data-testid=leads]",
];
/** Each box of NO_SIDE_SCROLL that is wider inside than it shows (its scrollWidth beyond its clientWidth), in px. */
const sideScroll = (page: Page) =>
  page.evaluate(
    (selectors) =>
      selectors.flatMap((s) => {
        const e = document.querySelector(s);
        if (!e) return [`${s} missing`];
        const extra = e.scrollWidth - e.clientWidth;
        return extra > 0 ? [`${s} ${extra}px wider than shown`] : [];
      }),
    NO_SIDE_SCROLL,
  );

/**
 * No horizontal scrollbar in the aside, the controls, the ownership filter or the leads box: with the ownership
 * filter off, and turned on (its bases and rules shown).
 */
export async function expectNoSideScroll(page: Page) {
  expect(await sideScroll(page), "ownership filter off").toEqual([]);
  const on = page.getByTestId("ownership-on");
  if (!(await on.isChecked())) await on.check();
  await expect(page.getByTestId("ownership-basis")).toHaveCount(3);
  await expand(page.getByTestId("ownership-rules"));
  expect(await sideScroll(page), "ownership filter on").toEqual([]);
}

/** The leads box's controls, top to bottom: each on a line of its own. */
export const LEAD_CONTROLS = [
  "leads-status-filter-label",
  "leads-in-search-label",
  "leads-long-open-label",
  "leads-permit-filter-label",
];
/** The permit-status filter's choices as shown, in order. */
export const PERMIT_CHOICE_TEXTS = [
  "all permit statuses",
  "Open (issued)",
  "Open (application stage)",
  "Closed",
  "Unclear (neither open nor closed)",
  "no permit on the lead",
];
/** The one type size of the leads box (its heading aside). */
export const LEADS_FONT_SIZE = "13px";

/**
 * The leads box: one control per line, in order; the permit-status control enabled with its choices; the filters' help folded under "How the filters work" (closed); one type size for every text and control
 * but the heading.
 */
export async function expectLeadsBox(page: Page) {
  const leads = page.getByTestId("leads");
  await leads.scrollIntoViewIfNeeded();
  const boxes = [];
  for (const id of LEAD_CONTROLS) {
    const b = await leads.getByTestId(id).boundingBox();
    expect(b, `${id} shown`).not.toBeNull();
    boxes.push(b!);
  }
  for (let i = 1; i < boxes.length; i++)
    expect(
      boxes[i]!.y,
      `${LEAD_CONTROLS[i]} on a line below ${LEAD_CONTROLS[i - 1]}`,
    ).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height - 1);
  const permit = leads.getByTestId("leads-permit-filter");
  await expect(permit).toBeEnabled();
  await expect(permit.locator("option")).toHaveText(PERMIT_CHOICE_TEXTS);
  const help = leads.getByTestId("leads-filters-help");
  await expect(help.locator(":scope > summary")).toHaveText(
    "How the filters work",
  );
  await expect(help).not.toHaveAttribute("open", /.*/);
  const sizes = await leads.evaluate((box) => {
    const out = new Set<string>();
    for (const e of box.querySelectorAll("*")) {
      if (e.closest("h3")) continue;
      const ownText = [...e.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "",
      );
      if (ownText || e.matches("select, input, button"))
        out.add(getComputedStyle(e).fontSize);
    }
    return [...out];
  });
  expect(sizes, "font sizes in the leads box").toEqual([LEADS_FONT_SIZE]);
}
