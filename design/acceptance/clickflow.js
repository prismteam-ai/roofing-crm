// Step 10: the CRM demo walk, clickable end to end (complements mapflow, candflow, triflow, leadsflow, leadflow, askflow).
const { chromium } = require('playwright');
const U = (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const mk = async (w, h) => { const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500 }); await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort()); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); return p; };
  const go = async (p, f) => { await p.goto(U + f); await p.waitForTimeout(1500); };
  const body = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  const p = await mk(1440, 900), m = await mk(390, 844);
  // 1. Sign in → map
  await go(p, 'CrmSignIn1440.dc.html?state=signedout'); await p.locator('#si-pw').fill('samplepass'); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForTimeout(2500);
  ok('sign in → map: ' + p.url().split('/').pop(), /CrmMap1440\.dc\.html/.test(p.url()) && /across Travis County/.test(await body(p)));
  // 2. Use my location, and the denied → Drop pin path (390)
  await go(m, 'CrmMap390.dc.html'); await m.getByRole('button', { name: 'Use my location', exact: true }).first().click(); await m.waitForTimeout(250);
  ok('390 Use my location explains first', /Allow location to center the search/.test(await body(m)));
  await m.getByRole('button', { name: 'Continue' }).click(); await m.waitForTimeout(1700); ok('390 located, ring on you', /You are here/.test(await body(m)));
  await go(m, 'CrmMapGpsDenied390.dc.html'); ok('denied message', /Location is off\. Drop a pin or search a place instead\./.test(await body(m)));
  await m.getByRole('button', { name: /^Drop pin/ }).first().click(); await m.waitForTimeout(300);
  ok('denied → Drop pin opens the crosshair', await m.locator('svg.xhair').count() === 1);
  await m.getByRole('button', { name: 'Place pin here' }).click(); await m.waitForTimeout(400); ok('390 crosshair → pin placed', await m.locator('.crmpin').count() === 1);
  // 3. Radius: ring handle drag and slider to 25 mi
  await go(p, 'CrmMapPin1440.dc.html'); const chip = async () => (await p.locator('.atlas-map-chip[aria-live="polite"]').first().innerText()).replace(/\s+/g, ' ');
  const r0 = await p.locator('.rhandle').getAttribute('aria-valuenow'); const hb = await p.locator('.rhandle').boundingBox();
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(hb.x + 90, hb.y + hb.height / 2, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300);
  const r1 = await p.locator('.rhandle').getAttribute('aria-valuenow'); ok('ring handle drag changes the radius ' + r0 + ' → ' + r1, r0 !== r1);
  await p.locator('#radius').fill('25'); await p.waitForTimeout(300); ok('slider to 25 mi: ' + await chip(), /25 mi/.test(await chip()));
  // 4. Agent: answer → Show on map → Create lead with confirmation
  await go(p, 'CrmAsk1440.dc.html'); await p.evaluate(() => localStorage.removeItem('countylens.proto.crmLeads')); await go(p, 'CrmAsk1440.dc.html');
  await p.getByRole('button', { name: 'Show on map' }).click(); await p.waitForTimeout(300); ok('agent Show on map: numbered pins', /on the map as numbered pins 1–4/.test(await body(p)) && await p.locator('.pinN').count() >= 3);
  await p.getByRole('button', { name: 'Create leads for all 4' }).click(); await p.waitForTimeout(300);
  const before = await p.evaluate(() => localStorage.getItem('countylens.proto.crmLeads'));
  ok('confirmation card before any lead', /Create 2 leads\? 2 are already leads and will be skipped\./.test(await body(p)) && before === null);
  await p.getByRole('region', { name: 'Answer' }).getByRole('button', { name: 'Create 2 leads' }).click(); await p.waitForTimeout(1000);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('countylens.proto.crmLeads') || '[]')); ok('created from Agent after Create', st.filter((l) => l.origin === 'Agent').length === 2 && /2 leads created · 2 already leads/.test(await body(p)));
  // 5. Every Coming-soon section: tooltip and page
  await go(p, 'CrmLeads1440.dc.html');
  for (const [lab, key] of [['Campaigns', 'campaigns'], ['Estimates', 'estimates'], ['Jobs', 'jobs'], ['Invoices', 'invoices'], ['Outreach', 'outreach']]) {
    await go(p, 'CrmLeads1440.dc.html'); const it = p.locator('a.crm-soon').filter({ hasText: new RegExp(lab + 'Soon') }).first(); const tip = await it.getAttribute('title');
    const pill = await it.locator('.atlas-pill--unavailable').count(); await it.hover(); await it.click(); await p.waitForTimeout(1500);
    const pg = new RegExp('CrmComingSoon1440\\.dc\\.html\\?section=' + key).test(p.url()) && new RegExp(lab + ' is coming soon').test(await body(p)) && await p.getByRole('link', { name: 'Back to Map' }).count() === 1;
    ok(lab + ': tooltip “' + tip + '”, Coming-soon pill, opens its page', !!tip && pill === 1 && pg); }
  await go(m, 'CrmLeads390.dc.html'); await m.getByRole('button', { name: 'More' }).click(); await m.waitForTimeout(200);
  const rows = m.getByRole('dialog').locator('a.atlas-list-item').filter({ has: m.locator('.atlas-pill--unavailable') });
  ok('390 More: five CountyLens coming-soon rows with their lines', (await rows.count()) === 5 && /Email and SMS to owners/.test(await body(m)) && (await rows.first().locator('.atlas-pill--unavailable').innerText()).trim() === 'Coming soon');
  await rows.nth(1).click(); await m.waitForTimeout(1500); ok('390 row opens its page', /CrmComingSoon390\.dc\.html\?section=estimates/.test(m.url()) && /Estimates is coming soon/.test(await body(m)));
  // 6. Apps → Hub
  await go(p, 'CrmLeads1440.dc.html'); await p.getByRole('button', { name: 'Apps' }).first().click(); await p.waitForTimeout(250); await p.getByRole('menuitem', { name: /Landing page/ }).click(); await p.waitForTimeout(1500); ok('Apps menu → Landing page (Hub): ' + p.url().split('/').pop(), /Hub1440\.dc\.html/.test(p.url()));
  await go(m, 'CrmLeads390.dc.html'); await m.getByRole('button', { name: 'More' }).click(); await m.waitForTimeout(200); await m.getByRole('link', { name: /Landing page/ }).click(); await m.waitForTimeout(1500); ok('390 More → Apps → Landing page (Hub)', /Hub390\.dc\.html/.test(m.url()));
  const errs = [p, m].flatMap((x) => x.errs); if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await b.close();
})();
