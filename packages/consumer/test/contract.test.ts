import { describe, expect, it } from 'vitest';
import { latestManifest } from '../src/contract.js';

/** Shaped like the pipeline's real published manifest, structurally -- not a live snapshot. */
function validManifest() {
  return {
    dataset_version: '2026-09-01.r202609011309',
    run_id: 'r202609011309',
    county: 'BREVARD',
    county_fips: '12009',
    fdor_co_no: 15,
    generated_at: '2026-09-01T13:09:00Z',
    base_url: 'https://example.github.io/pipeline/data',
    ipfs: { root_cid: 'bafkreic...', ipns: 'k51q...' },
    tables: {
      properties: {
        path: 'v/2026-09-01.r202609011309/properties/',
        files: ['part-dhyq.parquet', 'part-dhyr.parquet'],
        row_count: 347497,
        schema_version: '1.1.0',
      },
      permits: {
        path: 'v/2026-09-01.r202609011309/permits/',
        files: ['permits.parquet'],
        row_count: 434643,
        schema_version: '1.1.0',
      },
    },
    coverage: {
      roof_age_basis: { PERMIT: 43240, ACT_YR_BLT: 260472, UNKNOWN: 73845 },
      owner_tenure_basis: { UNKNOWN_NO_SALE_IN_ROLL: 55000, FDOR_ROLL_SALE: 1000 },
      act_yr_blt_decade: { '1960': 19699 },
      geocode_source: {},
    },
  };
}

describe('latestManifest', () => {
  it('parses a real-shaped manifest, matched against the live pipeline schema', () => {
    const result = latestManifest.safeParse(validManifest());
    expect(result.success).toBe(true);
  });

  it('accepts a manifest with no coverage block at all -- coverage is enrichment, not a hard requirement', () => {
    const { coverage: _coverage, ...withoutCoverage } = validManifest();
    const result = latestManifest.safeParse(withoutCoverage);
    expect(result.success).toBe(true);
  });

  it('accepts a manifest with no ipfs block -- defaults to {}', () => {
    const { ipfs: _ipfs, ...withoutIpfs } = validManifest();
    const result = latestManifest.safeParse(withoutIpfs);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ipfs).toEqual({});
  });

  it('rejects a manifest missing a required table field (row_count)', () => {
    const manifest = validManifest();
    // @ts-expect-error -- deliberately malformed for the test
    delete manifest.tables.properties.row_count;
    const result = latestManifest.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('rejects fdor_co_no as a string instead of a number', () => {
    const manifest = { ...validManifest(), fdor_co_no: '15' };
    const result = latestManifest.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('rejects a completely malformed payload without throwing', () => {
    const result = latestManifest.safeParse({ not: 'a manifest' });
    expect(result.success).toBe(false);
  });
});
