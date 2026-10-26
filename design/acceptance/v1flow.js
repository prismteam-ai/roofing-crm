// CRM-R1/R2 (v1flow): App switcher menu, partial-data states (address, contractor), derived status, no BBB score
const { chromium } = require('playwright'); const U = process.env.BASE || (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const mk = async (w, h) => { const ctx = await b.newContext({ viewport: { width: w, height: h } }); await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort()); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); return p; };
  const text = async (p, f) => { await p.goto(U + f); await p.waitForTimeout(1800); return p.evaluate(() => document.body.innerText); };
  // Apps menu, 1440
  let p = await mk(1440, 900); await p.goto(U + 'CrmMap1440.dc.html'); await p.waitForTimeout(1800);
  const apps = p.getByRole('button', { name: 'Apps' }).first();
  ok('1440: Apps is a menu button, not a link', (await apps.getAttribute('aria-haspopup')) === 'menu');
  await apps.click(); await p.waitForTimeout(250);
  const items = await p.getByRole('menuitem').allInnerTexts();
  ok('1440: menu lists CountyLens, Roofing CRM, Landing page: ' + items.map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 30)).join(' | '), /CountyLens/.test(items[0]) && /Roofing CRM/.test(items[1]) && /Landing page/.test(items[2]));
  ok('1440: Roofing CRM is the current app (aria-current)', (await p.getByRole('menuitem', { name: /Roofing CRM/ }).getAttribute('aria-current')) === 'true');
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  ok('1440: Escape closes the menu', (await p.getByRole('menuitem').count()) === 0);
  ok('1440: focus returns to Apps', await p.evaluate(() => /Apps/.test(document.activeElement && document.activeElement.getAttribute('aria-label') || '')));
  await apps.click(); await p.getByRole('button', { name: /^Account/ }).first().click(); await p.waitForTimeout(250);
  ok('1440: opening Account closes Apps (one overlay)', (await p.getByRole('menuitem', { name: /Roofing CRM/ }).count()) === 0);
  p.errs.length && console.log('ERRS', p.errs.slice(0, 2));
  // Apps in the 390 More sheet
  p = await mk(390, 844); await p.goto(U + 'CrmMap390.dc.html'); await p.waitForTimeout(1800);
  await p.getByRole('button', { name: 'More', exact: true }).click(); await p.waitForTimeout(300);
  const sheet = await p.evaluate(() => document.body.innerText);
  ok('390: More sheet holds Apps: CountyLens, Roofing CRM, Landing page', /Apps/.test(sheet) && /CountyLens/.test(sheet) && /Roofing CRM/.test(sheet) && /Landing page/.test(sheet));
  ok('390: Roofing CRM row is current', (await p.locator('a[aria-current=true]', { hasText: 'Roofing CRM' }).count()) === 1);
  // Shell 1440 with menu open
  p = await mk(1440, 900); let t = await text(p, 'CrmShellApps1440.dc.html'); ok('CrmShellApps1440 shows the open menu', /Landing page/.test(t) && /Roofing CRM/.test(t));
  // Address not published
  p = await mk(390, 844);
  for (const f of ['CrmMapNoAddress390', 'CrmCandidatesNoAddress390', 'CrmPropertyNoAddress390', 'CrmTriageNoAddress390', 'CrmAskNoAddress390', 'CrmLeadsNoAddress390', 'CrmLeadNoAddress390']) {
    t = await text(p, f + '.dc.html'); ok(f + ': TCAD title + “Address not published in Run 3”, no street', /TCAD 02\d{8}/.test(t) && /near [A-Z][a-z]+/.test(t) && /Address not published in Run \d+/.test(t) && !/\d+ (Sample|Example|Placeholder) /.test(t.replace(/Sample Rep/g, '')));
  }
  // Contractor not published
  for (const f of ['CrmPropertyNoContractor390', 'CrmTriageNoContractor390', 'CrmAskNoContractor390', 'CrmLeadNoContractor390', 'CrmLeadsNoContractor390']) {
    t = await text(p, f + '.dc.html'); ok(f + ': “Contractor not published” with a reason, no printed name', /Contractor not published/.test(t) && /no lexicon carrier/i.test(t) && !/as printed on permit|SAMPLE ROOFING CO|Example Roofing LLC/.test(t.replace(/Contractor, as printed on permit/g, '')));
  }
  const w = await mk(1440, 900); t = await text(w, 'CrmLeadsNoContractor1440.dc.html'); ok('Leads column at 1440: Contractor not published', /Contractor not published/.test(t));
  // Derived status, BBB, badge, type, evidence
  t = await text(p, 'CrmProperty390.dc.html'); ok('drawer: “Stalled · derived: no status in source”, no “source says”', /Stalled · derived: no status in source/.test(t) && !/source says/.test(t));
  t = await text(p, 'CrmProperty390.dc.html'); ok('drawer: no BBB score or letter, no Candidate/Ambiguous/Conflicting badge', !/Rated A|\bA−/.test(t) && !/\b(Candidate|Ambiguous|Conflicting)\b/.test(t));
  t = await text(p, 'CrmAskNoAddress390.dc.html'); ok('agent: honest stalled-only answer, widen chip, evidence names the field', /No open permits match/.test(t) && /Widen to \d+ mi/.test(t) && /Matched on permit type: Reroof/.test(t));
  t = await text(p, 'CrmTriage390.dc.html'); ok('triage: BBB shows its reason', /BBB: (Blocked|Not checked) · /.test(t));
  // Data panel close is 48 px
  p = await mk(1440, 900); await p.goto(U + 'CrmShellData1440.dc.html'); await p.waitForTimeout(1800);
  const bx = await p.getByRole('button', { name: 'Close' }).first().boundingBox(); ok('data panel Close is 48 × 48: ' + (bx && Math.round(bx.width) + '×' + Math.round(bx.height)), bx && bx.width >= 47.5 && bx.height >= 47.5);
  // Hub card line (E-95)
  for (const [f, w] of [['Hub1440', 1440], ['Hub768', 768], ['Hub390', 390]]) { const h = await mk(w, 900); t = await text(h, f + '.dc.html'); ok(f + ': Roofing CRM card says “Leads and notes”, no “coming soon” lead line', /Leads and notes/.test(t) && !/Lead tools/.test(t)); }
  await b.close();
})();
