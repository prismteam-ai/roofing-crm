/**
 * Local lane of test 42 (layout-checks.ts): the same steps and assertions as the hosted suite, against the built
 * app on 127.0.0.1 with every other request answered by the stubs in stubs.ts (dummy values) or aborted. No hosted
 * call, no credentials; a request to any other host (or to /agent/answer) is aborted and fails the test.
 * CRM_LOCAL_SHOTS=<dir> saves two screenshots per breakpoint before the checks: the aside scrolled to its end, and
 * the leads box scrolled to the top of the aside.
 */
import { join } from "node:path";
import { test } from "@playwright/test";
import {
  expectLayout,
  LAYOUT_BREAKPOINTS,
  openLayout,
} from "../layout-checks.ts";
import { useLocalStubs } from "./stubs.ts";

useLocalStubs();

for (const bp of LAYOUT_BREAKPOINTS)
  test(`42 (local). ${bp.name} (${bp.viewport.width} px): ${bp.oneColumn ? "nothing covers the content below the controls; 'Ask the agent' opens with a plain click" : "the controls stay in place while the aside scrolls"}`, async ({
    page,
  }) => {
    await openLayout(page, bp);
    const shots = process.env.CRM_LOCAL_SHOTS;
    if (shots) {
      await page
        .locator("aside")
        .evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.screenshot({
        path: join(shots, `${bp.viewport.width}px.png`),
      });
      await page
        .getByTestId("leads")
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.screenshot({
        path: join(shots, `${bp.viewport.width}px-leads.png`),
      });
      await page.locator("aside").evaluate((el) => el.scrollTo(0, 0));
    }
    await expectLayout(page, bp);
  });
