const { chromium } = require('playwright');
const U = (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const body = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  const hist = async () => (await p.locator('ol[aria-label="History, newest first"]').innerText()).replace(/\s+/g, ' ');
  const store = async () => p.evaluate(() => JSON.parse(localStorage.getItem('countylens.proto.crmLeads') || '[]'));
  const go = async (f, w, h) => { await p.setViewportSize({ width: w || 1440, height: h || 900 }); await p.goto(U + f); await p.waitForTimeout(1400); };
  await go('CrmLead1440.dc.html'); await p.getByRole('button', { name: 'Reset sample leads' }).click(); await go('CrmLead1440.dc.html?lead=L-1041');
  ok('list beside detail, current marked', await p.locator('nav[aria-label="Leads"] a[aria-current="page"]').count() === 1 && /58 Example Rd · Pflugerville/.test(await body()));
  ok('header actions', await p.getByRole('link', { name: 'Show on map' }).getAttribute('href') === 'CrmMap1440.dc.html?leads=L-1041' && await p.getByRole('link', { name: 'View property' }).getAttribute('href') === 'CrmMap1440.dc.html?sel=58' && /pid=58/.test(await p.getByRole('link', { name: 'View lineage in Explorer' }).getAttribute('href')));
  ok('snapshot + no change', /From CountyLens Run 3 · manifest bafybeih…q7n3/.test(await body()) && /No change since this lead was created/.test(await body()));
  // status change
  await p.getByRole('button', { name: /^Status: New/ }).click(); await p.getByRole('menuitemradio', { name: 'Contacted' }).click(); await p.waitForTimeout(150);
  ok('saving', /Saving the status…/.test(await body())); await p.waitForTimeout(800);
  ok('saved + status in history', /Saved/.test(await body()) && /Status: New → Contacted Sample Rep/.test(await hist()));
  // assignee
  await p.getByRole('button', { name: /^Assignee:/ }).click(); await p.getByRole('menuitemradio', { name: 'Alex Example' }).click(); await p.waitForTimeout(1000);
  ok('assignee in history', /Assignee: Sample Rep → Alex Example/.test(await hist()));
  // note
  await p.getByRole('textbox', { name: 'New note' }).fill('Called, asked for an estimate'); await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(1000);
  ok('note listed and in history', /Called, asked for an estimate Sample Rep/.test(await body()) && /Note added: “Called, asked for an estimate”/.test(await hist()));
  ok('history newest first', (await hist()).indexOf('Note added') < (await hist()).indexOf('Status: New'));
  // reload keeps
  await p.reload(); await p.waitForTimeout(1400);
  ok('reload keeps status, assignee, note', /Status: Contacted/.test(await p.getByRole('button', { name: /^Status:/ }).getAttribute('aria-label')) && /Alex Example/.test(await body()) && /Called, asked for an estimate/.test(await body()));
  // disabled actions
  const sm = p.getByRole('button', { name: /Send message/ });
  ok('Send message disabled, Outreach · Soon', await sm.getAttribute('aria-disabled') === 'true' && /Outreach · Soon/.test(await sm.innerText()) && /Outreach · Soon/.test(await p.locator('span[title^="Outreach"]').getAttribute('title')));
  ok('tooltip text', /Nothing is sent/.test(await body()));
  ok('Create estimate disabled, Estimates · Soon', await p.getByRole('button', { name: /Create estimate/ }).getAttribute('aria-disabled') === 'true');
  // save fails: undone + try again
  await p.getByRole('button', { name: 'Next save fails' }).click();
  await p.getByRole('button', { name: /^Status: Contacted/ }).click(); await p.getByRole('menuitemradio', { name: 'Won' }).click(); await p.waitForTimeout(1000);
  let l = (await store()).find((x) => x.id === 'L-1041');
  ok('save failed: undone', /Couldn’t save the status/.test(await body()) && l.status === 'Contacted' && !/→ Won/.test(await hist()));
  await p.getByRole('button', { name: 'Try again' }).click(); await p.waitForTimeout(1000);
  l = (await store()).find((x) => x.id === 'L-1041'); ok('try again saves', l.status === 'Won' && /Contacted → Won/.test(await hist()));
  // note fail keeps text
  await p.getByRole('button', { name: 'Next save fails' }).click(); await p.getByRole('textbox', { name: 'New note' }).fill('Second note'); await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(1000);
  ok('note fail keeps text', /your text is still in the box/.test(await body()) && await p.getByRole('textbox', { name: 'New note' }).inputValue() === 'Second note' && !/Second note Sample Rep/.test(await body()));
  // list navigation
  await p.locator('nav[aria-label="Leads"] a', { hasText: '101 Sample Ln' }).click(); await p.waitForTimeout(1200); ok('list opens another lead', /lead=L-1042/.test(p.url()));
  // leads row -> CrmLead
  await go('CrmLeads1440.dc.html'); ok('Leads rows open CrmLead', /CrmLead1440\.dc\.html\?lead=/.test(await p.locator('.ld-row a').first().getAttribute('href')));
  // view property opens the drawer
  await go('CrmMap1440.dc.html?sel=58'); ok('View property opens the CRM drawer', /View lineage in Explorer/.test(await body()) && /58 Example Rd/.test(await body()));
  // changed signal
  await go('CrmLeadChanged390.dc.html', 390, 2000); ok('Now column for changed permit', /Now · Run 3/.test(await body()) && /Changed Closed 2026/.test(await body()) && /Run 2 · manifest bafybeig…k2p8/.test(await body()));
  // 390 full page back
  ok('390 Back to Leads', await p.getByRole('link', { name: 'Back to Leads' }).count() === 1 && await p.locator('nav[aria-label="Leads"]').count() === 0);
  for (const [f, re] of [['CrmLeadLoading390', /Loading lead L-1042/], ['CrmLeadSaving390', /Saving the status…/], ['CrmLeadSaveFailed390', /Couldn’t save the status/], ['CrmLeadStale390', /Property not in Run 4; the lead keeps its snapshot/], ['CrmLeadElsewhere390', /updated by Alex Example. Reload to see the latest/], ['CrmLeadDeleted390', /This lead was deleted/], ['CrmLead390.dc.html?lead=L-9999'.replace('.dc.html', ''), /doesn’t exist/], ['CrmLeadStates', /Changed elsewhere/]]) { await go(f.includes('?') ? f.replace('?', '.dc.html?') : f + '.dc.html', 390, 844); ok('state ' + f, re.test(await body())); }
  await go('CrmLeadElsewhere390.dc.html', 390, 2000); await p.getByRole('button', { name: 'Reload' }).click(); await p.waitForTimeout(1400); ok('reload clears changed-elsewhere', !/Reload to see the latest/.test(await body()));
  if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await b.close();
})();
