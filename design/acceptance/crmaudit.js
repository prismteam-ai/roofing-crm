// Responsive + accessibility audit of every Crm board, light and dark: text contrast, target size, focus ring, pill text, marker labels.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const c = JSON.parse(fs.readFileSync('../prototype/canvas.json'));
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const boards = Object.entries(c.boards).filter(([k]) => k.startsWith('Crm') && (!only || only.includes(k)));
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const out = {};
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ colorScheme: scheme }); await ctx.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
    for (const [f, v] of boards) {
      const p = await ctx.newPage(); await p.setViewportSize({ width: v.w, height: Math.min(v.h, 2000) });
      try { await p.goto((process.env.BASE || 'http://localhost:8765/') + f); } catch (e) { out[f + '|' + scheme] = { crash: String(e).slice(0, 120) }; await p.close(); continue; }
      await p.addStyleTag({ content: '.material-symbols-rounded{color:transparent!important}' });
      await p.waitForTimeout(1100);
      const r = await p.evaluate(() => {
        const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; };
        const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const blend = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat([1]);
        const bgOf = (el) => { const layers = []; let e = el; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); const c = parse(cs.backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } e = e.parentElement; } let bg = [255, 255, 255, 1]; for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg); return bg; };
        const opac = (el) => { let o = 1, e = el; while (e && e.nodeType === 1) { o *= parseFloat(getComputedStyle(e).opacity); e = e.parentElement; } return o; };
        const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
        const fails = [], seen = new Set();
        const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (tw.nextNode()) { const n = tw.currentNode; const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; if (!el || !vis(el)) continue;
          if (el.closest('.material-symbols-rounded,[aria-hidden="true"],[aria-disabled="true"],:disabled,svg,option,select,.cr-proto,.atlas-skeleton')) continue;
          const cs = getComputedStyle(el); let fg = parse(cs.color); if (!fg) continue; const o = opac(el); fg = [fg[0], fg[1], fg[2], fg[3] * o];
          const bg = bgOf(el); const fgb = blend(fg, bg); const L1 = lum(fgb), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700, large = size >= 24 || (bold && size >= 18.66);
          if (ratio < (large ? 3 : 4.5)) { const k = t.slice(0, 40) + '|' + cs.color + '|' + bg.slice(0, 3).join(','); if (!seen.has(k)) { seen.add(k); fails.push({ t: t.slice(0, 50), ratio: +ratio.toFixed(2), fg: cs.color, bg: 'rgb(' + bg.slice(0, 3).map(Math.round).join(',') + ')', cls: (el.className || '').toString().slice(0, 40) }); } } }
        // targets: 48 px, counting the A-1 ::after hit area; inline links in running text are exempt
        const small = [];
        document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], [role=menuitemradio], [tabindex="0"]').forEach((el) => {
          if (!vis(el) || el.closest('[aria-hidden="true"]')) return; if (el.matches('[aria-disabled="true"]') && el.closest('.cr-proto')) return;
          const r = el.getBoundingClientRect(); let w = r.width, h = r.height; const af = getComputedStyle(el, '::after'); if (af.content && af.content !== 'none' && af.position === 'absolute') { w = Math.max(w, parseFloat(af.width) || 0); h = Math.max(h, parseFloat(af.height) || 0); }
          if (el.tagName === 'A' && el.parentElement && /^(P|SPAN|LI|DIV)$/.test(el.parentElement.tagName) && el.parentElement.textContent.trim().length > el.textContent.trim().length + 3 && getComputedStyle(el).display === 'inline') return;
          if (el.type === 'range') h = Math.max(h, 48);
          const lab = el.tagName === 'INPUT' && el.closest('label'); if (lab) { const lr = lab.getBoundingClientRect(); w = Math.max(w, lr.width); h = Math.max(h, lr.height); }
          if (el.getAttribute('role') === 'combobox' && el.closest('[class*="search"], .sb')) { const box = el.parentElement.getBoundingClientRect(); h = Math.max(h, box.height); }
          if (Math.min(w, h) < 47.5) small.push(((el.getAttribute('aria-label') || el.textContent || el.value || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)) + ' ' + Math.round(w) + 'x' + Math.round(h) + ' .' + (el.className || '').toString().split(' ')[0]); });
        const pills = [...document.querySelectorAll('.atlas-pill')].filter((e) => vis(e) && !e.textContent.replace(/[a-z_]+(?=[A-Z])/, '').trim()).length;
        const mk = [...document.querySelectorAll('button.mk')].filter((e) => vis(e) && !(e.getAttribute('aria-label') || '').trim()).length;
        return { fails: fails.slice(0, 12), nFail: fails.length, small: [...new Set(small)].slice(0, 15), nSmall: new Set(small).size, pillsNoText: pills, markersNoLabel: mk };
      });
      out[f + '|' + scheme] = r; await p.close(); process.stderr.write('.');
    }
    await ctx.close();
  }
  fs.writeFileSync('audit.json', JSON.stringify(out, null, 1));
  const sum = {}; for (const [k, v] of Object.entries(out)) { if (v.crash) { sum[k] = 'CRASH'; continue; } if (v.nFail || v.nSmall || v.pillsNoText || v.markersNoLabel) sum[k] = 'contrast ' + v.nFail + ' · small ' + v.nSmall + ' · pills ' + v.pillsNoText + ' · mk ' + v.markersNoLabel; }
  console.log(JSON.stringify(sum, null, 1)); await b.close();
})();
