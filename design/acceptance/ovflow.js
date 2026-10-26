// CRM: one overlay at a time (menus, popovers, sheets), and the map's floating chips step aside while one is open
const { chromium } = require('playwright'); const U = process.env.BASE || (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const mk = async (w, h) => { const ctx = await b.newContext({ viewport: { width: w, height: h } }); await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort()); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); return p; };
  const open = (p) => p.evaluate(() => { const v = (sel) => [...document.querySelectorAll(sel)].some((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'); return { acct: v('[role=menu][aria-label="Account"]'), area: v('[role=menu][aria-label="Area centre"]'), sort: v('[role=menu][aria-label="Sort"]'), layers: v('[role=group][aria-label="Map layers"]'), data: v('[role=dialog][aria-label="Data source"]'), more: v('[role=dialog][aria-labelledby="bn-more-h"]'), chips: v('.atlas-map-chip') }; });
  const count = (o) => ['acct', 'area', 'sort', 'layers', 'data', 'more'].filter((k) => o[k]).length;
  for (const [w, h, f] of [[390, 844, 'CrmMapPin390.dc.html'], [1440, 900, 'CrmMapPin1440.dc.html']]) {
    const p = await mk(w, h); await p.goto(U + f); await p.waitForTimeout(2000); const tag = w + ': ';
    ok(tag + 'map chips visible with nothing open', (await open(p)).chips);
    await p.getByRole('button', { name: /^Account/ }).first().click(); await p.waitForTimeout(250); let o = await open(p); ok(tag + 'account menu open (390: map chips step aside) ' + JSON.stringify(o), o.acct && (w > 500 ? o.chips : !o.chips) && count(o) === 1);
    await p.getByRole('button', { name: /^Area: / }).first().click({ force: true }); await p.waitForTimeout(250); o = await open(p); ok(tag + 'Area opens, account closes ' + JSON.stringify(o), o.area && !o.acct && count(o) === 1);
    await p.getByRole('button', { name: /^Sort/ }).first().click({ force: true }).catch(() => {}); await p.waitForTimeout(250); o = await open(p); ok(tag + 'Sort opens, Area closes: ' + JSON.stringify(o), o.sort && !o.area && count(o) === 1);
    await p.getByRole('button', { name: /^Sort/ }).first().click({ force: true }); await p.waitForTimeout(250); o = await open(p); ok(tag + 'Sort closes again, map chips back', count(o) === 0 && o.chips);
    await p.getByRole('button', { name: /^Layers/ }).first().click(); await p.waitForTimeout(250); o = await open(p); ok(tag + 'Layers opens alone', o.layers && count(o) === 1);
    await p.getByRole('button', { name: /^Sort/ }).first().click({ force: true }); await p.waitForTimeout(250); o = await open(p); ok(tag + 'Sort opens, Layers closes', o.sort && !o.layers && count(o) === 1);
    const gi = p.locator('.crm-gap-i:visible'); if (await gi.count()) { await gi.first().evaluate((e) => e.click()); await p.waitForTimeout(250); o = await open(p); ok(tag + 'permit-coverage info opens, Sort closes', !o.sort && count(o) === 0 && await p.locator('#crm-gap-pop').isVisible()); }
    await p.getByRole('button', { name: /data source/i }).first().click({ force: true }); await p.waitForTimeout(250); o = await open(p); ok(tag + 'data panel opens, the rest close', o.data && count(o) === 1 && !(await p.locator('#crm-gap-pop').isVisible().catch(() => false)));
    if (w === 390) { await p.getByRole('button', { name: 'More', exact: true }).click({ force: true }); await p.waitForTimeout(300); o = await open(p); ok(tag + 'More opens, data panel closes', o.more && !o.data && count(o) === 1);
      await p.keyboard.press('Escape'); await p.waitForTimeout(250); }
    else { await p.keyboard.press('Escape'); await p.waitForTimeout(250); }
    await p.locator('input[role=combobox], input[type=search]').first().click({ force: true }); await p.waitForTimeout(300); o = await open(p); ok(tag + 'search suggestions open alone', count(o) === 0 && (w > 500 || !o.chips));
    await p.keyboard.press('Escape'); await p.mouse.click(w / 2, h / 2 - 100); await p.waitForTimeout(400); o = await open(p); ok(tag + 'all closed, map chips back: ' + JSON.stringify(o), count(o) === 0 && o.chips);
    if (p.errs.length) console.log('ERRS', p.errs.slice(0, 3));
  }
  const q = await mk(1440, 900); await q.goto(U + 'Explore1440.dc.html'); await q.waitForTimeout(1500); ok('CountyLens (switch off): no crm-ov class', await q.evaluate(() => !document.querySelector('.crm-ov') && !document.querySelector('.crm-on')));
  await b.close();
})();
