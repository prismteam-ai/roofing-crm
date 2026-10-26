const { chromium } = require('playwright');
const U = (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }); await p.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const body = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  const go = async (f) => { await p.goto(U + f); await p.waitForTimeout(1500); };
  await go('CrmCandidatesLoading390.dc.html'); ok('candidates loading skeleton', /Loading candidates from the lead index/.test(await body()) && await p.locator('.atlas-skeleton').count() >= 4 && !/No roofs match/.test(await body()));
  await go('CrmCandidatesEmpty390.dc.html'); ok('candidates empty with chips', /No roofs match within 0\.5 mi/.test(await body()) && await p.getByRole('button', { name: /Widen to/ }).count() >= 1);
  await go('CrmCandidatesError390.dc.html'); ok('candidates error with Retry', /Results unavailable/.test(await body()) && await p.getByRole('button', { name: 'Retry' }).count() === 1);
  await p.getByRole('button', { name: 'Retry' }).click(); await p.waitForTimeout(300); ok('retry shows loading', /Loading candidates/.test(await body()));
  await p.waitForTimeout(1500); ok('retry loads results', !/Loading candidates/.test(await body()) && !/Results unavailable/.test(await body()));
  await go('CrmCandidatesPartial390.dc.html'); { const gi = p.locator('.crm-gap-i:visible'); const n = await gi.count(); if (n) { await gi.first().click(); await p.waitForTimeout(200); } ok('candidates partial: info icon opens the coverage note', n === 1 && /Part of this area has no permit data/.test(await body())); }
  for (const [f, re] of [['CrmCandidatesStates', /Candidate list and property drawer states.*Loading.*Empty.*Error.*Partial.*Rate-limited/], ['CrmTriageStates', /Field triage states.*Loading.*Empty.*Error.*Partial/], ['CrmAskStates', /Ask the agent states.*Loading.*Empty.*Error.*Partial.*Rate-limited/]]) { await p.setViewportSize({ width: 1440, height: 760 }); await go(f + '.dc.html'); ok('overview ' + f, re.test(await body())); }
  await p.setViewportSize({ width: 1440, height: 900 }); await go('Explore1440.dc.html?mapView=off'); ok('switch off unchanged', !/Loading candidates/.test(await body()));
  if (errs.length) console.log('ERRS', errs.slice(0, 4));
  await b.close();
})();
