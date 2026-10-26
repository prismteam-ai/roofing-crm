const { chromium } = require('playwright');
const U = (process.env.BASE || 'http://localhost:8765/');
(async () => { const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
 const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, r => r.abort());
 const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
 const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
 const next = encodeURIComponent('CrmLeads390.dc.html?status=Contacted&roof=20');
 await p.goto(U + 'CrmSignIn390.dc.html?state=expired&next=' + next); await p.waitForTimeout(1200);
 ok('expired banner', await p.getByText('Signed out. Sign in to continue where you left off').count() === 1);
 ok('no forgot / sign-up link', await p.locator('a', { hasText: /forgot|sign up|create account/i }).count() === 0);
 const pw = p.locator('#si-pw'); await pw.fill('samplepass'); 
 await p.getByRole('button', { name: 'Show password' }).click(); ok('show password', await pw.getAttribute('type') === 'text');
 await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForTimeout(2500);
 ok('returned to next: ' + p.url(), /CrmLeads390\.dc\.html\?status=contacted&roof=20/i.test(p.url()));
 ok('filters applied from the link', /1 lead · Contacted · roof ≥ 20 yrs/.test((await p.locator('body').innerText()).replace(/\s+/g, ' ')));
 const ss = await p.evaluate(() => localStorage.getItem('countylens.proto.crmSession')); ok('session stored', !!ss);
 await p.goto(U + 'CrmSignIn390.dc.html'); await p.waitForTimeout(1000); await p.reload(); await p.waitForTimeout(1000);
 ok('reload stays signed in', await p.getByText('You’re signed in').count() === 1);
 // leads URL write-back
 await p.goto(U + 'CrmLeads1440.dc.html'); await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(1200);
 await p.getByRole('button', { name: 'Qualified', exact: true }).click(); await p.waitForTimeout(300);
 ok('URL updated: ' + p.url(), /status=qualified/.test(p.url()));
 await p.reload(); await p.waitForTimeout(1200); ok('reload keeps filter', await p.getByRole('button', { name: 'Qualified', exact: true }).getAttribute('aria-pressed') === 'true');
 // rail coming soon
 const soon = p.locator('nav .crm-soon'); ok('5 soon items', await soon.count() === 5);
 ok('Coming-soon pill + tooltip', await soon.first().locator('.atlas-pill--unavailable').count() === 1 && (await soon.first().getAttribute('title')) === 'Plan outreach to groups of leads.');
 const op = await soon.first().evaluate(e => getComputedStyle(e).opacity); ok('not low opacity (' + op + ')', op === '1');
 await soon.nth(2).click(); await p.waitForTimeout(1500); ok('soon row opens its page', /section=jobs/.test(p.url()) && await p.getByText('Jobs is coming soon').count() === 1); await p.goBack(); await p.waitForTimeout(1200);
 // data chip
 await p.getByRole('button', { name: /Show the data source/ }).click(); await p.waitForTimeout(300);
 ok('data panel', await p.getByText(/The lead index is built from the CountyLens manifest/).count() === 1 && await p.getByRole('link', { name: /CountyLens Data/ }).count() === 1);
 await p.getByRole('button', { name: 'Copy the manifest CID' }).click().catch(() => {}); await p.waitForTimeout(200); ok('cid copy', await p.getByText('Manifest CID copied (Sample).').count() === 1);
 // account menu sign out
 await p.getByRole('button', { name: /Account: Sample Rep/ }).click(); await p.waitForTimeout(200);
 await p.getByRole('menuitem', { name: 'Sign out' }).click(); await p.waitForTimeout(1500);
 ok('signed out page: ' + p.url(), /CrmSignIn1440\.dc\.html\?state=signedout/.test(p.url()) && await p.getByText('You signed out.', { exact: false }).count() === 1);
 ok('session cleared', !(await p.evaluate(() => localStorage.getItem('countylens.proto.crmSession'))));
 // wrong 3 times
 await p.goto(U + 'CrmSignIn1440.dc.html'); await p.waitForTimeout(1000);
 for (let i = 0; i < 3; i++) { await p.locator('#si-pw').fill('wrong'); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForTimeout(1200); if (i === 0) ok('wrong message', await p.getByText(/Wrong email or password/).count() >= 1); }
 ok('locked', await p.getByText('Too many attempts. Try again later.').count() === 1);
 // coming soon page + explore CRM
 await p.goto(U + 'CrmComingSoon1440.dc.html?section=jobs'); await p.waitForTimeout(1000); ok('jobs page', await p.getByText('Jobs is coming soon').count() === 1 && await p.getByRole('link', { name: /Back to Map/ }).count() === 1);
 await p.goto(U + 'CrmComingSoon1440.dc.html?section=zzz'); await p.waitForTimeout(800); ok('unknown section', await p.getByText('There’s no section here').count() === 1);
 await p.goto(U + 'CrmMap1440.dc.html'); await p.waitForTimeout(1500);
 ok('explore crm rail soon', await p.locator('nav .crm-soon').count() === 5); ok('explore no help btn', await p.getByRole('button', { name: 'Help' }).count() === 0);
 ok('explore data chip+account', await p.getByRole('button', { name: /Show the data source/ }).count() === 1 && await p.getByRole('button', { name: /Account: Sample Rep/ }).count() === 1);
 await p.goto(U + 'Shell1440.dc.html?mapView=on'); await p.waitForTimeout(1500); ok('Shell1440 on: account menu open', await p.getByRole('menu', { name: 'Account' }).count() === 1);
 await p.setViewportSize({ width: 390, height: 844 }); await p.goto(U + 'CrmMap390.dc.html'); await p.waitForTimeout(1500);
 await p.getByRole('button', { name: 'More', exact: true }).click(); await p.waitForTimeout(300);
 ok('mobile More sheet', await p.getByRole('dialog').locator('a.atlas-list-item .atlas-pill--unavailable').count() === 5 && await p.getByRole('link', { name: /Sign out/ }).count() === 1 && await p.getByRole('group', { name: 'Apps' }).getByRole('link').count() === 3);
 if (errs.length) console.log('ERRS', errs.slice(0, 5)); await b.close(); })();
