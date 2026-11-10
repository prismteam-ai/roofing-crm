import type { Property } from '@roofing/shared';
import type { CorpusDoc } from './types.js';

/** Build retrievable summaries for a property and each of its roofing permits. */
export function propertyToDocs(p: Property): CorpusDoc[] {
  const open = p.permits.filter((x) => x.is_roofing && x.status_is_open);
  const longest = Math.max(0, ...open.map((x) => x.open_days ?? 0));
  const roof =
    p.roof_age_years === null
      ? 'roof age unknown'
      : `roof age ${p.roof_age_years} years (${p.roof_age_basis}, ${p.roof_age_confidence} confidence)`;
  const docs: CorpusDoc[] = [
    {
      id: `property:${p.pin14}`,
      kind: 'property',
      text: `Property PIN ${p.pin14} at ${p.address ?? 'unknown address'}, ${p.city ?? ''} ${p.zip ?? ''}. Built ${p.year_built ?? 'unknown'}. ${roof}. Owner ${p.owner_name ?? 'unknown'}${p.is_out_of_area ? ' (out-of-area mailing address)' : ''}. Last sale ${p.last_sale_date ?? 'unknown'}. ${open.length} open roofing permit(s).`,
      metadata: {
        pin14: p.pin14,
        permitId: null,
        sourceUrl: p.source_url,
        lat: p.lat,
        lon: p.lon,
        roofAgeYears: p.roof_age_years,
        openRoofingPermit: open.length > 0,
        openDays: open.length ? longest : null,
        contractorName: null,
        bbbRating: null,
      },
    },
  ];
  for (const x of p.permits.filter((x) => x.is_roofing)) {
    docs.push({
      id: `permit:${x.permit_id}`,
      kind: 'permit',
      text: `Roofing permit ${x.permit_id} for PIN ${p.pin14} at ${p.address ?? 'unknown address'}: "${x.work_description ?? ''}". Status ${x.status ?? 'unknown'} (${x.status_is_open ? 'open' : 'closed'}), issued ${x.issued_at ?? 'unknown'}, open ${x.open_days ?? 'unknown'} days. Contractor ${x.contractor_name ?? 'unknown'}${x.contractor?.license_number ? `, license ${x.contractor.license_number}` : ''}${x.contractor?.bbb_rating ? `, BBB rating ${x.contractor.bbb_rating}` : ', BBB rating not available'}.`,
      metadata: {
        pin14: p.pin14,
        permitId: x.permit_id,
        sourceUrl: x.source_url,
        lat: p.lat,
        lon: p.lon,
        roofAgeYears: p.roof_age_years,
        openRoofingPermit: x.status_is_open,
        openDays: x.status_is_open ? x.open_days : null,
        contractorName: x.contractor_name,
        bbbRating: x.contractor?.bbb_rating ?? null,
      },
    });
  }
  return docs;
}
