// B-08: Leads list, combined filters in the URL, paged (team sample)
const { chromium } = require('playwright'); const U = process.env.BASE || (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const mk = async (w, h) => { const ctx = await b.newContext({ viewport: { width: w, height: h } }); await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort()); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); return p; };
  const body = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  const p = await mk(1440, 900); await p.goto(U + 'CrmLeads1440.dc.html'); await p.evaluate(() => { localStorage.clear(); }); 
  await p.goto(U + 'CrmLeadsPaged1440.dc.html'); await p.waitForTimeout(1500); let t = await body(p);
  ok('1440 paged: ' + (t.match(/Showing [^·]*/) || [''])[0], /Showing 9–16 of 26/.test(t));
  ok('main store untouched by the team sample', await p.evaluate(() => localStorage.getItem('countylens.proto.crmLeads') === null));
  const pager = p.getByRole('navigation', { name: 'Lead pages' }); ok('pager with 4 pages', await pager.getByRole('button', { name: /4/ }).count() >= 1);
  await pager.getByRole('button', { name: 'Next page' }).click(); await p.waitForTimeout(400); t = await body(p);
  ok('page 3 → URL note page=3 and team=1: ' + (t.match(/URL: \S+/) || [''])[0], /URL: \/leads\?assignee=all&page=3&team=1/.test(t) && /Showing 17–24 of 26/.test(t));
  await p.getByRole('button', { name: 'New', exact: true }).first().click(); await p.waitForTimeout(400); t = await body(p);
  ok('filter resets to page 1 and joins the URL: ' + (t.match(/URL: \S+/) || [''])[0], /status=new/.test(t) && !/page=3/.test(t));
  const p2 = await mk(390, 844); await p2.goto(U + 'CrmLeadsPaged390.dc.html'); await p2.waitForTimeout(1500); t = await body(p2);
  ok('390 combined filters + page 2: ' + (t.match(/\d+ leads[^S]{0,40}/) || [''])[0] + ' · ' + (t.match(/\d+ of \d+/) || [''])[0], /2 of \d+/.test(t));
  const row = p2.locator('a[href*="lead=T-"]').first(); const href = await row.getAttribute('href'); await row.click(); await p2.waitForTimeout(1500); t = await body(p2);
  ok('team lead opens its page: ' + href, /CrmLead390\.dc\.html\?lead=T-/.test(p2.url()) && /History/.test(t));
  await p2.getByRole('button', { name: /^Status:/ }).click(); await p2.getByRole('menuitemradio', { name: 'Qualified' }).click(); await p2.waitForTimeout(400); await p2.reload(); await p2.waitForTimeout(1500);
  ok('team lead status change kept after reload', /Qualified/.test(await p2.getByRole('button', { name: /^Status:/ }).innerText()));
  ok('main store still only the 3 sample leads', await p2.evaluate(() => { const v = JSON.parse(localStorage.getItem('countylens.proto.crmLeads') || 'null'); return v === null || v.every((l) => !/^T-/.test(l.id)); }));
  const p3 = await mk(1440, 900); await p3.goto(U + 'CrmLeads1440.dc.html'); await p3.waitForTimeout(1500); ok('normal Leads list unaffected: ' + ((await body(p3)).match(/\d+ leads · [a-z ]+/) || [''])[0], /3 leads · all mine/.test(await body(p3)));
  const errs = [p, p2, p3].flatMap((x) => x.errs); if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await b.close();
})();
