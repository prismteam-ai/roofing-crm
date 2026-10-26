// CRM home map flows (not Task A)
const { chromium } = require('playwright');
const U = (process.env.BASE || 'http://localhost:8765/');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
  const hdr = async () => (await p.locator('span[aria-live="polite"][title]').first().getAttribute('title')) || '';
  const chip = async () => (await p.locator('.atlas-map-chip[aria-live="polite"]').first().innerText()).replace(/\s+/g, ' ');

  // 1. whole county
  await p.goto(U + 'CrmMap1440.dc.html'); await p.waitForTimeout(1500);
  ok('county header: ' + await hdr(), /across Travis County/.test(await hdr()));
  ok('county chip: ' + await chip(), /whole county/.test(await chip()));
  ok('hexagons on when zoomed out', await p.locator('g.hexes').evaluate((g) => getComputedStyle(g).display !== 'none'));
  ok('permit clusters', await p.locator('.clu').count() >= 3);
  ok('county card', await p.getByRole('group', { name: 'Search a radius' }).count() === 1);
  await p.locator('.crm-gap-i:visible').first().click(); await p.waitForTimeout(200); ok('coverage note behind the info icon in results', await p.getByText('Part of this area has no permit data.').count() >= 1 && await p.getByRole('link', { name: 'CountyLens Coverage' }).count() >= 1); await p.locator('.crm-gap-i:visible').first().click(); await p.waitForTimeout(150);
  // sort: Nearest disabled in county
  await p.getByRole('button', { name: /Sort/ }).first().click(); await p.waitForTimeout(150);
  ok('sort labels', await p.getByRole('menuitemradio', { name: 'Roof age (oldest)' }).count() === 1 && await p.getByRole('menuitemradio', { name: 'Permit open (longest)' }).count() === 1);
  await p.getByRole('menuitemradio', { name: /Nearest/ }).click(); await p.waitForTimeout(200);
  ok('nearest needs a centre', await p.getByText(/Nearest needs a centre/).count() === 1);
  // 2. pick an area: ring, zoom in, markers
  await p.getByRole('button', { name: /^Area: / }).first().click(); await p.waitForTimeout(150);
  await p.getByRole('menuitemradio', { name: /Pflugerville city hall/ }).first().click().catch(async () => { await p.getByText('Pflugerville city hall').first().click(); });
  await p.waitForTimeout(400);
  ok('area picked: ' + await hdr(), /within 5 mi of Pflugerville/.test(await hdr()));
  ok('markers when zoomed in', await p.locator('button.mk').count() > 5 && await p.locator('.clu').count() === 0);
  // 3. roof 15 -> 25 changes the count
  const c15 = await chip(); await p.getByRole('button', { name: '25 years' }).click(); await p.waitForTimeout(400);
  const c25 = await chip(); ok('roof 15→25 count ' + c15 + ' → ' + c25, c15 !== c25);
  await p.getByRole('textbox', { name: /any number of years/ }).or(p.getByRole('spinbutton', { name: /any number of years/ })).fill('18'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  ok('roof any number (18): ' + await hdr(), /roof ≥ 18 yrs/.test(await hdr()));
  // 4. permit filter -> default sort Permit open
  await p.getByRole('button', { name: 'Open', exact: true }).click(); await p.waitForTimeout(300);
  ok('permit filter sets sort', /Permit open \(longest\)/.test(await p.locator('body').innerText()));
  await p.getByRole('button', { name: /Permit open at least/ }).click(); await p.waitForTimeout(150);
  ok('open menu options', await p.getByRole('menuitemradio', { name: '10 yrs' }).count() === 1); await p.getByRole('menuitemradio', { name: '5 yrs' }).click(); await p.waitForTimeout(300);
  ok('header open ≥ 5: ' + await hdr(), /open ≥ 5 yrs/.test(await hdr()));
  // 5. radius 0.5–25
  const rv = p.locator('#radius-val'); await rv.fill('25'); await rv.press('Enter'); await p.waitForTimeout(300);
  ok('radius 25: ' + await chip(), /in 25 mi/.test(await chip()));
  await rv.fill('40'); await rv.press('Enter'); await p.waitForTimeout(300); ok('radius clamps at 25', /in 25 mi/.test(await chip()));
  ok('slider max 25', (await p.locator('#radius').getAttribute('max')) === '25' && (await p.locator('.rhandle').getAttribute('aria-valuemax')) === '25');
  // 6. layers
  await p.getByRole('button', { name: 'Layers' }).click(); await p.waitForTimeout(150);
  ok('4 layer switches', await p.getByRole('switch').count() === 4);
  const before = await p.locator('button.mk').count();
  await p.getByRole('switch', { name: /Aged roofs/ }).click(); await p.waitForTimeout(250);
  const after = await p.locator('button.mk').count(); ok('aged roofs off hides roof-only markers ' + before + '→' + after, after < before);
  await p.getByRole('switch', { name: /Aged roofs/ }).click(); await p.getByRole('switch', { name: /Permit coverage gaps/ }).click(); await p.waitForTimeout(200);
  ok('gaps layer off', await p.locator('svg path[style*="gap-hatch"]').evaluate((e) => getComputedStyle(e.parentNode).display === 'none'));
  await p.getByRole('switch', { name: /Permit coverage gaps/ }).click(); await p.getByRole('button', { name: 'Layers' }).click();
  ok('lead markers with status', await p.locator('button.mk.is-lead[class*="ls-"]').count() >= 1);
  ok('Open > 5 yrs badge (marker and card)', await p.locator('button.mk.o5').count() >= 1 && await p.getByText('Open > 5 yrs').count() >= 1);
  // 7. GPS: explain -> continue -> located
  await rv.fill('5'); await rv.press('Enter');
  await p.getByRole('button', { name: 'Use my location (GPS)' }).click(); await p.waitForTimeout(200);
  ok('explain first', await p.getByText('Allow location to center the search on where you are.', { exact: false }).count() === 1);
  await p.getByRole('button', { name: 'Continue' }).click(); await p.waitForTimeout(300);
  ok('locating', await p.getByText('Finding your location…').count() === 1);
  await p.waitForTimeout(1300); ok('located', await p.getByText(/You are here \(±12 m\)/).count() === 1 && await p.locator('.gpsacc').count() === 1);
  // 8. desktop pin: click map, drag, keys, outside
  await p.getByRole('button', { name: /^Drop pin: click the map/ }).click(); await p.waitForTimeout(150);
  const m = await p.locator('.crm-mapin').boundingBox(); await p.mouse.click(m.x + m.width * 0.62, m.y + m.height * 0.55); await p.waitForTimeout(400);
  const pinA = await p.locator('.crmpin').getAttribute('aria-label'); ok('pin dropped: ' + pinA, /near (Pflugerville|Manor|Wells Branch|Austin)/.test(pinA));
  ok('pin label on map', await p.locator('.atlas-map-chip[role="status"]', { hasText: /· near / }).count() >= 1);
  const pb = await p.locator('.crmpin').boundingBox(); await p.mouse.move(pb.x + 18, pb.y + 30); await p.mouse.down(); await p.mouse.move(pb.x + 58, pb.y + 50, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(300);
  const pinB = await p.locator('.crmpin').getAttribute('aria-label'); ok('pin dragged', pinB !== pinA);
  await p.locator('.crmpin').focus(); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(200); ok('pin arrow key', (await p.locator('.crmpin').getAttribute('aria-label')) !== pinB);
  await p.getByRole('button', { name: /^Drop pin: click the map/ }).click(); await p.waitForTimeout(150);
  await p.mouse.click(m.x + m.width * 0.3, m.y + m.height * 0.12); await p.waitForTimeout(300);
  ok('pin outside county', await p.getByText('This pin is outside Travis County. The CRM covers Travis County only.').count() === 1);
  await p.getByRole('button', { name: 'Go to Travis County' }).click(); await p.waitForTimeout(300);
  ok('go to Travis County', /across Travis County/.test(await hdr()));
  // 9. mobile: Locate chip, crosshair, place pin here, long-press
  await p.setViewportSize({ width: 390, height: 844 }); await p.goto(U + 'CrmMap390.dc.html'); await p.waitForTimeout(1500);
  ok('390 Locate chip', await p.getByRole('button', { name: 'Use my location', exact: true }).count() >= 1);
  await p.getByRole('button', { name: /^Drop pin: move the map/ }).click(); await p.waitForTimeout(200);
  ok('crosshair', await p.locator('svg.xhair').count() === 1);
  await p.getByRole('button', { name: 'Place pin here' }).click(); await p.waitForTimeout(400);
  ok('place pin here', /Pin at 30\.\d+, −97\.\d+ · near /.test(await p.locator('body').innerText()) && await p.locator('.crmpin').count() === 1);
  await p.goto(U + 'CrmMap390.dc.html'); await p.waitForTimeout(1500);
  const mm = await p.locator('.atlas-map').boundingBox(); const pt = await p.evaluate(([x0, y0]) => { for (let dy = 300; dy < 420; dy += 12) for (let dx = 60; dx < 330; dx += 12) { const e = document.elementFromPoint(x0 + dx, y0 + dy); if (e && !e.closest('button,a,[role=button]') && e.closest('.atlas-map')) return [x0 + dx, y0 + dy]; } return [x0 + 200, y0 + 300]; }, [mm.x, mm.y]); console.log('long-press at', pt); await p.mouse.move(pt[0], pt[1]); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up(); await p.waitForTimeout(300);
  ok('long-press drops a pin', await p.locator('.crmpin').count() === 1);
  // 10. states
  for (const [f, re] of [['CrmMapTiles390', /Loading map tiles/], ['CrmMapFailed390', /Map unavailable, results below/], ['CrmMapNoResults390', /No roofs match within 0.5 mi/], ['CrmMapPartial390', /No permit data in part of this ring/], ['CrmMapIndexDown390', /Lead index unavailable/], ['CrmMapGpsLow390', /Location is approximate/], ['CrmMapGpsUnavailable390', /request timed out/], ['CrmMapGpsDenied390', /Location is off. Drop a pin or search a place instead./], ['CrmMapGpsOutside390', /You are outside Travis County. The CRM covers Travis County only./]]) {
    await p.goto(U + f + '.dc.html'); await p.waitForTimeout(1300); ok(f, re.test(await p.locator('body').innerText()));
  }
  await p.goto(U + 'CrmMapNoResults390.dc.html'); await p.waitForTimeout(1300); await p.getByRole('button', { name: 'Widen to 1 mi' }).click(); await p.waitForTimeout(300);
  ok('widen suggestion works', /in 1 mi/.test(await chip()));
  await p.goto(U + 'CrmMapGpsDenied390.dc.html'); await p.waitForTimeout(1300); await p.getByRole('button', { name: 'Drop pin', exact: true }).click(); await p.waitForTimeout(200);
  ok('denied → drop pin (crosshair)', await p.locator('svg.xhair').count() === 1);
  if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await b.close();
})();
