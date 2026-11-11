import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Property } from '@roofing/shared';
import { PropertyDrawer } from './PropertyDrawer.js';

describe('permit status evidence', () => {
  it.each([
    [null, null, false, 'status unknown'],
    ['UNKNOWN', null, false, 'status unknown'],
    ['ISSUED', null, false, 'status unknown'],
    ['COMPLETE', null, false, 'closed'],
    [' closed ', null, false, 'closed'],
    [null, '2026-01-01', false, 'closed'],
    ['ISSUED', null, true, 'open'],
  ])('renders %s / %s / open=%s as %s', (status, closed_at, status_is_open, expected) => {
    const property = {
      permits: [
        { permit_id: 'p1', is_roofing: true, status, closed_at, status_is_open, open_days: 100 },
      ],
      roof_age_years: null,
      last_sale_price: null,
    } as Property;
    const html = renderToStaticMarkup(
      createElement(PropertyDrawer, { property, onClose: () => {}, onAddLead: () => {} }),
    );
    const badge = html.match(/data-testid="permit-status">([^<]*)</)?.[1];
    expect(badge).toContain(expected);
    if (expected === 'status unknown') expect(badge).not.toContain('closed');
  });
});
