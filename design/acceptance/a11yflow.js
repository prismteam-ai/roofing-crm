const { chromium } = require('playwright');
const U = (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const mk = async (w, h, rm) => { const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: rm ? 'reduce' : 'no-preference' }); await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort()); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); return p; };
  const go = async (p, f) => { await p.goto(U + f); await p.waitForTimeout(1500); };
  const tabTo = async (p, re, max = 80) => { for (let i = 0; i < max; i++) { await p.keyboard.press('Tab'); const a = await p.evaluate(() => { const e = document.activeElement; return (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' '); }); if (re.test(a)) return a; } return null; };
  const ring = (p) => p.evaluate(() => { let e = document.activeElement; if (e === document.body) return true; for (let i = 0; i < 3 && e; i++, e = e.parentElement) { const cs = getComputedStyle(e); if ((cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow && cs.boxShadow !== 'none' && i < 3 && e.matches(':focus-within'))) return true; } return false; });
  // 1. Map keyboard model A-4 in the CRM
  let p = await mk(1440, 900); await go(p, 'CrmMap1440.dc.html');
  await p.locator('.atlas-map').focus(); ok('map is a keyboard stop with a focus ring', await ring(p));
  ok('key hint shows while the map has focus', await p.locator('.crm-kbd').first().isVisible().catch(() => false));
  const t0 = await p.evaluate(() => document.querySelector('.atlas-map').innerHTML.length + '|' + (document.querySelector('.atlas-map svg g') || {}).getAttribute?.('transform'));
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('+'); await p.waitForTimeout(300);
  const t1 = await p.evaluate(() => document.querySelector('.atlas-map').innerHTML.length + '|' + (document.querySelector('.atlas-map svg g') || {}).getAttribute?.('transform'));
  ok('arrows pan and + zooms', t0 !== t1);
  // 2. GPS and pin by keyboard
  await go(p, 'CrmMap1440.dc.html'); const g = await tabTo(p, /^Use my location/); ok('Use my location reachable by Tab: ' + g, !!g && await ring(p));
  await go(p, 'CrmMap1440.dc.html'); const d = await tabTo(p, /Drop (a )?pin/i); ok('Drop pin reachable by Tab: ' + d, !!d && await ring(p));
  await go(p, 'CrmMapPinMove1440.dc.html'); const pin = p.locator('button.crmpin').first(); await pin.focus().catch(() => {}); const a0 = await p.evaluate(() => document.activeElement.getAttribute('aria-label')); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(200); const a1 = await p.evaluate(() => document.activeElement.getAttribute('aria-label'));
  ok('pin moves with arrow keys', a0 && a1 && a0 !== a1);
  // 3. Drawer: focus moves in, Tab is trapped, Escape closes and returns focus
  await go(p, 'CrmCandidates1440.dc.html');
  const det = p.getByRole('button', { name: /^Show details for/ }).first(); await det.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  ok('drawer opens with focus inside', await p.evaluate(() => !!document.activeElement.closest('aside[aria-label="Property details"]')));
  for (let i = 0; i < 40; i++) await p.keyboard.press('Tab');
  ok('Tab stays in the drawer', await p.evaluate(() => !!document.activeElement.closest('aside[aria-label="Property details"]')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('Escape closes the drawer and returns focus', await p.locator('aside[aria-label="Property details"]').count() === 0 && /^Show details for/.test(await p.evaluate(() => document.activeElement.getAttribute('aria-label') || '')));
  // 4. Bulk confirmation sheet
  await go(p, 'CrmCandidates1440.dc.html'); await p.getByRole('button', { name: /Create 3 leads/ }).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('bulk sheet takes focus', await p.evaluate(() => !!document.activeElement.closest('[aria-labelledby="bk-h"]')));
  for (let i = 0; i < 12; i++) await p.keyboard.press('Tab'); ok('Tab stays in the bulk sheet', await p.evaluate(() => !!document.activeElement.closest('[aria-labelledby="bk-h"]')));
  await p.keyboard.press('Shift+Tab'); ok('Shift+Tab stays too', await p.evaluate(() => !!document.activeElement.closest('[aria-labelledby="bk-h"]')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); ok('Escape closes it, focus back on Create', await p.locator('[aria-labelledby="bk-h"]').count() === 0 && /Create 3 leads/.test(await p.evaluate(() => document.activeElement.textContent)));
  // 5. Shell menus: account menu, data panel, More sheet close with Escape
  await go(p, 'CrmLeads1440.dc.html'); await p.getByRole('button', { name: /^Account:/ }).click(); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('account menu closes with Escape', await p.getByRole('menu', { name: 'Account' }).count() === 0 && /^Account/.test(await p.evaluate(() => document.activeElement.getAttribute('aria-label') || '')));
  await p.getByRole('button', { name: /^Data/ }).first().click(); await p.waitForTimeout(150); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('data panel closes with Escape', await p.getByRole('dialog', { name: 'Data source' }).count() === 0);
  await go(p, 'CrmLead1440.dc.html'); await p.getByRole('button', { name: /^Status:/ }).click(); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('status menu closes with Escape', await p.getByRole('menu', { name: 'Lead status' }).count() === 0 && /^Status/.test(await p.evaluate(() => document.activeElement.getAttribute('aria-label') || '')));
  const p3 = await mk(390, 844); await go(p3, 'CrmLeads390.dc.html'); await p3.getByRole('button', { name: 'More' }).click(); await p3.waitForTimeout(200);
  ok('More sheet takes focus', /Close More/.test(await p3.evaluate(() => document.activeElement.getAttribute('aria-label') || '')));
  for (let i = 0; i < 14; i++) await p3.keyboard.press('Tab'); ok('Tab stays in More', await p3.evaluate(() => !!document.activeElement.closest('[role=dialog]')));
  await p3.keyboard.press('Escape'); await p3.waitForTimeout(200); ok('More closes with Escape', await p3.getByRole('dialog').count() === 0);
  // 6. Triage without swiping
  await go(p3, 'CrmTriage390.dc.html'); ok('triage buttons: Skip, Create lead, Open details', await p3.getByRole('button', { name: /^Skip / }).count() === 1 && await p3.getByRole('button', { name: /^Create lead for/ }).count() === 1 && await p3.getByRole('button', { name: /^Open details for/ }).count() === 1);
  // 7. 390: the primary action is never under the sheet, nav or snackbar
  const onTop = async (pg, loc) => { const h = await loc.elementHandle(); if (!h) return false; return pg.evaluate((el) => { const r = el.getBoundingClientRect(); if (r.bottom > innerHeight || r.top < 0) return false; const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && (e === el || el.contains(e)); }, h); };
  for (const [f, re] of [['CrmMap390.dc.html', /Triage \d+/], ['CrmMapPin390.dc.html', /Triage \d+/], ['CrmMapGps390.dc.html', /Triage \d+/], ['CrmProperty390.dc.html', /^Create lead$/], ['CrmPropertyPartial390.dc.html', /^Create lead$/], ['CrmTriage390.dc.html', /^Create lead for/], ['CrmCandidatesConfirm390.dc.html', /^Create \d+ leads?$/]]) {
    await go(p3, f); const loc = p3.getByRole('button', { name: re }).last(); const c = await loc.count(); ok('390 primary visible on ' + f, c > 0 && await onTop(p3, loc)); }
  await go(p3, 'CrmCandidates390.dc.html'); const sel = p3.locator('input[type=checkbox]').nth(1); if (await sel.count()) { await sel.check().catch(() => {}); await p3.waitForTimeout(200); const cb = p3.getByRole('button', { name: /^Create \d+ leads?/ }).first(); ok('390 selection bar Create n leads visible', await cb.count() > 0 && await onTop(p3, cb)); }
  // 8. Reduced motion: hexagons, ring, triage fling
  const pr = await mk(390, 844, true); await go(pr, 'CrmMap390.dc.html');
  ok('reduced motion: hexagons swap in place', await pr.evaluate(() => { const h = document.querySelector('.hexes polygon'); return !h || getComputedStyle(h).animationName === 'none'; }));
  await go(pr, 'CrmMapGps390.dc.html'); ok('reduced motion: ring jumps', await pr.evaluate(() => { const r = document.querySelector('.radius'); return !r || /none|^0s/.test(getComputedStyle(r).transitionDuration === '0s' ? 'none' : getComputedStyle(r).transitionProperty === 'none' ? 'none' : getComputedStyle(r).transitionDuration); }));
  await go(pr, 'CrmTriage390.dc.html'); ok('reduced motion: no fling', await pr.evaluate(() => { const c = document.querySelector('.tri-card'); return !!c && (getComputedStyle(c).transitionDuration === '0s' || getComputedStyle(c).transitionProperty === 'none'); }));
  // 9. Lead status not by colour alone on markers; pills carry text
  await go(p, 'CrmMapPin1440.dc.html');
  ok('lead markers: status in the label and a line style', await p.evaluate(() => [...document.querySelectorAll('button.mk.is-lead')].every((e) => /lead L-\d+ · (New|Contacted|Qualified|Won|Lost)/.test(e.getAttribute('aria-label') || ''))) && /line \(solid New, dashed Contacted/.test(await p.locator('body').innerText()));
  // 10. Focus is visible on CRM controls (first 40 tab stops on three boards)
  for (const [pg, f] of [[p, 'CrmLeads1440.dc.html'], [p, 'CrmAsk1440.dc.html'], [p3, 'CrmLead390.dc.html']]) { await go(pg, f); let miss = []; for (let i = 0; i < 40; i++) { await pg.keyboard.press('Tab'); if (!(await ring(pg))) miss.push(await pg.evaluate(() => document.activeElement.tagName + ':' + (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').trim().slice(0, 30))); } ok('visible focus on every stop: ' + f + (miss.length ? ' missing ' + JSON.stringify([...new Set(miss)].slice(0, 6)) : ''), miss.length === 0); }
  const errs = [p, p3, pr].flatMap((x) => x.errs); if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await b.close();
})();
