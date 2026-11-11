import { describe, expect, it } from 'vitest';
import {
  searchInputSchema,
  leadCreateSchema,
  leadUpdateSchema,
  agentAskSchema,
} from './schemas.js';

describe('searchInputSchema', () => {
  it('applies defaults', () => {
    const v = searchInputSchema.parse({ lat: 41.8, lon: -87.7 });
    expect(v).toMatchObject({ radiusMiles: 2, openPermitsOnly: false, limit: 200 });
  });
  it('rejects out-of-range coordinates and radius', () => {
    expect(() => searchInputSchema.parse({ lat: 95, lon: 0 })).toThrow();
    expect(() => searchInputSchema.parse({ lat: 0, lon: 0, radiusMiles: 0 })).toThrow();
  });
});

describe('lead schemas', () => {
  it('fills lead create defaults', () => {
    const v = leadCreateSchema.parse({ pin14: '1', address: 'a', lat: 1, lon: 2 });
    expect(v.notes).toBe('');
    expect(v.permitIsOpen).toBe(false);
  });
  it('rejects unknown status', () => {
    expect(() => leadUpdateSchema.parse({ id: 'x', status: 'won' })).toThrow();
  });
});

describe('agentAskSchema', () => {
  it('rejects empty question', () => {
    expect(() => agentAskSchema.parse({ question: '' })).toThrow();
    expect(agentAskSchema.parse({ question: 'hi' }).context).toBeUndefined();
  });
});
