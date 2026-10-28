import { test, expect, type Page } from "@playwright/test";
import { answerQuestion } from "../../packages/agent/src/index";
import { IntentRejection } from "../../packages/agent/src/intent";
import {
  CONTRACT_VERSION,
  QuerySchema,
  type QueryInput,
} from "../../packages/contracts/src/index";
import { resolveQueryPlace } from "../../packages/places/src/index";
const snapshotId = "synthetic-p5-browser";
function emptyData(query: QueryInput) {
  return {
    contractVersion: CONTRACT_VERSION,
    snapshotId: query.snapshotId,
    queryHash: "a".repeat(64),
    rows: [],
    total: 0,
    truncated: false,
    nextCursor: null,
    limitations: ["Synthetic UI fixture; no provider or source request."],
    ...(query.placeId ? { placeResolution: resolveQueryPlace(query) } : {}),
  };
}
async function fixture(page: Page) {
  const errors: string[] = [],
    external: string[] = [],
    searches: QueryInput[] = [];
  let agentRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.hostname === "127.0.0.1" ||
      ["blob:", "data:"].includes(url.protocol)
    )
      return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/health")
      return route.fulfill({
        json: {
          contractVersion: CONTRACT_VERSION,
          snapshotId,
          mode: "synthetic",
          digest: "synthetic-browser",
          accessMode: "local",
          provider: "deterministic-offline",
        },
      });
    if (path === "/api/leads") return route.fulfill({ json: [] });
    if (path === "/api/map-config")
      return route.fulfill({ json: { kind: "offline" } });
    if (path === "/api/search") {
      const q = QuerySchema.parse(route.request().postDataJSON());
      searches.push(q);
      return route.fulfill({ json: emptyData(q) });
    }
    if (path === "/api/agent") {
      agentRequests++;
      const { prompt, query } = route.request().postDataJSON();
      try {
        return route.fulfill({
          json: await answerQuestion(
            {
              search: async (q) => emptyData(q),
              detail: async () => {
                throw Error("No detail request expected");
              },
            },
            prompt,
            query,
          ),
        });
      } catch (error) {
        if (!(error instanceof IntentRejection)) throw error;
        return route.fulfill({
          status: 400,
          json: {
            message: error.message,
            mode: "refused-before-model",
            intent: error.intent,
          },
        });
      }
    }
    throw Error("Unexpected synthetic API route: " + path);
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Ask agent/ })).toBeEnabled();
  return { errors, external, searches, agentRequests: () => agentRequests };
}
async function ask(page: Page, prompt: string) {
  await page.getByLabel("Agent prompt").fill(prompt);
  await page.getByRole("button", { name: /Ask agent/ }).click();
}
test("evidence link stays readable and clickable inside the sidebar across its collapse breakpoint", async ({
  page,
}) => {
  const state = await fixture(page);
  for (const width of [390, 800, 801]) {
    await page.setViewportSize({ width, height: 844 });
    const link = page.locator('.sidebar > a[href="/api/evidence"]');
    await expect(link).toBeVisible();
    await link.scrollIntoViewIfNeeded();
    const geometry = await link.evaluate((element) => {
      const sidebar = element.closest(".sidebar")!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = [...range.getClientRects()];
      const link = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        link.x + link.width / 2,
        link.y + link.height / 2,
      );
      return {
        textWithinSidebar:
          text.length > 0 &&
          text.every((r) => r.left >= sidebar.left && r.right <= sidebar.right),
        clickable: hit === element || element.contains(hit),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry, `viewport ${width}`).toEqual({
      textWithinSidebar: true,
      clickable: true,
      horizontalOverflow: false,
    });
    await link.focus();
    await expect(link).toBeFocused();
  }
  expect(state.errors).toEqual([]);
  expect(state.external).toEqual([]);
  expect(state.agentRequests()).toBe(0);
});
test("accepted place query, fractional radius and ledger survive map application/reload; a later refusal replaces the prior answer", async ({
  page,
}) => {
  const state = await fixture(page);
  await ask(page, "Find roofs older than 15 within 2.5 miles of Troy limit 17");
  await expect(page.getByTestId("constraint-ledger")).toContainText(
    "Applied request",
  );
  await expect(page.getByTestId("place-resolution")).toContainText(
    "not a municipal-boundary filter",
  );
  const searched = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/search") &&
      response.request().postDataJSON().placeId === "us-26-125-80700-city",
  );
  await page
    .getByRole("button", { name: "Show this search on the map" })
    .click();
  await searched;
  await expect(page.getByLabel("Search radius")).toHaveValue("2.5");
  await expect(page.getByLabel("Page limit")).toHaveValue("17");
  await expect(page).toHaveURL(/place=us-26-125-80700-city/);
  await page.reload();
  await expect(page.getByRole("button", { name: /Ask agent/ })).toBeEnabled();
  await expect(page.getByLabel("Search radius")).toHaveValue("2.5");
  await expect(page.getByTestId("place-resolution")).toContainText("Troy");
  await ask(page, "Find properties within five miles of Troy");
  await expect(page.getByTestId("agent-answer")).toBeVisible();
  await ask(page, "Show properties with BBB ratings where available");
  await expect(page.getByTestId("constraint-ledger")).toContainText(
    "without adding a presence filter",
  );
  await expect(
    page.getByLabel("Require observed BBB rating", { exact: true }),
  ).not.toBeChecked();
  await ask(page, "Find properties with BBB rating above 80");
  await expect(page.getByTestId("constraint-ledger")).toContainText(
    "Request not run",
  );
  await expect(page.getByTestId("agent-answer")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText(
    "BBB numeric/grade thresholds",
  );
  const moved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/search") &&
      !response.request().postDataJSON().placeId,
  );
  await page.getByRole("button", { name: "Move pin east" }).click();
  await moved;
  await expect(page.getByTestId("place-resolution")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("place")).toBe(false);
  expect(state.agentRequests()).toBe(4);
  expect(state.errors).toEqual([]);
  expect(state.external).toEqual([]);
});
test("mobile controls retain new predicates and unknown status without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  await page
    .getByLabel("Permit status", { exact: true })
    .selectOption("unknown");
  await page.getByLabel("Require observed BBB rating", { exact: true }).check();
  await page
    .getByLabel("Result order", { exact: true })
    .selectOption("distance");
  await page.reload();
  await expect(page.getByRole("button", { name: /Ask agent/ })).toBeEnabled();
  await expect(page.getByLabel("Permit status", { exact: true })).toHaveValue(
    "unknown",
  );
  await expect(
    page.getByLabel("Require observed BBB rating", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Result order", { exact: true })).toHaveValue(
    "distance",
  );
  await ask(page, "Find properties within five miles of Novi");
  await expect(page.getByTestId("constraint-ledger")).toContainText(
    "Request not run",
  );
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("body *")]
      .filter(
        (el) =>
          el.getBoundingClientRect().right > window.innerWidth + 1 ||
          el.scrollWidth > el.clientWidth + 1,
      )
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName,
        className: el.className,
        width: el.getBoundingClientRect().width,
        right: el.getBoundingClientRect().right,
        scroll: el.scrollWidth,
        client: el.clientWidth,
      })),
  }));
  expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.width,
  );
  expect(state.errors).toEqual([]);
  expect(state.external).toEqual([]);
});
