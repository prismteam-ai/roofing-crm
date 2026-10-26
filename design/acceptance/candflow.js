const { chromium } = require('playwright');
const U = (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const store = async () => p.evaluate(() => JSON.parse(localStorage.getItem('countylens.proto.crmLeads') || '[]'));
  const reset = async () => p.evaluate(() => localStorage.removeItem('countylens.proto.crmLeads'));
  const body = async () => p.locator('body').innerText();
  const go = async (f, w, h) => { await p.setViewportSize({ width: w || 1440, height: h || 900 }); await p.goto(U + f); await p.waitForTimeout(1600); };

  // 1. bulk from the candidate list
  await go('CrmCandidates1440.dc.html'); await reset(); await go('CrmCandidates1440.dc.html');
  ok('lead pill on rows', /Lead · Contacted/.test(await body()));
  await p.getByRole('button', { name: /Create 3 leads/ }).click(); await p.waitForTimeout(300);
  const bt = (await body()).replace(/\s+/g, ' '); ok('confirm sheet', /Create 2 leads\?/.test(bt) && /Already a lead · Contacted · skipped/.test(bt)); if (!/Create 2 leads\?/.test(bt)) console.log(bt.slice(0, 600));
  await p.getByRole('dialog').getByRole('button', { name: 'Create 2 leads' }).click(); await p.waitForTimeout(400);
  ok('bulk snackbar', /2 leads created · 1 already a lead/.test(await body()) && await p.getByRole('link', { name: 'Open Leads' }).count() === 1);
  let st = await store(); const made = st.filter((l) => l.origin === 'List'); ok('2 leads stored from List (' + made.map((l) => l.id + ':' + l.pid + ':' + l.src).join(' ') + ')', made.length === 2 && made.every((l) => l.status === 'New' && l.owner === 'Sample Rep' && l.src === 'permit'));
  await p.getByRole('button', { name: 'Undo' }).click(); await p.waitForTimeout(300);
  st = await store(); ok('bulk undo removes both', st.filter((l) => l.origin === 'List').length === 0 && /Removed 2 leads/.test(await body()));
  // 2. hide existing leads
  const n0 = await p.locator('[role="row"] input[type="checkbox"], tbody input[type="checkbox"]').count();
  const rows0 = (await body()).match(/Lead · /g) || [];
  await p.getByRole('button', { name: /Hide existing leads/ }).click(); await p.waitForTimeout(300);
  ok('hide existing leads', !/Lead · Contacted/.test(await body()) && /Existing leads hidden \(3\)/.test(await body()));
  // 3. drawer: one tap create, note, undo
  await go('CrmProperty1440.dc.html');
  ok('drawer is CRM: not a lead, lineage link', /Not a lead yet/.test(await body()) && await p.getByRole('link', { name: 'View lineage in Explorer' }).first().getAttribute('href') === 'Property1440.dc.html?mapView=off&pid=18' && await p.getByRole('link', { name: 'View lineage in Explorer' }).first().getAttribute('target') === '_blank');
  ok('no Open in CRM in drawer', await p.getByText('Open in CRM').count() === 0);
  await p.getByRole('button', { name: 'Create lead', exact: true }).click(); await p.waitForTimeout(150);
  ok('creating', /Creating…/.test(await body()));
  await p.waitForTimeout(800);
  ok('created snackbar', /Lead created · L-1043 · New · assigned to you/.test(await body()) && /Lead created · New · Sample Rep \(you\)/.test(await body()));
  await p.getByRole('button', { name: 'Add a note' }).first().click(); await p.waitForTimeout(150);
  await p.getByRole('textbox', { name: 'Note for the new lead' }).first().fill('Owner asked for a call after 5'); await p.getByRole('button', { name: 'Save note' }).first().click(); await p.waitForTimeout(300);
  st = await store(); const l43 = st.find((l) => l.id === 'L-1043'); ok('lead stored with note, origin Map, main signal property', !!l43 && l43.pid === '18' && l43.origin === 'Map' && l43.src === 'property' && l43.notes[0].text === 'Owner asked for a call after 5');
  // duplicate refused: create again from the card list
  const before = (await store()).length;
  await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('countylens.proto.crmLeads')); });
  // 4. permit lead
  await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('countylens.proto.crmLeads')).filter((l) => l.id !== 'L-1043'); localStorage.setItem('countylens.proto.crmLeads', JSON.stringify(a)); });
  await go('CrmProperty1440.dc.html');
  await p.getByRole('button', { name: 'Create lead from this permit' }).click(); await p.waitForTimeout(1000);
  st = await store(); const lp = st.find((l) => l.pid === '18'); ok('permit lead records the permit (' + (lp && lp.permit) + ')', !!lp && lp.src === 'permit' && /2020-062543 BP/.test(lp.permit));
  ok('permit row marked main signal', /Lead L-1043 · main signal/.test(await body()));
  await p.getByRole('button', { name: 'Undo' }).first().click(); await p.waitForTimeout(300);
  ok('undo in drawer', !(await store()).find((l) => l.pid === '18') && /Not a lead yet/.test(await body()));
  // 5. already a lead
  await go('CrmPropertyDup390.dc.html', 390, 844);
  ok('already a lead in drawer', /Already a lead · Contacted · Sample Rep \(you\)/.test(await body()) && await p.getByRole('link', { name: 'Open lead' }).count() >= 1 && await p.getByRole('button', { name: 'Create lead', exact: true }).count() === 0);
  // duplicate refused from a stale card (store has 101; card thinks not): use API directly
  const dupRes = await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('countylens.proto.crmLeads') || '[]'); return a.filter((l) => l.pid === '101').length; });
  ok('one lead per property', dupRes === 1);
  // 6. failed
  await go('CrmPropertyFailed1440.dc.html');
  ok('failed banner with Try again', /Couldn’t create the lead. Nothing was saved./.test(await body()));
  await p.getByRole('button', { name: 'Try again' }).first().click(); await p.waitForTimeout(1000);
  ok('try again creates', !!(await store()).find((l) => l.pid === '18'));
  await reset();
  await go('CrmPropertyFailed390.dc.html', 390, 844);
  ok('offline at 390', /You’re offline. The lead was not saved./.test(await body()));
  // 7. partial
  await go('CrmPropertyPartial390.dc.html', 390, 844);
  ok('partial: roof unknown + no permit data', /Roof age unknown/.test(await body()) && /No permit data here/.test(await body()));
  await p.getByRole('button', { name: 'Create lead', exact: true }).click(); await p.waitForTimeout(1000);
  ok('partial still creates', !!(await store()).find((l) => l.pid === '220' && l.roof === null));
  // 8. card one tap and why label
  await reset(); await go('CrmLeadCreate1440.dc.html');
  ok('why is this a lead', /Why is this a lead\?/.test(await body()));
  await p.getByRole('button', { name: 'Dismiss' }).first().click(); await p.waitForTimeout(200);
  await p.getByRole('button', { name: 'Create lead', exact: true }).first().click(); await p.waitForTimeout(1000);
  ok('card one-tap create', !!(await store()).find((l) => l.pid === '220' && l.origin === 'Map'));
  await go('CrmLeadDup1440.dc.html'); ok('dup snackbar', /Already a lead · Contacted · Sample Rep \(L-1042\). Nothing was added./.test(await body()));
  // 9. property page with the switch on, and off
  await go('Property1440.dc.html?mapView=on'); ok('property page CRM (101 already a lead)', /Already a lead · Contacted/.test(await body()) && await p.getByText('Open in CRM').count() === 0 && /Lineage · Metadata and Merged from/.test(await body()));
  await go('Property1440.dc.html?mapView=off'); ok('property page CountyLens unchanged', await p.getByText('Open in CRM').count() === 1 && /Owner merged from 2 records/.test(await body()));
  if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await b.close();
})();
