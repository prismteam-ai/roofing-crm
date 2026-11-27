import { formatDate, formatMiles, formatOpenDuration, tidyContractor } from './format.js';

/** One block of the agent's plain-text answer, split so the panel can lay it out. */
export type AnswerBlock =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; label: string; text: string };

const NOTE = /^(Assumptions|Missing data|Note|Check failed)\s*:\s*(.*)$/i;

/**
 * Splits the answer into paragraphs, "- " lists and labelled notes. Nothing is interpreted as
 * markup: every piece is still rendered as text.
 */
export function parseAnswer(answer: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  for (const raw of answer.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const last = blocks[blocks.length - 1];
    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    if (bullet?.[1] !== undefined) {
      if (last?.kind === 'list') last.items.push(bullet[1]);
      else blocks.push({ kind: 'list', items: [bullet[1]] });
      continue;
    }
    const note = NOTE.exec(line);
    if (note?.[1] !== undefined) {
      blocks.push({ kind: 'note', label: note[1], text: note[2] ?? '' });
      continue;
    }
    blocks.push({ kind: 'text', text: line });
  }
  return blocks;
}

type Row = Record<string, unknown>;

export interface ResultColumn {
  key: string;
  label: string;
  numeric: boolean;
  text: (row: Row) => string;
}

function plain(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((item) => plain(item)).join('; ');
  return JSON.stringify(value);
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const str = (value: unknown): string => (typeof value === 'string' ? value : plain(value));

function words(value: unknown): string {
  const text = str(value).replace(/_/g, ' ');
  return text === '' ? '' : text.charAt(0).toUpperCase() + text.slice(1);
}

/** Lead-row fields the tools return, in reading order, with the wording used elsewhere in the app. */
const KNOWN: { key: string; label: string; numeric?: boolean; text: (row: Row) => string }[] = [
  {
    key: 'address',
    label: 'Address',
    text: (row) => {
      const address = str(row['address']) || 'Address not recorded';
      const unit = str(row['unit']);
      return unit ? `${address} #${unit}` : address;
    },
  },
  { key: 'apn', label: 'APN', text: (row) => str(row['apn']) },
  { key: 'city', label: 'City', text: (row) => str(row['city']) },
  { key: 'zip', label: 'ZIP', text: (row) => str(row['zip']) },
  {
    key: 'distanceMiles',
    label: 'Distance',
    numeric: true,
    text: (row) => {
      const miles = num(row['distanceMiles']);
      return miles === null ? '' : formatMiles(miles);
    },
  },
  { key: 'score', label: 'Lead score', numeric: true, text: (row) => plain(row['score']) },
  { key: 'roofYear', label: 'Roof year', numeric: true, text: (row) => plain(row['roofYear']) },
  {
    key: 'roofAgeYears',
    label: 'Roof age',
    numeric: true,
    text: (row) => {
      const years = num(row['roofAgeYears']);
      return years === null ? '' : `${String(Math.round(years))} yrs`;
    },
  },
  { key: 'roofBasis', label: 'Roof age based on', text: (row) => words(row['roofBasis']) },
  { key: 'roofConfidence', label: 'Confidence', text: (row) => words(row['roofConfidence']) },
  {
    key: 'openRoofPermits',
    label: 'Open roofing permits',
    numeric: true,
    text: (row) => plain(row['openRoofPermits']),
  },
  {
    key: 'longestOpenDays',
    label: 'Longest open',
    numeric: true,
    text: (row) => {
      const days = num(row['longestOpenDays']);
      return days === null ? '' : formatOpenDuration(days).replace(/^open /, '');
    },
  },
  { key: 'topOpenPermitId', label: 'Permit', text: (row) => str(row['topOpenPermitId']) },
  {
    key: 'topOpenContractor',
    label: 'Contractor',
    text: (row) => {
      const name = str(row['topOpenContractor']);
      return name ? tidyContractor(name) : '';
    },
  },
  { key: 'topOpenLicenseNo', label: 'License', text: (row) => str(row['topOpenLicenseNo']) },
  { key: 'ownerOccupied', label: 'Owner-occupied', text: (row) => plain(row['ownerOccupied']) },
  {
    key: 'lastTransferDate',
    label: 'Last transfer',
    text: (row) => {
      const value = row['lastTransferDate'];
      return typeof value === 'string' && value !== '' ? formatDate(value) : '';
    },
  },
  { key: 'useType', label: 'Use', text: (row) => words(row['useType']) },
  { key: 'scoreReasons', label: 'Why this score', text: (row) => plain(row['scoreReasons']) },
];

/** Shown through another column (unit) or on the map (coordinates), so not as columns. */
const HIDDEN = new Set(['unit', 'lat', 'lon', 'latitude', 'longitude']);

/** "years_open" and "roofYear" both become "Years open" / "Roof year". */
export function columnLabel(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .toLowerCase();
  if (spaced === 'apn') return 'APN';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Columns for the agent's result rows: known lead fields first, in a fixed order and with
 * readable values; any other column (from a custom query) after them. Columns that are empty
 * in every row are dropped.
 */
export function resultColumns(rows: Row[]): ResultColumn[] {
  const keys = new Set(rows.flatMap((row) => Object.keys(row)));
  const columns: ResultColumn[] = [];
  for (const known of KNOWN) {
    if (!keys.has(known.key)) continue;
    columns.push({ ...known, numeric: known.numeric ?? false });
    keys.delete(known.key);
  }
  for (const key of keys) {
    if (HIDDEN.has(key)) continue;
    columns.push({
      key,
      label: columnLabel(key),
      numeric: rows.every(
        (row) => row[key] === null || row[key] === undefined || typeof row[key] === 'number',
      ),
      text: (row) => plain(row[key]),
    });
  }
  return columns.filter((column) =>
    rows.some(
      (row) => row[column.key] !== null && row[column.key] !== undefined && row[column.key] !== '',
    ),
  );
}
