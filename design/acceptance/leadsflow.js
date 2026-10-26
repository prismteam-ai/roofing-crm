const { chromium } = require('playwright');
const U = (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const body = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  const go = async (f, w, h) => { await p.setViewportSize({ width: w || 1440, height: h || 900 }); await p.goto(U + f); await p.waitForTimeout(1500); };
  const q = () => decodeURIComponent(new URL(p.url()).search);
  await go('CrmLeads1440.dc.html'); await p.evaluate(() => localStorage.removeItem('countylens.proto.crmLeads')); await go('CrmLeads1440.dc.html');
  ok('3 leads, all mine', /3 leads · all mine/.test(await body()));
  ok('table columns', /Lead Status Assignee Roof Main permit Contractor From Last activity Created/.test(await body()) && !/ Mi From/.test(await body()));
  ok('roof basis, permit word, as printed', /reroof permit 2003 · High/.test(await body()) && /Stalled 6\.4 yrs · derived: no status in source/.test(await body()) && /“SAMPLE ROOFING CO” as printed/.test(await body()));
  // combine filters
  await p.getByRole('button', { name: 'New', exact: true }).click(); await p.getByRole('button', { name: 'Contacted', exact: true }).click(); await p.waitForTimeout(200);
  await p.getByRole('group', { name: /Roof age/ }).getByRole('button', { name: '15' }).click();
  await p.getByRole('group', { name: /Permit status/ }).getByRole('button', { name: 'Open' }).click();
  await p.getByRole('group', { name: /Permit status/ }).getByRole('button', { name: 'Stalled' }).click();
  await p.getByRole('group', { name: /Permit open/ }).getByRole('button', { name: '5 yrs' }).click();
  await p.getByRole('combobox', { name: 'Area' }).selectOption('pf'); await p.waitForTimeout(300);
  const t = await body();
  ok('sentence: ' + (t.match(/\d+ leads? · [^S]*?(?= Sort)/) || [''])[0], /1 lead · New or Contacted · roof ≥ 15 yrs · open or stalled permit open ≥ 5 yrs · within 5 mi of Pflugerville city hall/.test(t));
  ok('URL: ' + q(), q() === '?status=new,contacted&roof=15&permit=open,stalled&openYrs=5&place=pf&r=5');
  ok('distance column appears with the radius', / Mi From/.test(t) && /4\.6 Map/.test(t));
  ok('URL note on the board', /URL: \/leads\?status=new,contacted&roof=15&permit=open,stalled&openYrs=5&place=pf&r=5/.test(t));
  await p.getByRole('combobox', { name: 'Sort leads' }).selectOption('near'); await p.waitForTimeout(200);
  ok('sort in URL', /sort=near/.test(q()));
  // reload keeps everything
  await p.reload(); await p.waitForTimeout(1500);
  ok('reload restores filters + sort', /1 lead · New or Contacted · roof ≥ 15 yrs/.test(await body()) && await p.getByRole('combobox', { name: 'Sort leads' }).inputValue() === 'near');
  // copy link
  await p.getByRole('button', { name: 'Copy link' }).click(); await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok('copy link: ' + clip, /CrmLeads1440\.dc\.html\?status=new,contacted&roof=15/.test(clip) && /Link copied/.test(await body()));
  // show on map
  const sm = await p.getByRole('link', { name: 'Show on map' }).getAttribute('href'); ok('show on map href ' + sm, sm === 'CrmMap1440.dc.html?leads=L-1042');
  // no match + clear
  await p.getByRole('button', { name: 'Won', exact: true }).click(); await p.getByRole('button', { name: 'New', exact: true }).click(); await p.getByRole('button', { name: 'Contacted', exact: true }).click(); await p.waitForTimeout(200);
  ok('no match', /No leads match these filters\./.test(await body()));
  await p.getByRole('button', { name: 'Clear filters' }).last().click(); await p.waitForTimeout(200);
  ok('clear filters', /3 leads · all mine/.test(await body()) && q() === '');
  // assignee
  await p.getByRole('button', { name: 'All reps' }).click(); await p.waitForTimeout(200); ok('all reps', /3 leads · all reps/.test(await body()) && q() === '?assignee=all');
  await p.getByRole('combobox', { name: 'Assignee by name' }).selectOption('Alex Example'); await p.waitForTimeout(200); ok('by name: none', /0 leads · assigned to Alex Example/.test(await body()) && /No leads match/.test(await body()));
  // row click opens lead detail
  await go('CrmLeads1440.dc.html'); await p.locator('.ld-row').first().click({ position: { x: 700, y: 20 } }); await p.waitForTimeout(1200);
  ok('row click opens lead detail: ' + p.url(), /CrmLead1440\.dc\.html\?lead=L-10/.test(p.url()));
  // page in URL (390: 3 per page; add leads to get 2 pages)
  await go('CrmLeads1440.dc.html'); await p.getByRole('button', { name: 'Reset sample leads' }).click(); await p.waitForTimeout(200);
  await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('countylens.proto.crmLeads')); const x = a[0]; for (let i = 0; i < 2; i++) a.push(Object.assign({}, x, { id: 'L-20' + i, pid: '9' + i, history: [], notes: [] })); localStorage.setItem('countylens.proto.crmLeads', JSON.stringify(a)); });
  await go('CrmLeads390.dc.html?page=2', 390, 844);
  ok('390 page 2 from URL', /Leads · 5/.test(await body()) && /2 of 2/.test(await body()));
  ok('390 sticky header chips', await p.getByRole('button', { name: 'All my leads' }).count() === 1);
  await p.evaluate(() => localStorage.removeItem('countylens.proto.crmLeads'));
  // signed-out shared link
  await go('CrmLeadsFiltered1440.dc.html');
  const so = await p.getByRole('link', { name: 'Open this link signed out' }).getAttribute('href'); await go(so);
  ok('signed out: sign-in with next', /Signed out. Sign in to continue/.test(await body()) && /next=CrmLeads1440/.test(p.url()));
  await p.locator('#si-pw').fill('samplepass'); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForTimeout(2500);
  ok('back to the filtered list: ' + p.url(), /CrmLeads1440\.dc\.html\?status=new,contacted/.test(decodeURIComponent(p.url())) && /1 lead · New or Contacted/.test(await body()));
  // map with ?leads=
  await go('CrmMap1440.dc.html?leads=L-1042,L-1041');
  ok('map shows the 2 leads', /2 leads from your Leads list/.test(await body()));
  await p.getByRole('button', { name: 'Clear: show all candidates' }).click(); await p.waitForTimeout(300);
  ok('clear restores the map', !/from your Leads list/.test(await body()) && !/leads=/.test(p.url()));
  // states
  for (const [f, re] of [['CrmLeadsLoading390', /Loading your leads/], ['CrmLeadsEmpty390', /No leads yet.*Go to map/], ['CrmLeadsError390', /Leads couldn’t load/], ['CrmLeadsPartial390', /Property not in Run 4/], ['CrmLeadsNoMatch390', /No leads match these filters/], ['CrmLeadsStates', /No leads match these filters/]]) { await go(f + '.dc.html', 390, 844); ok('state ' + f, re.test(await body())); }
  await go('Explore1440.dc.html?leads=L-1042&mapView=off'); ok('switch off ignores ?leads', !/from your Leads list/.test(await body()));
  if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await b.close();
})();
