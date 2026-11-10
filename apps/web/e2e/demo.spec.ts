import { expect, test, type Page } from '@playwright/test';

// Fixture dataset is centred on Chicago / Evanston / Oak Park; the Loop has plenty of rows.
const LOOP = { lat: '41.8781', lon: '-87.6298' };

async function dropPin(page: Page, lat = LOOP.lat, lon = LOOP.lon) {
  await page.getByTestId('center-lat').fill(lat);
  await page.getByTestId('center-lon').fill(lon);
  await page.getByTestId('center-apply').click();
  await expect(page.getByTestId('center-readout')).toContainText('Pin:');
  await expect(page.getByTestId('search-loading')).toBeHidden();
}

test.describe('README demo walk', () => {
  test('opens centred on Cook County with provenance and counts in the footer', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('map')).toBeVisible();
    await expect(page.getByTestId('footer-provenance')).toContainText(
      'run_2026-11-01T00-00-00Z_fixture',
    );
    await expect(page.getByTestId('footer-provenance')).toContainText('root CID');
    await expect(page.getByTestId('footer-counts')).toContainText('property: 300');
    await expect(page.getByTestId('footer-counts')).toContainText('permit: 350');
    await expect(page.getByTestId('footer-build')).toContainText('agent: offline');
    await expect(page.getByTestId('topbar-run')).toHaveText('run_2026-11-01T00-00-00Z_fixture');
    await expect(page.getByTestId('topbar-root-cid')).toHaveText('pending');
    // default centre: results and markers without any interaction
    await expect(page.getByTestId('default-centre-note')).toBeVisible();
    await expect(page.getByTestId('search-loading')).toBeHidden();
    await expect(page.getByTestId('results-count')).not.toHaveText('–');
    await expect(page.getByTestId('property-marker').first()).toBeAttached();
    await expect(page.getByTestId('center-readout')).toContainText('42.04510, -87.68770');
  });

  test('centres on a place from the select, free text, and filters by confidence', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('place-select').selectOption('Oak Park');
    await expect(page.getByTestId('default-centre-note')).toBeHidden();
    await expect(page.getByTestId('center-readout')).toContainText('41.88500, -87.78450');
    await page.getByTestId('place-input').fill('Skokie');
    await page.getByTestId('place-go').click();
    await expect(page.getByTestId('place-message')).toContainText('Centred on Skokie');
    await expect(page.getByTestId('center-readout')).toContainText('42.03240, -87.74160');
    await page.getByTestId('place-input').fill('nowhere-xyz');
    await page.getByTestId('place-go').click();
    await expect(page.getByTestId('place-message')).toContainText('No match');

    await dropPin(page);
    const count = page.getByTestId('results-count');
    const all = Number(await count.textContent());
    await page.getByTestId('confidence-select').selectOption('high');
    await expect.poll(async () => Number(await count.textContent())).toBeLessThan(all);
    await page.getByTestId('confidence-select').selectOption('low');
    await expect(count).toHaveText(String(all));
  });

  test('drop a pin, set radius, roofs > 15y, open permits, drawer, add lead', async ({ page }) => {
    await page.goto('/');
    await dropPin(page);
    await expect(page.getByTestId('pin-marker')).toBeAttached();
    const count = page.getByTestId('results-count');
    await expect(count).not.toHaveText('–');
    const before = Number(await count.textContent());
    expect(before).toBeGreaterThan(0);
    await expect(page.getByTestId('results-total')).toContainText(/Showing \d+ of \d+ in radius/);
    await expect(page.getByTestId('footer-counts')).toContainText(/showing \d+ of \d+ in radius/);

    // radius slider 2 -> 5 miles widens the list
    await page.getByTestId('radius-slider').fill('5');
    await expect(page.getByTestId('radius-value')).toHaveText('5.0 mi');
    await expect(page.getByTestId('search-loading')).toBeHidden();
    await expect.poll(async () => Number(await count.textContent())).toBeGreaterThan(before);

    // roof age threshold 15 -> 40 narrows
    const atFive = Number(await count.textContent());
    await page.getByTestId('roof-age-input').fill('40');
    await expect(page.getByTestId('search-loading')).toBeHidden();
    await expect.poll(async () => Number(await count.textContent())).toBeLessThan(atFive);
    await page.getByTestId('roof-age-input').fill('15');

    // open permits only, then long-open (>= 5 y)
    await page.getByTestId('open-permits-toggle').check();
    await expect(page.getByTestId('search-loading')).toBeHidden();
    await expect(page.getByTestId('result-item').first()).toContainText('open permit');
    const openCount = Number(await count.textContent());
    await expect(page.getByTestId('search-panel')).toContainText('open ≥');
    await expect(page.getByTestId('min-open-years')).toHaveValue('2');
    await page.getByTestId('long-open-toggle').check();
    await expect(page.getByTestId('search-loading')).toBeHidden();
    await expect.poll(async () => Number(await count.textContent())).toBeLessThanOrEqual(openCount);
    await expect(page.getByTestId('result-item').first()).toContainText(/\(\d+\.\d y\)/);
    await expect(page.getByTestId('property-marker').first()).toBeAttached();

    // drawer: contractor + BBB + source links, then add lead
    await page.getByTestId('result-item').first().click();
    const drawer = page.getByTestId('property-drawer');
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId('drawer-pin')).toHaveText(/^\d{14}$/);
    await expect(page.getByTestId('drawer-roof-age')).toContainText('confidence');
    const openPermit = page
      .getByTestId('permit-card')
      .filter({ has: page.locator('[data-open="true"]') })
      .first();
    await expect(page.getByTestId('permit-card').first()).toBeVisible();
    await expect(page.getByTestId('permit-status').first()).toContainText('open');
    await expect(page.getByTestId('permit-contractor').first()).toBeVisible();
    await expect(page.getByTestId('permit-bbb').first()).toContainText('BBB:');
    await expect(page.getByTestId('permit-license').first()).toContainText('license');
    await expect(page.getByTestId('permit-source-link').first()).toHaveAttribute(
      'href',
      /^https:\/\//,
    );
    await expect(page.getByTestId('property-source-link')).toHaveAttribute('href', /^https:\/\//);
    void openPermit;
    const pin = await page.getByTestId('drawer-pin').textContent();
    await page.getByTestId('add-lead').click();
    await expect(page.getByTestId('toast')).toContainText(`Lead saved for PIN ${pin}`);
    await expect(page.getByTestId('lead-count-badge')).toHaveText('1');
    await page.getByTestId('drawer-close').click();

    // leads page shows it, status editable, notes, filters, delete
    await page.getByTestId('nav-leads').click();
    await expect(page.getByTestId('leads-page')).toBeVisible();
    await expect(page.getByTestId('lead-item')).toHaveCount(1);
    await expect(page.getByTestId('lead-item').first()).toContainText(`PIN ${pin}`);
    await page.getByTestId('lead-status').first().selectOption('contacted');
    await expect(page.getByTestId('lead-status').first()).toHaveValue('contacted');
    await page.getByTestId('lead-notes').first().fill('Left voicemail');
    await page.getByTestId('lead-notes').first().blur();
    await page.reload();
    await expect(page.getByTestId('lead-notes').first()).toHaveValue('Left voicemail');

    await page.getByTestId('lead-filter-open').check();
    await expect(page.getByTestId('lead-item')).toHaveCount(1);
    await page.getByTestId('lead-filter-open-years').fill('5');
    await expect(page.getByTestId('lead-item')).toHaveCount(1);
    await page.getByTestId('lead-filter-roof-age').fill('500');
    await expect(page.getByTestId('lead-item')).toHaveCount(0);
    await expect(page.getByTestId('leads-empty')).toBeVisible();
    await page.getByTestId('lead-filter-roof-age').fill('');
    await page.getByTestId('lead-filter-status').selectOption('lost');
    await expect(page.getByTestId('lead-item')).toHaveCount(0);
    await page.getByTestId('lead-filter-status').selectOption('');
    await expect(page.getByTestId('lead-item')).toHaveCount(1);
    await page.getByTestId('lead-delete').first().click();
    await expect(page.getByTestId('lead-item')).toHaveCount(0);
  });

  test('lead radius filter uses the map pin', async ({ page }) => {
    await page.goto('/');
    await dropPin(page);
    await page.getByTestId('result-item').first().click();
    await page.getByTestId('add-lead').click();
    await expect(page.getByTestId('toast')).toBeVisible();
    await page.getByTestId('drawer-close').click();
    await dropPin(page, '42.0451', '-87.6877'); // Evanston, ~12 mi away
    await page.getByTestId('nav-leads').click();
    await expect(page.getByTestId('lead-item')).toHaveCount(1);
    await page.getByTestId('lead-filter-radius').fill('2');
    await expect(page.getByTestId('lead-item')).toHaveCount(0);
    await page.getByTestId('lead-filter-radius').fill('20');
    await expect(page.getByTestId('lead-item')).toHaveCount(1);
  });

  test('asks the RAG agent (offline/mocked model) and gets cited results', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('example-prompt').first().click();
    const answer = page.getByTestId('chat-answer').first();
    await expect(answer).toBeVisible({ timeout: 20_000 });
    await expect(answer).toContainText(/PIN \d{14}/);
    await expect(answer).toContainText('Assumptions:');
    await expect(answer).toContainText('Missing data:');
    await expect(answer).toContainText('mode: offline');
    await expect(page.getByTestId('chat-citations')).toBeVisible();
    await page.getByTestId('chat-input').fill('roofs older than 20 years near Oak Park');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-answer')).toHaveCount(2, { timeout: 20_000 });
  });

  test('never scrolls horizontally, including with the drawer open', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('search-loading')).toBeHidden();
    await expect(page.getByTestId('result-item').first()).toBeVisible();
    const noOverflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noOverflow()).toBe(true);
    await page.getByTestId('result-item').first().click();
    await expect(page.getByTestId('property-drawer')).toBeVisible();
    expect(await noOverflow()).toBe(true);
  });

  test('shows disabled future sections with coming-soon tooltips', async ({ page }) => {
    await page.goto('/');
    for (const id of [
      'outreach-campaigns',
      'quotes-estimates',
      'scheduling',
      'analytics',
      'billing',
    ]) {
      const btn = page.getByTestId(`nav-disabled-${id}`);
      await expect(btn).toBeDisabled();
      await expect(btn).toHaveAttribute('title', 'Coming soon');
    }
  });

  test('uses browser GPS when granted', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 41.885, longitude: -87.7845 });
    await page.goto('/');
    await page.getByTestId('use-gps').click();
    await expect(page.getByTestId('center-readout')).toContainText('41.88500, -87.78450');
    await expect(page.getByTestId('search-loading')).toBeHidden();
    await expect(page.getByTestId('results-count')).not.toHaveText('–');
  });
});
