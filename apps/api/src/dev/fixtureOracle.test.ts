import { searchInputSchema } from '@roofing-crm/shared';
import { describe, expect, it } from 'vitest';
import { FixtureOracle } from './fixtureOracle.js';

const now = new Date('2026-11-25T18:00:00Z');
const downtown = { lat: 32.7157, lon: -117.1611 };

describe('FixtureOracle (dev only)', () => {
  it('is deterministic for a given date', async () => {
    const input = searchInputSchema.parse({ center: downtown, radiusMiles: 2 });
    const a = await new FixtureOracle(now).searchLeads(input);
    const b = await new FixtureOracle(now).searchLeads(input);
    expect(a).toEqual(b);
    expect(a.total).toBeGreaterThan(10);
  });

  it('keeps every row inside the radius and honours the signal filter', async () => {
    const oracle = new FixtureOracle(now);
    const input = searchInputSchema.parse({
      center: downtown,
      radiusMiles: 3,
      signal: 'both',
      minOpenYears: 2,
    });
    const found = await oracle.searchLeads(input);
    expect(found.rows.length).toBeGreaterThan(0);
    for (const row of found.rows) {
      expect(row.distanceMiles).toBeLessThanOrEqual(3);
      expect(row.roofAgeYears).toBeGreaterThanOrEqual(15);
      expect(row.openRoofPermits).toBeGreaterThan(0);
      expect(row.longestOpenDays).toBeGreaterThanOrEqual(730);
    }
  });

  it('returns nothing for a pin outside the county and labels itself as a fixture', async () => {
    const oracle = new FixtureOracle(now);
    const far = await oracle.searchLeads(
      searchInputSchema.parse({ center: { lat: 40.7, lon: -74 }, radiusMiles: 5 }),
    );
    expect(far.total).toBe(0);
    expect((await oracle.datasetSummary()).county).toContain('DEV FIXTURE');
  });

  it('serves the detail record for a search hit, with provenance on every permit', async () => {
    const oracle = new FixtureOracle(now);
    const found = await oracle.searchLeads(
      searchInputSchema.parse({ center: downtown, radiusMiles: 3, signal: 'open_permit' }),
    );
    const first = found.rows[0];
    expect(first).toBeDefined();
    const detail = await oracle.getProperty(first?.apn ?? '');
    expect(detail?.permits.some((p) => p.isRoofing && p.isOpen)).toBe(true);
    for (const permit of detail?.permits ?? []) {
      expect(permit.provenance.sourceUrl).toContain('dev-fixture');
    }
  });
});
