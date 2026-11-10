import { describe, expect, it } from 'vitest';
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
