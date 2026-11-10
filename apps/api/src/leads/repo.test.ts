import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LeadsRepo } from './repo.js';

let repo: LeadsRepo;
beforeEach(() => {
  repo = new LeadsRepo(':memory:');
});
afterEach(() => repo.close());

const base = {
  pin14: '12345678901234',
  address: '1 Main St',
  lat: 41.88,
  lon: -87.63,
  roofAgeYears: 20,
  permitId: null,
  permitStatus: null,
  permitIsOpen: false,
  openDays: null,
  notes: '',
};

describe('LeadsRepo', () => {
  it('creates with status new and lists per workspace', () => {
    const l = repo.create('ws1', base);
    expect(l.status).toBe('new');
    expect(repo.list('ws1')).toHaveLength(1);
    expect(repo.list('ws2')).toHaveLength(0);
  });
  it('is idempotent on pin14 + permit', () => {
    const a = repo.create('ws1', base);
    const b = repo.create('ws1', base);
    expect(b.id).toBe(a.id);
    const c = repo.create('ws1', { ...base, permitId: 'P1', permitIsOpen: true, openDays: 3000 });
    expect(c.id).not.toBe(a.id);
    expect(repo.count('ws1')).toBe(2);
  });
  it('updates status and notes', () => {
    const l = repo.create('ws1', base);
    const u = repo.update('ws1', l.id, { status: 'qualified', notes: 'called' });
    expect(u).toMatchObject({ status: 'qualified', notes: 'called' });
    expect(repo.update('other', l.id, { status: 'lost' })).toBeNull();
  });
  it('rejects invalid status at the DB constraint', () => {
    const l = repo.create('ws1', base);
    expect(() => repo.update('ws1', l.id, { status: 'won' as 'new' })).toThrow();
  });
  it('deletes only within workspace', () => {
    const l = repo.create('ws1', base);
    expect(repo.delete('ws2', l.id)).toBe(false);
    expect(repo.delete('ws1', l.id)).toBe(true);
    expect(repo.list('ws1')).toHaveLength(0);
  });
  it('filters by roof age, permit, open years, status and radius', () => {
    repo.create('ws1', { ...base, pin14: '1', roofAgeYears: 30 });
    repo.create('ws1', {
      ...base,
      pin14: '2',
      roofAgeYears: 5,
      permitId: 'P',
      permitStatus: 'OPEN',
      permitIsOpen: true,
      openDays: 2500,
    });
    const far = repo.create('ws1', {
      ...base,
      pin14: '3',
      lat: 42.05,
      lon: -87.68,
      roofAgeYears: 50,
    });
    repo.update('ws1', far.id, { status: 'lost' });
    expect(
      repo
        .list('ws1', { minRoofAge: 25 })
        .map((l) => l.pin14)
        .sort(),
    ).toEqual(['1', '3']);
    expect(repo.list('ws1', { openPermitsOnly: true }).map((l) => l.pin14)).toEqual(['2']);
    expect(repo.list('ws1', { minOpenYears: 10 })).toHaveLength(0);
    expect(repo.list('ws1', { minOpenYears: 5 }).map((l) => l.pin14)).toEqual(['2']);
    expect(repo.list('ws1', { status: 'lost' }).map((l) => l.pin14)).toEqual(['3']);
    expect(
      repo
        .list('ws1', { center: { lat: 41.88, lon: -87.63, radiusMiles: 2 } })
        .map((l) => l.pin14)
        .sort(),
    ).toEqual(['1', '2']);
  });
});
