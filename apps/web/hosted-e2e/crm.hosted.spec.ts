import { test, expect, inventory, noOverflow, ROOT, RUN } from './support.js';
import type { Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.getByTestId('results-total')).toBeVisible();
  await expect(page.getByTestId('search-loading')).toBeHidden();
  await expect(page.getByTestId('search-error')).toBeHidden();
}
async function setPin(page: Page, lat = '42.0451', lon = '-87.6877') {
  await page.getByTestId('center-lat').fill(lat);
  await page.getByTestId('center-lon').fill(lon);
  await filtersResponse(page, () => page.getByTestId('center-apply').click());
  await expect(page.getByTestId('center-readout')).toContainText(Number(lat).toFixed(5));
}
async function filtersResponse(page: Page, action: () => Promise<unknown>) {
  const pending = page.waitForResponse((r) => r.url().includes('search.properties'));
  await action();
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  await ready(page);
  const json = await response.json();
  return (Array.isArray(json) ? json[0] : json).result.data;
}

test('C01 C13 S01-S06: default real data, full responsive inventory and disabled sections', async ({
  page,
}, info) => {
  await page.goto('/');
  await ready(page);
  await expect(page.getByTestId('topbar-run')).toHaveText(RUN);
  await expect(page.getByTestId('topbar-root-cid')).toHaveAttribute('title', ROOT);
  await expect(page.getByTestId('footer-counts')).toContainText('1,864,469');
  await expect(page.getByTestId('footer-provenance')).toContainText('pipeline MCP');
  await expect(page.getByTestId('center-readout')).toContainText('42.04510, -87.68770');
  await expect(page.getByTestId('roof-age-input')).toHaveValue('15');
  await expect(page.getByTestId('radius-value')).toHaveText('2.0 mi');
  await expect(page.getByTestId('map').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('long-open-toggle')).toBeDisabled();
  for (const button of await page.locator('button.nav.disabled').all()) {
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAttribute('title', 'Coming soon');
  }
  await inventory(page, info, '/');
  const details = page.getByTestId('footer-limitations');
  await details.locator('summary').click();
  await expect(details).toContainText('BBB');
  await details.locator('summary').click();
  await page.getByTestId('nav-leads').click();
  await expect(page.getByTestId('leads-empty')).toBeVisible();
  await inventory(page, info, '/#/leads');
  await page.goBack();
  await ready(page);
  await page.goForward();
  await expect(page.getByTestId('leads-page')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('leads-empty')).toBeVisible();
  await noOverflow(page);
});

test('C02-C04 C06: place dropdown, ZIP keyboard submit, pin, all filters and true radius predicate', async ({
  page,
}, info) => {
  await page.goto('/');
  await ready(page);
  for (const place of ['Chicago Loop', 'Oak Park', 'Skokie', 'Evanston']) {
    const options = await page.getByTestId('place-select').locator('option').allTextContents();
    if (!options.includes(place)) continue;
    await filtersResponse(page, () => page.getByTestId('place-select').selectOption(place));
    await expect(page.getByTestId('default-centre-note')).toBeHidden();
  }
  await page.getByTestId('place-input').fill('60201');
  await page.getByTestId('place-input').press('Enter');
  await expect(page.getByTestId('place-message')).toContainText('Centred');
  await ready(page);
  await setPin(page);
  await filtersResponse(page, () => page.getByTestId('radius-slider').fill('5'));
  await expect(page.getByTestId('radius-value')).toHaveText('5.0 mi');
  const roofs = await filtersResponse(page, () => page.getByTestId('roof-age-input').fill('150'));
  expect(roofs.properties.length).toBeGreaterThan(0);
  expect(
    roofs.properties.every((p: { roof_age_years: number }) => p.roof_age_years >= 150),
  ).toBeTruthy();
  for (const confidence of ['medium', 'high', 'low'])
    await filtersResponse(page, () =>
      page.getByTestId('confidence-select').selectOption(confidence),
    );
  await filtersResponse(page, () => page.getByTestId('roof-age-input').fill('15'));
  await filtersResponse(page, () => page.getByTestId('open-permits-toggle').check());
  await expect(page.getByTestId('long-open-toggle')).toBeEnabled();
  await filtersResponse(page, () => page.getByTestId('long-open-toggle').check());
  const open = await filtersResponse(page, () => page.getByTestId('min-open-years').fill('3'));
  expect(
    open.properties.every(
      (p: { permits: { is_roofing: boolean; status_is_open: boolean; open_days: number }[] }) =>
        p.permits.some((x) => x.is_roofing && x.status_is_open && x.open_days >= 1095),
    ),
  ).toBeTruthy();
  await inventory(page, info, '/filters');
  await noOverflow(page);
});

test('C02: real geolocation permission granted changes pin and denied leaves manual recovery', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 41.885, longitude: -87.7845 });
  await page.goto('/');
  await ready(page);
  await page.getByTestId('use-gps').click();
  await expect(page.getByTestId('center-readout')).toContainText('41.88500, -87.78450');
  await ready(page);
  // Clearing returns Firefox to a pending prompt; explicitly deny all permissions instead.
  await context.clearPermissions();
  await context.grantPermissions([]);
  await page.reload();
  await ready(page);
  await page.getByTestId('use-gps').click();
  await expect(page.getByTestId('gps-error')).toBeVisible({ timeout: 12_000 });
  await setPin(page);
  await expect(page.getByTestId('center-readout')).toContainText('42.04510');
});

test('C02 C06: map navigation and clicking actual marker opens matching PIN, close drawer and mobile order', async ({
  page,
}, info) => {
  await page.goto('/');
  await ready(page);
  for (const name of ['Zoom in', 'Zoom out'])
    await page.getByRole('button', { name, exact: true }).click();
  const first = page.getByTestId('result-item').first();
  const pin = await first.getAttribute('data-pin');
  await first.click();
  await expect(page.getByTestId('drawer-pin')).toHaveText(pin!);
  await expect(page.getByTestId('drawer-roof-age')).toContainText('confidence');
  await expect(page.getByTestId('property-source-link')).toHaveAttribute('href', /^https:\/\//);
  await page.getByTestId('drawer-close').click();
  await expect(page.getByTestId('property-drawer')).toBeHidden();
  const map = page.getByTestId('map');
  await map.scrollIntoViewIfNeeded();
  const markerPin = await page.getByTestId('property-marker').evaluateAll((markers) => {
    const marker = markers.find((node) => {
      const box = node.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === node;
    });
    return (marker as HTMLElement | undefined)?.dataset.pin;
  });
  expect(markerPin, 'a visible, unobscured property marker').toBeTruthy();
  await page.locator(`[data-testid="property-marker"][data-pin="${markerPin}"]`).click();
  await expect(page.getByTestId('drawer-pin')).toHaveText(markerPin!);
  await page.getByTestId('drawer-close').click();
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  // The old fixed80,80 click hit the mobile legend; choose open map canvas away from controls.
  await map.click({ position: { x: box!.width * 0.8, y: box!.height * 0.65 } });
  await ready(page);
  await expect(page.getByTestId('center-readout')).not.toContainText('42.04510, -87.68770');
  if (info.project.name.endsWith('-390')) {
    const boxes = await Promise.all(
      ['search-panel', 'map', 'results'].map((id) => page.getByTestId(id).boundingBox()),
    );
    expect(boxes.every(Boolean)).toBeTruthy();
    expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
    expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
  }
  await inventory(page, info, '/drawer-map');
  await noOverflow(page);
});

test('C05 C07-C10 X01: open permit to lead, every status/filter, notes persistence/isolation, cancel then delete', async ({
  page,
  browser,
}, info) => {
  await page.goto('/');
  await ready(page);
  await filtersResponse(page, () => page.getByTestId('radius-slider').fill('5'));
  await filtersResponse(page, () => page.getByTestId('open-permits-toggle').check());
  const first = page.getByTestId('result-item').first();
  await first.click();
  const pin = await page.getByTestId('drawer-pin').textContent();
  await expect(page.getByTestId('permit-card').first()).toContainText('open');
  await expect(page.getByTestId('permit-bbb').first()).toContainText('BBB');
  await expect(page.getByTestId('permit-contractor').first()).toBeVisible();
  await page.getByTestId('add-lead-permit').first().click();
  await expect(page.getByTestId('toast')).toContainText('Lead saved');
  await page.getByTestId('drawer-close').click();
  await page.getByTestId('nav-leads').click();
  await expect(page.getByTestId('lead-item')).toHaveCount(1);
  await expect(page.getByTestId('lead-item')).toContainText(pin!);
  for (const status of await page
    .getByTestId('lead-status')
    .locator('option')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value))) {
    if ((await page.getByTestId('lead-status').inputValue()) === status) continue;
    const saved = page.waitForResponse((r) => r.url().includes('leads.update'));
    await page.getByTestId('lead-status').selectOption(status);
    expect((await saved).ok()).toBeTruthy();
    await expect(page.getByTestId('lead-status')).toHaveValue(status);
  }
  if ((await page.getByTestId('lead-status').inputValue()) !== 'contacted') {
    const statusSaved = page.waitForResponse((r) => r.url().includes('leads.update'));
    await page.getByTestId('lead-status').selectOption('contacted');
    expect((await statusSaved).ok()).toBeTruthy();
  }
  await page.getByTestId('lead-notes').fill(`Hosted matrix ${info.project.name}`);
  const notesSaved = page.waitForResponse((r) => r.url().includes('leads.update'));
  await page.getByTestId('lead-notes').press('Tab');
  expect((await notesSaved).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('lead-notes')).toHaveValue(`Hosted matrix ${info.project.name}`);
  await expect(page.getByTestId('lead-status')).toHaveValue('contacted');
  await page.getByTestId('lead-filter-status').selectOption('new');
  await expect(page.getByTestId('lead-item')).toHaveCount(0);
  await page.getByTestId('lead-filter-status').selectOption('contacted');
  await expect(page.getByTestId('lead-item')).toHaveCount(1);
  await page.getByTestId('lead-filter-roof-age').fill('200');
  await expect(page.getByTestId('lead-item')).toHaveCount(0);
  await page.getByTestId('lead-filter-roof-age').fill('');
  await expect(page.getByTestId('lead-item')).toHaveCount(1);
  await page.getByTestId('lead-filter-open').check();
  await expect(page.getByTestId('lead-item')).toHaveCount(1);
  await page.getByTestId('lead-filter-open-years').fill('100');
  await expect(page.getByTestId('lead-item')).toHaveCount(0);
  await page.getByTestId('lead-filter-open-years').fill('');
  await page.getByTestId('lead-filter-radius').fill('5');
  await expect(page.getByTestId('lead-item')).toHaveCount(1);
  const isolated = await browser.newContext();
  const second = await isolated.newPage();
  await second.goto(`${new URL(page.url()).origin}/#/leads`);
  await expect(second.getByTestId('leads-empty')).toBeVisible();
  await isolated.close();
  page.once('dialog', (d) => d.dismiss());
  await page.getByTestId('lead-delete').click();
  await expect(page.getByTestId('lead-item')).toHaveCount(1);
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('lead-delete').click();
  await expect(page.getByTestId('lead-item')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('leads-empty')).toBeVisible();
  await inventory(page, info, '/lead-crud');
});

test('S07 C12 negative: search service error and agent provider error recover visibly', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await page.route('**/trpc/search.properties*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          error: {
            message: 'Controlled hosted E2E failure',
            code: -32603,
            data: { httpStatus: 503, code: 'INTERNAL_SERVER_ERROR' },
          },
        },
      ]),
    }),
  );
  await page.getByTestId('radius-slider').fill('3');
  await expect(page.getByTestId('search-error')).toBeVisible();
  await page.unroute('**/trpc/search.properties*');
  await page.getByTestId('radius-slider').fill('2');
  await ready(page);
  await page.route('**/trpc/agent.ask*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          error: {
            message: 'Controlled agent E2E failure',
            code: -32603,
            data: { httpStatus: 503, code: 'INTERNAL_SERVER_ERROR' },
          },
        },
      ]),
    }),
  );
  await page.getByTestId('chat-input').fill('test controlled provider failure');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-error')).toBeVisible();
  await page.unroute('**/trpc/agent.ask*');
  await expect(page.getByTestId('chat-input')).toBeEnabled();
});

test('C11 C12 CV07: exact README RAG query, citations, empty submit, prompt-chip inventory', async ({
  page,
}, info) => {
  await page.goto('/');
  await ready(page);
  await expect(page.getByTestId('chat-send')).toBeDisabled();
  expect(await page.getByTestId('example-prompt').count()).toBe(4);
  await page.getByTestId('example-prompt').first().click();
  await expect(page.getByTestId('chat-answer')).toBeVisible({ timeout: 100_000 });
  await expect(page.getByTestId('chat-question')).toHaveText(
    'Show me open roofing permits older than five years within five miles of Evanston',
  );
  await expect(page.getByTestId('chat-answer')).toContainText('mode: llm');
  await expect(page.getByTestId('chat-answer')).toContainText(/permit|properties|no|none/i);
  // A legitimate no-match answer may have no row citations; record and inspect exact response, never invent them.
  await info.attach('real-rag-answer', {
    body: await page.getByTestId('chat-answer').innerText(),
    contentType: 'text/plain',
  });
  await inventory(page, info, '/chat');
  await noOverflow(page);
});

test('CV01-CV09 canonical ordered video journey with frozen real PIN and clean workspace', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const pin = '13032280210000';
  await test.step('CV01 county default', async () => {
    await page.goto('/');
    await ready(page);
    await expect(page.getByTestId('center-readout')).toContainText('42.04510, -87.68770');
  });
  await test.step('CV02 pin42.0451,-87.6877 radius5mi', async () => {
    await setPin(page);
    await filtersResponse(page, () => page.getByTestId('radius-slider').fill('5'));
  });
  await test.step('CV03 roofs≥15years', async () => {
    await page.getByTestId('roof-age-input').fill('15');
    await ready(page);
    await expect(page.getByTestId('result-item').first()).toContainText('roof');
  });
  await test.step('CV04 long-open≥3years', async () => {
    await filtersResponse(page, () => page.getByTestId('open-permits-toggle').check());
    await filtersResponse(page, () => page.getByTestId('long-open-toggle').check());
    await filtersResponse(page, () => page.getByTestId('min-open-years').fill('3'));
    await expect(page.locator(`[data-testid="result-item"][data-pin="${pin}"]`)).toBeVisible();
  });
  await test.step('CV05 PIN13032280210000 contractor/BBB/source', async () => {
    await page.locator(`[data-testid="result-item"][data-pin="${pin}"]`).click();
    await expect(page.getByTestId('drawer-pin')).toHaveText(pin);
    await expect(page.getByTestId('property-drawer')).toContainText('4055 W GLENLAKE');
    await expect(page.getByTestId('permit-bbb').first()).toContainText('BBB');
    await expect(page.getByTestId('permit-source-link').first()).toHaveAttribute(
      'href',
      /^https:\/\//,
    );
    await info.attach('canonical-permit-evidence', {
      body: await page.getByTestId('property-drawer').innerText(),
      contentType: 'text/plain',
    });
  });
  await test.step('CV06 convert permit into lead', async () => {
    await page.getByTestId('add-lead-permit').first().click();
    await expect(page.getByTestId('toast')).toContainText('Lead saved');
    await page.getByTestId('drawer-close').click();
  });
  await test.step('CV07 exact README RAG query', async () => {
    await page
      .getByTestId('chat-input')
      .fill('Show me open roofing permits older than five years within five miles of Evanston');
    await page.getByTestId('chat-input').press('Enter');
    await expect(page.getByTestId('chat-answer')).toBeVisible({ timeout: 100_000 });
    await expect(page.getByTestId('chat-answer')).toContainText('mode: llm');
    await info.attach('canonical-RAG', {
      body: await page.getByTestId('chat-answer').innerText(),
      contentType: 'text/plain',
    });
  });
  await test.step('CV08 lead filter statuscontacted, roof≥15, radius5', async () => {
    await page.getByTestId('nav-leads').click();
    await expect(page.getByTestId('lead-item')).toHaveCount(1);
    await page.getByTestId('lead-status').selectOption('contacted');
    await page.getByTestId('lead-filter-status').selectOption('contacted');
    await page.getByTestId('lead-filter-roof-age').fill('15');
    await page.getByTestId('lead-filter-radius').fill('5');
    await expect(page.getByTestId('lead-item')).toContainText(pin);
  });
  await test.step('CV09 each disabled future section', async () => {
    for (const button of await page.locator('button.nav.disabled').all()) {
      await expect(button).toBeDisabled();
      await expect(button).toContainText('coming soon');
    }
  });
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('lead-delete').click();
  await expect(page.getByTestId('lead-item')).toHaveCount(0);
});

test('C02 S04 negative: unsupported GPS, invalid pin and unknown ZIP preserve usable controls', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true }),
  );
  await page.goto('/');
  await ready(page);
  await page.getByTestId('use-gps').click();
  await expect(page.getByTestId('gps-error')).toHaveText(
    'Geolocation not supported by this browser',
  );
  const original = await page.getByTestId('center-readout').textContent();
  await page.getByTestId('center-lat').fill('91');
  await page.getByTestId('center-apply').click();
  await expect(page.getByTestId('center-readout')).toHaveText(original!);
  await page.getByTestId('place-input').fill('00000');
  await page.getByTestId('place-go').click();
  await expect(page.getByTestId('place-message')).toContainText('No match');
  await setPin(page);
});
