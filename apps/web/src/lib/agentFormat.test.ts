import { describe, expect, it } from 'vitest';
import { columnLabel, parseAnswer, resultColumns } from './agentFormat.js';

describe('parseAnswer', () => {
  it('splits prose, bullet rows and labelled notes', () => {
    const blocks = parseAnswer(
      '22 properties match.\n- 200 B ST, APN 1\n- 300 C ST, APN 2\n\nAssumptions: radius 5 mi.\nMissing data: BBB rating.',
    );
    expect(blocks).toEqual([
      { kind: 'text', text: '22 properties match.' },
      { kind: 'list', items: ['200 B ST, APN 1', '300 C ST, APN 2'] },
      { kind: 'note', label: 'Assumptions', text: 'radius 5 mi.' },
      { kind: 'note', label: 'Missing data', text: 'BBB rating.' },
    ]);
  });
});

describe('resultColumns', () => {
  const rows = [
    {
      apn: '5330000200',
      address: '200 B ST',
      unit: '4',
      city: 'SAN DIEGO',
      lat: 32.7,
      lon: -117.1,
      distanceMiles: 3.165,
      roofYear: 1991,
      roofAgeYears: 35,
      roofBasis: 'year_built',
      longestOpenDays: 3100,
      topOpenContractor: null,
      ownerOccupied: true,
      lastTransferDate: null,
      years_open: 6.234,
    },
  ];

  it('orders known fields, hides coordinates and empty columns, labels the rest', () => {
    const columns = resultColumns(rows);
    expect(columns.map((c) => c.label)).toEqual([
      'Address',
      'APN',
      'City',
      'Distance',
      'Roof year',
      'Roof age',
      'Roof age based on',
      'Longest open',
      'Owner-occupied',
      'Years open',
    ]);
  });

  it('formats values for reading', () => {
    const row = rows[0] ?? {};
    const text = Object.fromEntries(resultColumns(rows).map((c) => [c.key, c.text(row)]));
    expect(text).toMatchObject({
      address: '200 B ST #4',
      distanceMiles: '3.17 mi',
      roofAgeYears: '35 yrs',
      roofBasis: 'Year built',
      longestOpenDays: '8.5 yrs',
      ownerOccupied: 'Yes',
      years_open: '6.23',
    });
  });

  it('turns snake and camel case into words', () => {
    expect(columnLabel('years_open')).toBe('Years open');
    expect(columnLabel('permitCount')).toBe('Permit count');
    expect(columnLabel('apn')).toBe('APN');
  });
});
