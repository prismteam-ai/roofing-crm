// Shared geometry helpers for the responsive specs: bounding boxes, the viewport and "wait until
// the element stopped moving" (a sheet slides in, so a box read mid-transition is meaningless).
import { expect, type Locator, type Page } from "@playwright/test";

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Rounding slack for edges that should meet exactly. */
export const EDGE = 1;
/** Smallest comfortable touch target (Material 3 asks 48 px; 44 px is the floor asserted here). */
export const MIN_TAP = 44;

export const right = (b: Box): number => b.x + b.width;
export const bottom = (b: Box): number => b.y + b.height;

export function viewportOf(page: Page): { width: number; height: number } {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("viewport size not set");
  return viewport;
}

/**
 * Waits until the locator's bounding box is identical on several consecutive animation frames
 * (a slide-in or a scroll has ended), then returns it. No fixed sleep: it ends on the transition
 * itself, or fails after `timeout` with the last box seen.
 */
export async function settledBox(locator: Locator, timeout = 5_000): Promise<Box> {
  await expect(locator).toBeVisible();
  const handle = await locator.elementHandle();
  if (handle === null) throw new Error("element detached");
  try {
    const result = await handle.evaluate(
      (el, limit) =>
        new Promise<{ x: number; y: number; width: number; height: number }>((resolve, reject) => {
          const started = performance.now();
          let last = "";
          let same = 0;
          const tick = (): void => {
            const r = el.getBoundingClientRect();
            const key = [r.x, r.y, r.width, r.height].map((n) => n.toFixed(2)).join();
            same = key === last ? same + 1 : 0;
            last = key;
            if (same >= 4) {
              resolve({ x: r.x, y: r.y, width: r.width, height: r.height });
            } else if (performance.now() - started > limit) {
              reject(new Error(`box never settled; last ${last}`));
            } else {
              requestAnimationFrame(tick);
            }
          };
          requestAnimationFrame(tick);
        }),
      timeout,
    );
    return result;
  } finally {
    await handle.dispose();
  }
}

export async function ensureBox(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, "element has a layout box").not.toBeNull();
  return box as Box;
}

export function expectInsideViewport(box: Box, page: Page, what: string): void {
  const { width, height } = viewportOf(page);
  expect(box.x, `${what}: left edge on screen`).toBeGreaterThanOrEqual(-EDGE);
  expect(box.y, `${what}: top edge on screen`).toBeGreaterThanOrEqual(-EDGE);
  expect(right(box), `${what}: right edge on screen`).toBeLessThanOrEqual(width + EDGE);
  expect(bottom(box), `${what}: bottom edge on screen`).toBeLessThanOrEqual(height + EDGE);
}

export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
  const h = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
  return w > EDGE && h > EDGE ? w * h : 0;
}

export async function expectNoHorizontalScroll(page: Page, what: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${what}: no horizontal page scroll`).toBeLessThanOrEqual(clientWidth);
}
