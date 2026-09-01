#!/usr/bin/env node
/**
 * Real-browser proof that apps/web's DuckDB-WASM wiring works: serves the
 * production build together with the synthetic test fixture as a
 * local-mirror dataset, drives a real Chromium via Playwright, drops a pin
 * at the app's own default map centre, and prints the resulting candidates
 * as JSON ({ count, parcelIds }) for an external process to cross-check
 * against an independent DuckDB query over the same fixture.
 *
 * This never touches apps/web/public/data -- the shipped site's
 * local-mirror stays empty until a real pipeline snapshot is mirrored in.
 * Run inside the mcr.microsoft.com/playwright image (see Makefile
 * `verify-browser` target), which bundles a matching Chromium.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, cp, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'apps/web/dist');
const FIXTURE = path.join(ROOT, 'test-fixtures/properties.parquet');
const DATASET_VERSION = 'test-fixture-1';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.parquet': 'application/octet-stream',
};

/** Minimal static server with Range support -- DuckDB-WASM range-reads Parquet. */
function startStaticServer(root) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
        if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
        const st = await stat(filePath);
        const type = CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream';
        const range = req.headers.range;
        if (range) {
          const m = /bytes=(\d+)-(\d*)/.exec(range);
          const startByte = Number(m[1]);
          const endByte = m[2] ? Number(m[2]) : st.size - 1;
          res.writeHead(206, {
            'content-type': type,
            'content-range': `bytes ${startByte}-${endByte}/${st.size}`,
            'accept-ranges': 'bytes',
            'content-length': endByte - startByte + 1,
          });
          createReadStream(filePath, { start: startByte, end: endByte }).pipe(res);
        } else {
          res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': st.size });
          createReadStream(filePath).pipe(res);
        }
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function buildTestMirror(serveDir) {
  await cp(DIST, serveDir, { recursive: true });
  const fixtureManifest = JSON.parse(
    await readFile(path.join(ROOT, 'test-fixtures/manifest.json'), 'utf8'),
  );
  const dataDir = path.join(serveDir, 'data', 'v', DATASET_VERSION, 'properties');
  await mkdir(dataDir, { recursive: true });
  await cp(FIXTURE, path.join(dataDir, 'part-0.parquet'));
  const manifest = {
    dataset_version: DATASET_VERSION,
    run_id: 'fixture-run',
    county: 'Brevard County, FL (SYNTHETIC TEST FIXTURE -- verify_browser_duckdb.mjs only)',
    county_fips: '12009',
    fdor_co_no: 15,
    generated_at: new Date().toISOString(),
    base_url: '/data',
    ipfs: {},
    tables: {
      properties: {
        path: `v/${DATASET_VERSION}/properties`,
        files: ['part-0.parquet'],
        row_count: fixtureManifest.rows,
        schema_version: '1.1',
      },
    },
    coverage: {
      roof_age_basis: fixtureManifest.roof_age_basis,
      owner_tenure_basis: {},
      act_yr_blt_decade: {},
      geocode_source: {},
    },
  };
  await writeFile(path.join(serveDir, 'data', 'latest.json'), JSON.stringify(manifest, null, 2));
}

async function main() {
  const serveDir = await mkdtemp(path.join(os.tmpdir(), 'roofing-crm-verify-'));
  try {
    await buildTestMirror(serveDir);
    const server = await startStaticServer(serveDir);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const browser = await chromium.launch();
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

    // The basemap is real external tiles (OpenStreetMap). Not what this script
    // verifies, and real network chatter it generates can keep the page from
    // ever going idle -- so serve a stub tile instead of hitting the network
    // (aborting outright makes MapLibre retry noisily and pollutes pageerror
    // capture).
    const BLANK_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    await page.route('https://*.tile.openstreetmap.org/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG }));

    console.error(`[verify] navigating to ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    console.error('[verify] dom loaded, waiting for dataset resolution...');
    // Confirm the local-mirror fallback actually resolved, not the loading/error state.
    await page.getByText('Bundled mirror').waitFor({ timeout: 30000 });
    console.error('[verify] dataset ready, dropping pin at map centre...');

    // The map boots centred exactly on BREVARD.center (see apps/web/src/config.ts),
    // so clicking dead-centre drops a pin there without faking geolocation.
    const box = await page.locator('.map').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    console.error('[verify] pin dropped, waiting for query to resolve...');
    await page.locator('.candidate-list').or(page.getByText('No properties matched'))
      .first().waitFor({ timeout: 30000 });
    console.error('[verify] query resolved, reading results...');

    const parcelIds = await page.locator('[data-parcel-id]').evaluateAll(
      (els) => els.map((el) => el.getAttribute('data-parcel-id')),
    );

    await browser.close();
    server.close();

    if (pageErrors.length > 0) {
      process.stderr.write(`Browser console errors:\n${pageErrors.join('\n')}\n`);
      process.exitCode = 1;
      return;
    }

    process.stdout.write(JSON.stringify({ count: parcelIds.length, parcelIds }));
  } finally {
    await rm(serveDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
