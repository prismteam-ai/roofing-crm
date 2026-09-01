import { describe, expect, it } from 'vitest';
import { addNote, advanceStage, newLeadId, type CrmLead } from '../src/crm.js';

function makeLead(overrides: Partial<CrmLead> = {}): CrmLead {
  const now = new Date('2026-01-01T00:00:00.000Z').toISOString();
  return {
    id: newLeadId(),
    parcelId: 'P-1',
    tier: 'A',
    source: 'permit',
    address: '1 Test St',
    city: 'Merritt Island',
    lat: 28.3,
    lon: -80.7,
    roofAgeYears: null,
    roofAgeBasis: 'UNKNOWN',
    justValue: null,
    permitId: 'PM-1',
    permitNumber: 'PM-1',
    permitOpenDays: 900,
    score: 80,
    stage: 'New',
    owner: 'Alex',
    notes: [],
    activity: [],
    isDemo: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('newLeadId', () => {
  it('produces unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newLeadId()));
    expect(ids.size).toBe(100);
  });
});

describe('advanceStage', () => {
  it('moves the lead to the new stage and records activity', () => {
    const lead = makeLead();
    const now = new Date('2026-01-02T00:00:00.000Z');
    const next = advanceStage(lead, 'Contacted', 'Alex', now);
    expect(next.stage).toBe('Contacted');
    expect(next.updatedAt).toBe(now.toISOString());
    expect(next.activity).toHaveLength(1);
    expect(next.activity[0]?.summary).toBe('Moved from New to Contacted');
    expect(next.activity[0]?.actor).toBe('Alex');
  });

  it('is a no-op (same reference-equal object) when the stage does not change', () => {
    const lead = makeLead({ stage: 'Qualified' });
    const next = advanceStage(lead, 'Qualified', 'Alex');
    expect(next).toBe(lead);
    expect(next.activity).toHaveLength(0);
  });

  it('never mutates the input lead', () => {
    const lead = makeLead();
    const originalStage = lead.stage;
    advanceStage(lead, 'Won', 'Alex');
    expect(lead.stage).toBe(originalStage);
    expect(lead.activity).toHaveLength(0);
  });
});

describe('addNote', () => {
  it('appends a note and a matching activity entry', () => {
    const lead = makeLead();
    const now = new Date('2026-01-03T00:00:00.000Z');
    const next = addNote(lead, 'Called, left voicemail', 'Alex', now);
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.text).toBe('Called, left voicemail');
    expect(next.activity).toHaveLength(1);
    expect(next.activity[0]?.summary).toBe('Added a note');
  });

  it('trims whitespace and drops an empty note without changing the lead', () => {
    const lead = makeLead();
    expect(addNote(lead, '   ', 'Alex')).toBe(lead);
    const next = addNote(lead, '  hello  ', 'Alex');
    expect(next.notes[0]?.text).toBe('hello');
  });
});
