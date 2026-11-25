import type { Lead } from '@roofing-crm/shared';

/** Quotes a cell and defuses spreadsheet formulas (a leading =, +, - or @ in user text). */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const COLUMNS: readonly (readonly [string, (lead: Lead) => string | number | null])[] = [
  ['lead_id', (l) => l.leadId],
  ['status', (l) => l.status],
  ['priority', (l) => l.priority],
  ['assignee', (l) => l.assignee],
  ['address', (l) => l.address],
  ['city', (l) => l.city],
  ['apn', (l) => l.apn],
  ['permit_id', (l) => l.permitId],
  ['lat', (l) => l.lat],
  ['lon', (l) => l.lon],
  ['roof_age_years', (l) => l.signal.roofAgeYears],
  ['roof_basis', (l) => l.signal.roofBasis],
  ['open_roof_permits', (l) => l.signal.openRoofPermits],
  ['longest_open_days', (l) => l.signal.longestOpenDays],
  ['score', (l) => l.signal.score],
  ['notes', (l) => l.notes],
  ['created_at', (l) => l.createdAt],
  ['updated_at', (l) => l.updatedAt],
];

export function leadsToCsv(leads: readonly Lead[]): string {
  const header = COLUMNS.map(([name]) => name).join(',');
  const rows = leads.map((lead) => COLUMNS.map(([, read]) => csvCell(read(lead))).join(','));
  return [header, ...rows].join('\r\n') + '\r\n';
}

/** Starts a browser download of `text` as a file. */
export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
