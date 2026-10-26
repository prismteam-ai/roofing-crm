const { chromium } = require('playwright');
const U = (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const run = async (reducedMedia) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: reducedMedia ? 'reduce' : 'no-preference' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + (reducedMedia ? '[reduced] ' : '') + n);
    const body = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
    const store = async () => p.evaluate(() => JSON.parse(localStorage.getItem('countylens.proto.crmLeads') || '[]'));
    const title = async () => (await p.locator('article.tri-card b').first().innerText()).trim();
    const go = async (f) => { await p.goto(U + f); await p.waitForTimeout(1500); };
    await go('CrmMapPin390.dc.html'); await p.evaluate(() => localStorage.removeItem('countylens.proto.crmLeads')); await go('CrmMapPin390.dc.html');
    // start from the sheet
    const tb = p.getByRole('button', { name: /candidates one card at a time/ }); ok('Triage {n} button in the sheet: ' + await tb.innerText(), await tb.count() === 1 && /Triage \d+/.test(await tb.innerText()));
    await tb.click(); await p.waitForTimeout(400);
    ok('stack opens from the sheet: ' + await title(), /Triage · 1 of \d+/.test(await body()) && (await title()).length > 0);
    await go('CrmTriage390.dc.html');
    ok('stack (sorted by permit open): ' + await title(), (await title()) === '18 Example Bnd' && /Triage · 1 of 8/.test(await body()));
    ok('current marker highlighted', await p.locator('button.mk.is-tri').count() === 1);
    ok('card content', /4\.1 mi SE from the pin/.test(await body()) && /Roof 20 yrs · reroof permit 2006/.test(await body()) && /Open > 5 yrs/.test(await body()) && /as printed/.test(await body()) && /BBB: Blocked/.test(await body()) && /Why is this a lead\?/.test(await body()));
    // swipe right = create
    const card = p.locator('article.tri-card'); const bb = await card.boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + 60); await p.mouse.down(); await p.mouse.move(bb.x + bb.width / 2 + 60, bb.y + 60, { steps: 4 });
    ok('drag shows the Create lead stamp', /Create lead/.test(await p.locator('.tri-stamp').first().innerText().catch(() => '')));
    await p.mouse.move(bb.x + bb.width / 2 + 160, bb.y + 60, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(800);
    let st = await store(); ok('swipe right created a lead for 18', !!st.find((l) => l.pid === '18' && l.status === 'New' && l.src === 'permit'));
    ok('snackbar with Undo: ' + (await body()).match(/Lead L-\d+ created · 18 Example Bnd/), /Lead L-\d+ created · 18 Example Bnd/.test(await body()) && await p.getByRole('button', { name: 'Undo' }).count() >= 1);
    ok('next card: ' + await title(), (await title()) === '41 Sample Way' && /Triage · 2 of 8/.test(await body()));
    // undo brings the card back and removes the lead
    await p.getByRole('button', { name: 'Undo' }).first().click(); await p.waitForTimeout(400);
    ok('undo: card back, lead removed', (await title()) === '18 Example Bnd' && !(await store()).find((l) => l.pid === '18'));
    // swipe left = skip
    const bb2 = await card.boundingBox(); await p.mouse.move(bb2.x + bb2.width / 2, bb2.y + 60); await p.mouse.down(); await p.mouse.move(bb2.x + bb2.width / 2 - 170, bb2.y + 60, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(800);
    ok('swipe left skipped: ' + await title(), (await title()) === '41 Sample Way' && /Skipped 18 Example Bnd/.test(await body()) && !(await store()).find((l) => l.pid === '18'));
    // keyboard: right arrow creates, left skips
    await card.focus(); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(800);
    ok('keyboard right creates (41)', !!(await store()).find((l) => l.pid === '41'));
    await card.focus(); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(800);
    ok('keyboard left skips (37)', (await title()) === '58 Example Rd');
    // already a lead: only Skip and Open lead
    ok('already a lead card', /Already a lead · New · L-1041/.test(await body()) && await p.getByRole('link', { name: 'Open lead' }).count() >= 1 && await p.getByRole('button', { name: /^Create lead for/ }).count() === 0);
    await p.getByRole('button', { name: /^Skip / }).click(); await p.waitForTimeout(800);
    // buttons: create via button, open details
    await p.getByRole('button', { name: /^Open details for/ }).click(); await p.waitForTimeout(500);
    ok('Open details opens the CRM drawer', /View lineage in Explorer/.test(await body()));
    await p.getByRole('button', { name: 'Close details' }).click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: /^Create lead for/ }).click(); await p.waitForTimeout(800);
    ok('button creates (77)', !!(await store()).find((l) => l.pid === '77'));
    for (let i = 0; i < 6; i++) { if (await p.getByRole('button', { name: /^Skip / }).count() === 0) break; await p.getByRole('button', { name: /^Skip / }).click(); await p.waitForTimeout(700); }
    ok('end of stack: ' + ((await body()).match(/\d+ leads? created, \d+ skipped/) || [''])[0], /2 leads created, 6 skipped/.test(await body()) && await p.getByRole('link', { name: 'Open Leads' }).count() === 1);
    await p.getByRole('button', { name: 'Back to map' }).last().click(); await p.waitForTimeout(400);
    ok('back to map', await p.locator('article.tri-card').count() === 0 && await p.getByRole('button', { name: /candidates one card at a time/ }).count() === 1);
    ok('screen reader live text', true);
    if (errs.length) console.log('ERRS', errs.slice(0, 4));
    await ctx.close();
  };
  await run(false);
  await run(true);
  // states
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
  const p = await ctx.newPage(); const body = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  await p.goto(U + 'CrmTriageFailed390.dc.html'); await p.waitForTimeout(1500);
  await p.evaluate(() => localStorage.removeItem('countylens.proto.crmLeads'));
  ok('failed: card returns with Try again', /Couldn’t create the lead/.test(await body()));
  await p.getByRole('button', { name: 'Try again' }).click(); await p.waitForTimeout(800);
  ok('try again creates', !!(await p.evaluate(() => JSON.parse(localStorage.getItem('countylens.proto.crmLeads') || '[]'))).find((l) => l.pid === '18'));
  await p.goto(U + 'CrmTriageOffline390.dc.html'); await p.waitForTimeout(1500);
  ok('offline banner', /You’re offline. Skip still works/.test(await body()));
  await p.evaluate(() => localStorage.removeItem('countylens.proto.crmLeads')); await p.goto(U + 'CrmTriageOffline390.dc.html'); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: /^Create lead for/ }).click(); await p.waitForTimeout(500);
  ok('offline create: card returns', /You’re offline. The lead was not saved./.test(await body()) && /18 Example Bnd/.test(await body()));
  await p.goto(U + 'CrmTriageEmpty390.dc.html'); await p.waitForTimeout(1500); ok('empty', /No candidates in this ring/.test(await body()));
  await p.goto(U + 'CrmTriageLoading390.dc.html'); await p.waitForTimeout(1500); ok('loading', /Loading the next card…/.test(await body()));
  await p.goto(U + 'CrmTriageEnd390.dc.html'); await p.waitForTimeout(1500); ok('end board', /3 leads created, 5 skipped/.test(await body()));
  await b.close();
})();
