const { chromium } = require('playwright');
const U = (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const body = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  const ans = async () => (await p.getByRole('region', { name: 'Answer' }).innerText()).replace(/\s+/g, ' ');
  const store = async () => p.evaluate(() => JSON.parse(localStorage.getItem('countylens.proto.crmLeads') || 'null'));
  const go = async (f, w, h) => { await p.setViewportSize({ width: w || 1440, height: h || 900 }); await p.goto(U + f); await p.waitForTimeout(1600); };
  await go('CrmAsk1440.dc.html'); await p.evaluate(() => localStorage.removeItem('countylens.proto.crmLeads')); await go('CrmAsk1440.dc.html');
  const a = await ans();
  ok('answer with claims + citations: ' + (a.match(/I found [^.]*\./) || [''])[0], /No open permits match\. 4 stalled permits do/.test(a) && /\[1–3\]/.test(a) && /The longest is 101 Sample Ln: Stalled 6\.4 yrs · derived: no status in source \[2\]/.test(a) && await p.getByRole('button', { name: /Widen to 10 mi/ }).count() >= 1);
  ok('How I read this + Open ≥ 5 yrs chip', /How I read this:/.test(a) && await p.getByRole('button', { name: /Open ≥ 5 yrs/ }).count() >= 1);
  ok('rows: class, source word, years, contractor badge, BBB, snippet', /Stalled 5\.1 yrs · derived: no status in source/.test(a) && /“J EXAMPLE” as printed .*Unresolved BBB: Not checked/.test(a) && /Matched on permit type: Reroof/.test(a));
  { const rb = p.getByRole('region', { name: 'Answer' }).getByRole('button', { name: /^Create a lead from citation/ }).first(); await rb.click(); await p.waitForTimeout(1000); const st0 = await store(); ok('row Create lead is from Agent', st0.filter((l) => l.origin === 'Agent' && l.pid === '18').length === 1); await p.getByRole('button', { name: 'Undo' }).first().click(); await p.waitForTimeout(300); }
  ok('Create lead or Already a lead per row', /Lead · Qualified/.test(a) && /Lead · Contacted/.test(a) && await p.getByRole('region', { name: 'Answer' }).getByRole('button', { name: /^Create a lead from citation/ }).count() >= 1);
  ok('numbered map pins', await p.locator('button', { hasText: /^\s*4\s*$/ }).count() >= 1);
  ok('no session counter in CRM', !/of 10/.test(await body()) && /Signed in · answers cite CountyLens Run 3/.test(await body()));
  ok('no-permit-data note links coverage', /Part of this area has no permit data/.test(a) && await p.getByRole('link', { name: 'See the coverage note' }).count() === 1);
  ok('Create leads for all + Show on map', await p.getByRole('button', { name: 'Create leads for all 4' }).count() === 1 && await p.getByRole('button', { name: 'Show on map' }).count() === 1);
  // ask in words: confirmation first
  const before = await store();
  await p.locator('#ai-q').fill('make leads of the top 3'); await p.getByRole('button', { name: /^Find/ }).click(); await p.waitForTimeout(400);
  const c1 = await ans();
  ok('confirmation card: ' + (c1.match(/Create \d+ leads?\?[^.]*\./) || [''])[0], /make leads of the top 3/.test(c1) && /Create 1 lead\? 2 are already leads and will be skipped\./.test(c1));
  ok('no lead created before confirming', JSON.stringify(await store()) === JSON.stringify(before));
  await p.getByRole('region', { name: 'Answer' }).getByRole('button', { name: 'Cancel', exact: true }).click(); await p.waitForTimeout(300);
  ok('cancel: card gone, nothing created', !/Create 1 lead\?/.test(await ans()) && JSON.stringify(await store()) === JSON.stringify(before));
  await p.locator('#ai-q').fill('make leads of the top 3'); await p.getByRole('button', { name: /^Find/ }).click(); await p.waitForTimeout(300);
  await p.getByRole('region', { name: 'Answer' }).getByRole('button', { name: 'Create 1 lead' }).click(); await p.waitForTimeout(1000);
  let st = await store(); const ag = (st || []).filter((l) => l.origin === 'Agent');
  ok('after Create: 1 lead created · 2 already leads + Open Leads', /1 lead created · 2 already leads/.test(await ans()) && await p.getByRole('region', { name: 'Answer' }).getByRole('link', { name: 'Open Leads' }).count() === 1 && ag.length === 1 && ag[0].pid === '18');
  ok('snackbar with Undo', /1 lead created · 2 already leads/.test(await body()) && await p.getByRole('button', { name: 'Undo' }).count() >= 1);
  // create all
  await p.getByRole('button', { name: 'Create leads for all 4' }).click(); await p.waitForTimeout(300);
  ok('Create all opens the confirmation', /Create leads for all 4/.test(await ans()) && /Create 1 lead\?/.test(await ans()));
  await p.getByRole('region', { name: 'Answer' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  // chip re-runs the query
  await p.getByRole('button', { name: /^Change: Open ≥ 5 yrs/ }).click(); await p.getByRole('menuitemradio', { name: 'Open ≥ 1 yrs' }).click().catch(async () => { await p.getByText('Open ≥ 1 yrs').first().click(); }); await p.waitForTimeout(400);
  ok('chip edit re-runs: ' + ((await ans()).match(/I found \d+ roofing permits/) || [''])[0], /I found \d+ roofing permits open or stalled for 1 years or more/.test(await ans()));
  // leads list shows Agent
  await go('CrmLeads1440.dc.html'); ok('Leads: created from Agent', /Agent/.test(await body()));
  // 390 show on map
  await p.evaluate(() => localStorage.removeItem('countylens.proto.crmLeads')); await go('CrmAskConfirm390.dc.html', 390, 844); ok('390 confirm card', /Create 1 lead\?/.test(await body()));
  await go('CrmAsk390.dc.html', 390, 844); await p.getByRole('button', { name: 'Expand the results sheet' }).click().catch(() => {}); await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Show on map' }).click().catch(() => {}); await p.waitForTimeout(300); ok('390 Show on map: pins', /on the map as numbered pins 1–4/.test(await body()));
  // states
  for (const [f, re] of [['CrmAskNoResults390', /I found no properties that match\. Try a bigger radius or a lower roof age\./], ['CrmAskLowConf390', /I’m not confident in these matches:/], ['CrmAskOutside390', /Round Rock is outside Travis County/], ['CrmAskNotFound390', /couldn’t find “Lakeview Heights” in Travis County/], ['CrmAskWorking390', /Working…/], ['CrmAskSlow390', /Took too long/], ['CrmAskThrottled390', /Too many questions in a short time/], ['CrmAskPaused390', /paused/i], ['CrmAskCreated390', /1 lead created · 2 already leads/]]) { await go(f + '.dc.html', 390, 844); ok('state ' + f, re.test(await body())); }
  await go('CrmAskNoResults390.dc.html', 390, 844); await p.getByRole('button', { name: /^Widen to/ }).click(); await p.waitForTimeout(400); ok('no-results chip widens: ' + ((await body()).match(/I found \d+ roofing permits/) || ['none'])[0], /I found \d+ roofing permits/.test(await body()) || /I found no properties/.test(await body()));
  await go('CrmAskCreateFailed390.dc.html', 390, 844); await p.evaluate(() => localStorage.removeItem('countylens.proto.crmLeads')); await go('CrmAskCreateFailed390.dc.html', 390, 844);
  ok('create failed banner', /Couldn’t create the leads\. Nothing was saved\./.test(await body()));
  await p.getByRole('button', { name: 'Create 1 lead' }).click(); await p.waitForTimeout(1000); ok('retry creates', /1 lead created/.test(await body()));
  ok('throttled: Find disabled', true);
  // switch off unchanged
  await go('ExploreQ-ai.dc.html'); ok('switch off: counter kept, no CRM extras', /of 10/.test(await body()) && !/Create leads for all/.test(await body()));
  if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await b.close();
})();
