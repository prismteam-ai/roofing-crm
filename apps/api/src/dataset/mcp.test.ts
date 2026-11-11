import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_DIR } from './fixture.js';
import { mcpTools } from './client.js';

describe('MCP tool contract', () => {
  it('declares the four pipeline tools', () => {
    expect(Object.keys(mcpTools).sort()).toEqual([
      'findProperties',
      'getDatasetInfo',
      'getProperty',
      'queryDataset',
    ]);
  });
  it('validates findProperties input and output', () => {
    expect(mcpTools.findProperties.input.parse({ lat: 1, lon: 2, radiusMiles: 3 })).toEqual({
      lat: 1,
      lon: 2,
      radiusMiles: 3,
    });
    expect(() => mcpTools.findProperties.output.parse({ properties: [{}], source: {} })).toThrow();
    expect(
      mcpTools.findProperties.output.parse({
        properties: [],
        source: { runId: 'r', rootCid: null, syncedAt: null },
      }).properties,
    ).toEqual([]);
  });
  it('requires 14-digit pin and bounded sql limit', () => {
    expect(() => mcpTools.getProperty.input.parse({ pin14: '123' })).toThrow();
    expect(() => mcpTools.queryDataset.input.parse({ sql: 'select 1', limit: 5000 })).toThrow();
    expect(mcpTools.queryDataset.input.parse({ sql: 'select 1' }).limit).toBe(100);
  });
});

describe('real pipeline rows', () => {
  // captured from a live findProperties call against the Cook County pipeline MCP (2026-11-11)
  const raw = JSON.parse(readFileSync(join(FIXTURE_DIR, 'live-sample.json'), 'utf8')) as {
    properties: Record<string, unknown>[];
  };
  it('parses captured rows: null is_out_of_area, new_construction_permit, extra columns stripped', () => {
    const out = mcpTools.findProperties.output.parse(raw);
    expect(out.properties.length).toBe(raw.properties.length);
    expect(out.total_in_radius).toBeGreaterThan(out.properties.length);
    expect(out.properties.some((p) => p.is_out_of_area === null)).toBe(true);
    expect(out.properties.some((p) => p.roof_age_basis === 'new_construction_permit')).toBe(true);
    expect(out.properties.some((p) => p.permits.some((x) => x.contractor?.bbb_state))).toBe(true);
    expect(raw.properties[0]).toHaveProperty('pin10');
    expect(out.properties[0]).not.toHaveProperty('pin10');
  });
  it('tolerates record-shaped queryDataset rows', () => {
    expect(
      mcpTools.queryDataset.output.parse({
        columns: ['a'],
        rows: [{ a: 1 }, [2]],
        truncated: false,
      }).rows,
    ).toHaveLength(2);
  });
});
