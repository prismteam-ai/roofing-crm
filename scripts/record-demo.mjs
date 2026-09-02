import { chromium } from "@playwright/test";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.E2E_BASE_URL ?? "https://cc-bb-aa.github.io/roofing-crm/";
await mkdir(join(root, "demo/out"), { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: join(root, "demo/out"), size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

async function injectChrome() {
  await page.evaluate(() => {
    if (!document.getElementById("demo-caption")) {
      const cap = document.createElement("div");
      cap.id = "demo-caption";
      cap.style.cssText =
        "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483646;background:#1e2a33;color:#f4f7f8;padding:16px 20px 16px 18px;border-radius:4px;font:600 20px/1.35 'IBM Plex Sans',ui-sans-serif,system-ui;box-shadow:0 10px 28px #0009;border-left:6px solid #a85b2a;pointer-events:none";
      const beat = document.createElement("div");
      beat.id = "demo-beat";
      beat.style.cssText =
        "font:600 12px/1 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#c9b07a;margin-bottom:6px";
      const body = document.createElement("div");
      body.id = "demo-caption-text";
      cap.append(beat, body);
      document.body.appendChild(cap);
    }
    if (!document.getElementById("demo-cursor")) {
      const cursor = document.createElement("div");
      cursor.id = "demo-cursor";
      cursor.innerHTML =
        '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M5 3L19 12L12 13L9 20L5 3Z" fill="#fff" stroke="#1e2a33" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      cursor.style.cssText =
        "position:fixed;z-index:2147483647;pointer-events:none;width:28px;height:28px;left:0;top:0;filter:drop-shadow(1px 1px 2px #0006)";
      document.body.appendChild(cursor);
      document.addEventListener("mousemove", (e) => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
      });
    }
    if (!document.getElementById("demo-hl-style")) {
      const st = document.createElement("style");
      st.id = "demo-hl-style";
      st.textContent =
        ".demo-hl{outline:3px solid #a85b2a !important;outline-offset:3px;box-shadow:0 0 0 7px rgba(168,91,42,.22);position:relative;z-index:5}";
      document.head.appendChild(st);
    }
  });
}

async function say(beat, text, ms = 3200) {
  await page.evaluate(
    ({ beat, text }) => {
      const b = document.getElementById("demo-beat");
      const t = document.getElementById("demo-caption-text");
      if (b) b.textContent = beat;
      if (t) t.textContent = text;
    },
    { beat, text },
  );
  await page.waitForTimeout(ms);
}

async function highlight(sel) {
  await page.evaluate((sel) => {
    document.querySelectorAll(".demo-hl").forEach((el) => el.classList.remove("demo-hl"));
    const el = document.querySelector(sel);
    if (!el) return;
    el.classList.add("demo-hl");
    if (el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, sel);
  await page.waitForTimeout(350);
}

async function moveTo(sel) {
  const el = page.locator(sel).first();
  const box = await el.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + Math.min(box.width / 2, 70), box.y + Math.min(box.height / 2, 24), {
    steps: 12,
  });
  await page.waitForTimeout(300);
}

async function clickSel(sel) {
  await moveTo(sel);
  await page.locator(sel).first().click();
  await page.waitForTimeout(350);
}

await page.goto(base, { waitUntil: "load", timeout: 45000 });
await page.waitForFunction(
  () => !document.getElementById("status")?.textContent?.includes("Loading"),
  null,
  { timeout: 30000 },
);
await injectChrome();

await highlight(".brand");
await moveTo("h1");
await say("Beat 1 of 9 · Chester default", "Open the CRM centered on Chester County, PA.", 3200);
await highlight("#map");
await moveTo("#hud-pin");
await say("Beat 1 of 9 · Expected", "Map and search default to West Chester, Chester County.", 2800);

await highlight("#map");
await say("Beat 2 of 9 · Pin and radius", "Drop a pin (or use GPS) and set a search radius.", 2600);
await page.locator("#map").click({ position: { x: 420, y: 280 } });
await highlight("#radius");
await moveTo("#radius");
await page.locator("#radius").fill("5");
await clickSel("#usePin");
await page.waitForTimeout(1000);
await highlight("#hits");
await say("Beat 2 of 9 · Expected", "Search recenters on the pin with a five-mile radius.", 2800);

await highlight("#age");
await say(
  "Beat 3 of 9 · Aged roofs",
  "Show roofs older than the age threshold (for example, 15 years) within the radius.",
  3200,
);
await moveTo("#age");
await page.locator("#age").fill("15");
await page.locator("#open").uncheck().catch(() => {});
await clickSel("#usePin");
await page.waitForTimeout(1200);
await highlight("#hits");
await say("Beat 3 of 9 · Expected", "Matches show land-dev or roof age ≥ 15 years inside the radius.", 3200);

await highlight("#open");
await say(
  "Beat 4 of 9 · Long-open permits",
  "Highlight properties with open roofing permits, prioritizing long-open permits.",
  3200,
);
await page.locator("#age").fill("0");
await clickSel("#open");
if (await page.locator("#minOpenDays").count()) {
  await highlight("#minOpenDays");
  await page.locator("#minOpenDays").fill("365");
}
await clickSel("#usePin");
await page.waitForTimeout(1200);
await highlight("#hits");
await say("Beat 4 of 9 · Expected", "Open county permits, longest-open first. UCC roofing is not in the public harvest.", 3600);

await highlight(".hit");
await say(
  "Beat 5 of 9 · Property detail",
  "Open a selected property / permit and review contractor details and BBB rating where available.",
  3000,
);
await clickSel(".hit");
await page.waitForTimeout(800);
await highlight("#detail");
await moveTo("#detail");
await say("Beat 5 of 9 · Expected", "Permit status, open duration, contractor, BBB when present, and source.", 3600);

await highlight("button[data-lead]");
await say("Beat 6 of 9 · Create leads", "Convert one or more matches into CRM lead records.", 2600);
const add = page.locator("button[data-lead]");
if (await add.count()) {
  await clickSel("button[data-lead]");
}
if ((await add.count()) > 1) {
  await add.nth(1).scrollIntoViewIfNeeded();
  await add.nth(1).click();
}
await page.waitForTimeout(800);
await highlight("#leads");
await moveTo("#leads");
await say("Beat 6 of 9 · Expected", "Saved leads appear in the CRM list and can be removed.", 3000);

await highlight("#q");
await say(
  "Beat 7 of 9 · Agent",
  "Ask the RAG agent a natural-language query for roofing opportunities in the area and show relevant results.",
  3400,
);
await moveTo("#q");
await page.locator("#q").fill("");
await page.locator("#q").pressSequentially(
  "show me open roofing permits older than five years within five miles of West Chester",
  { delay: 14 },
);
await clickSel("#ask");
await page.waitForTimeout(1400);
await highlight("#agent");
await moveTo("#agent");
await say(
  "Beat 7 of 9 · Expected",
  "Agent applies five-year open-permit filter (1825 days) and returns matches with caveats. Deterministic over Oracle artifacts, not a separate vector store.",
  4600,
);

await highlight(".lead-filters");
await say(
  "Beat 8 of 9 · Lead filters",
  "Demonstrate filtering leads by roof age, permit status / open duration, and location radius.",
  3400,
);
await moveTo("#leadAge");
await page.locator("#leadAge").fill("0");
await clickSel("#leadOpen");
if (await page.locator("#leadMinOpen").count()) {
  await moveTo("#leadMinOpen");
  await page.locator("#leadMinOpen").fill("365");
}
if (await page.locator("#leadRadius").count()) {
  await moveTo("#leadRadius");
  await page.locator("#leadRadius").fill("5");
}
await clickSel("#filterLeads");
await page.waitForTimeout(800);
await highlight("#leads");
await say("Beat 8 of 9 · Expected", "Lead list filters by age, open duration, and radius around the pin.", 3600);

await highlight("nav");
await moveTo(".soon");
await say(
  "Beat 9 of 9 · Future CRM",
  "Show disabled / placeholder sections for future CRM expansions beyond lead identification.",
  3400,
);
await say(
  "Beat 9 of 9 · Expected",
  "Pipeline / jobs, Campaigns, and Billing are visible and disabled.",
  4000,
);

const video = page.video();
await context.close();
await browser.close();
if (video) {
  const src = await video.path();
  const dest = join(root, "demo/out/crm-demo-transcript.webm");
  try {
    await unlink(dest);
  } catch {}
  await rename(src, dest);
}
console.log("wrote demo/out/crm-demo-transcript.webm from", base);
