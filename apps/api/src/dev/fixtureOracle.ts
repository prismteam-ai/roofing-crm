/**
 * DEV-ONLY FIXTURE. NOT REAL DATA. NOT FOR PRODUCTION.
 *
 * A stand-in `OraclePort` that invents a few hundred deterministic pseudo-properties around
 * San Diego so the web app can be developed before the Oracle data service is reachable.
 * Every address, owner, permit and contractor here is synthetic.
 *
 * It is imported by `src/dev-server.ts` only, and only used when `ORACLE_MCP_URL` is not set.
 * `src/handler.ts` (the Lambda entry) and `src/services.ts` never import this file, so it is
 * not in the production bundle. Keep it that way.
 */
import {
  DEFAULT_COUNTY,
  haversineMiles,
  inBBox,
  type Contractor,
  type DatasetSummary,
  type Permit,
  type PropertyDetail,
  type Provenance,
  type SearchInput,
} from '@roofing-crm/shared';
import type { OracleLeadRow, OraclePort, OracleQuery, OracleSearch } from '../ports.js';

export const FIXTURE_LABEL = 'DEV FIXTURE (synthetic, not real records)';
const FIXTURE_URL = 'https://example.org/dev-fixture';
const DAY_MS = 86_400_000;
const PER_PLACE = 80;

interface Place {
  city: string;
  zip: string;
  lat: number;
  lon: number;
  /** Coastal places only scatter inland, so no parcel lands in the ocean. */
  coastal: boolean;
}

const PLACES: readonly Place[] = [
  { city: 'SAN DIEGO', zip: '92101', lat: 32.7157, lon: -117.1611, coastal: true },
  { city: 'LA JOLLA', zip: '92037', lat: 32.8328, lon: -117.2713, coastal: true },
  { city: 'CHULA VISTA', zip: '91910', lat: 32.6401, lon: -117.0842, coastal: false },
  { city: 'OCEANSIDE', zip: '92054', lat: 33.1959, lon: -117.3795, coastal: true },
  { city: 'ESCONDIDO', zip: '92025', lat: 33.1192, lon: -117.0864, coastal: false },
  { city: 'EL CAJON', zip: '92020', lat: 32.7948, lon: -116.9625, coastal: false },
  { city: 'CARLSBAD', zip: '92008', lat: 33.1581, lon: -117.3506, coastal: true },
  { city: 'ENCINITAS', zip: '92024', lat: 33.037, lon: -117.292, coastal: true },
];

const STREETS = [
  'MAPLE ST',
  'JUNIPER AVE',
  'SAGE CT',
  'CANYON RD',
  'MESA DR',
  'ALDER WAY',
  'HARBOR VIEW LN',
  'SYCAMORE ST',
  'OAK PARK DR',
  'VISTA GRANDE RD',
  'PALM AVE',
  'CYPRESS LN',
  'LAUREL ST',
  'ORCHARD PL',
] as const;

const USE_TYPES = [
  'Single Family',
  'Single Family',
  'Single Family',
  'Duplex',
  'Multi-Family',
  'Commercial',
] as const;

const OWNERS = [
  'FIXTURE FAMILY TRUST',
  'SAMPLE HOLDINGS LLC',
  'A. EXAMPLE',
  'J. PLACEHOLDER',
  'DEMO PROPERTIES LP',
] as const;

const NO_BBB = 'No BBB profile is matched to this licence in the source data.';

function contractor(
  name: string,
  licenseNumber: string | null,
  licenseStatus: string | null,
  classifications: string | null,
  phone: string | null,
  bbbRating: string | null,
  bbbNote: string | null = bbbRating ? null : NO_BBB,
): Contractor {
  return {
    name,
    licenseNumber,
    licenseStatus,
    classifications,
    phone,
    bbbRating,
    bbbUrl: bbbRating && licenseNumber ? `${FIXTURE_URL}/bbb/${licenseNumber}` : null,
    bbbNote,
  };
}

const CONTRACTORS: readonly Contractor[] = [
  contractor('Fixture Roofing Co', '900101', 'Active', 'C-39 Roofing', '(619) 555-0101', 'A+'),
  contractor('Sample Summit Roofing Inc', '900102', 'Active', 'C-39 Roofing', '(858) 555-0102', null),
  contractor('Placeholder Tile & Shingle', '900103', 'Expired', 'C-39 Roofing', null, null),
  contractor('Demo Coastal Exteriors', '900104', 'Active', 'B General; C-39 Roofing', '(760) 555-0104', 'B'),
  contractor('Example Solar & Roof LLC', '900105', 'Suspended', 'C-46 Solar; C-39 Roofing', null, null),
  contractor('Test Ridge Builders', '900106', 'Active', 'B General Building', null, null),
  contractor(
    'Mockingbird Roofing',
    null,
    null,
    null,
    null,
    null,
    'The permit lists no licence number, so no BBB match was attempted.',
  ),
];

/** Small seeded PRNG (mulberry32): same seed, same rows, on every machine. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], r: number): T {
  const item = items[Math.min(items.length - 1, Math.floor(r * items.length))];
  if (item === undefined) throw new Error('pick() from an empty list');
  return item;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
const pad2 = (n: number): string => String(n).padStart(2, '0');

function buildProperties(now: Date): PropertyDetail[] {
  const rand = prng(20261125);
  const thisYear = now.getUTCFullYear();
  const fetchedAt = new Date(now.getTime() - 2 * DAY_MS).toISOString();
  const out: PropertyDetail[] = [];
  let permitSeq = 100000;

  const nextPermitId = (prefix: string): string => {
    permitSeq += 7;
    return `${prefix}-${String(permitSeq)}`;
  };
  const permitProvenance = (id: string): Provenance => ({
    source: `${FIXTURE_LABEL}: building permits`,
    sourceRecordId: id,
    sourceUrl: `${FIXTURE_URL}/permit/${id}`,
    fetchedAt,
  });

  PLACES.forEach((place, placeIndex) => {
    for (let i = 0; i < PER_PLACE; i += 1) {
      const apn = `${String(500 + placeIndex)}-${String(100 + Math.floor(i / 10))}-${pad2(i % 10)}-00`;
      // Sum of two uniforms: denser near the centre, out to roughly 2.5 miles.
      const dLat = (rand() + rand() - 1) * 0.036;
      const rawLon = (rand() + rand() - 1) * 0.043;
      const dLon = place.coastal ? Math.abs(rawLon) : rawLon;
      const lat = Number((place.lat + dLat).toFixed(6));
      const lon = Number((place.lon + dLon).toFixed(6));

      const yearBuilt = rand() < 0.04 ? null : 1950 + Math.floor(rand() * 70);
      const permits: Permit[] = [];

      let roofYear: number | null = yearBuilt;
      let roofBasis: PropertyDetail['roofBasis'] = yearBuilt === null ? 'unknown' : 'year_built';
      if (yearBuilt !== null && thisYear - yearBuilt > 18 && rand() < 0.4) {
        const span = thisYear - 2 - (yearBuilt + 15);
        const year = yearBuilt + 15 + Math.floor(rand() * Math.max(1, span));
        roofYear = year;
        roofBasis = 'last_roofing_permit';
        const id = nextPermitId('RF');
        const month = pad2(1 + Math.floor(rand() * 12));
        permits.push({
          permitId: id,
          apn,
          permitType: 'Building - Re-Roof',
          roofingClass: 'reroof',
          isRoofing: true,
          status: 'Finaled',
          isOpen: false,
          appliedDate: `${String(year)}-${month}-03`,
          issuedDate: `${String(year)}-${month}-10`,
          closedDate: `${String(year)}-${month}-27`,
          daysOpen: 24,
          description: 'Tear off existing roofing and install new composition shingles.',
          contractor: pick(CONTRACTORS, rand()),
          provenance: permitProvenance(id),
        });
      }

      if (rand() < 0.16) {
        const longOpen = rand() < 0.55;
        const openDays = longOpen ? 730 + Math.floor(rand() * 3300) : 30 + Math.floor(rand() * 690);
        const applied = new Date(now.getTime() - openDays * DAY_MS);
        const issued = new Date(applied.getTime() + 9 * DAY_MS);
        const id = nextPermitId('RF');
        const ownerBuilder = rand() < 0.15;
        const repair = rand() < 0.3;
        permits.push({
          permitId: id,
          apn,
          permitType: repair ? 'Building - Roof Repair' : 'Building - Re-Roof',
          roofingClass: repair ? 'repair' : 'reroof',
          isRoofing: true,
          status: rand() < 0.75 ? 'Issued' : 'Expired - not finaled',
          isOpen: true,
          appliedDate: isoDate(applied),
          issuedDate: isoDate(issued),
          closedDate: null,
          daysOpen: openDays,
          description: 'Re-roof over existing sheathing; final inspection not recorded.',
          contractor: ownerBuilder ? null : pick(CONTRACTORS, rand()),
          provenance: permitProvenance(id),
        });
      }

      if (rand() < 0.2) {
        const year = String(2012 + Math.floor(rand() * 13));
        const id = nextPermitId('PV');
        permits.push({
          permitId: id,
          apn,
          permitType: 'Electrical - Photovoltaic',
          roofingClass: null,
          isRoofing: false,
          status: 'Finaled',
          isOpen: false,
          appliedDate: `${year}-05-02`,
          issuedDate: `${year}-05-06`,
          closedDate: `${year}-06-18`,
          daysOpen: 47,
          description: 'Roof-mounted solar photovoltaic system.',
          contractor: pick(CONTRACTORS, rand()),
          provenance: permitProvenance(id),
        });
      }

      const hasTransfer = rand() < 0.85;
      const transferYear = 1995 + Math.floor(rand() * (thisYear - 1995));
      const transferMonth = pad2(1 + Math.floor(rand() * 12));
      const ownerKnown = rand() < 0.4;
      const occupancy = rand();
      const houseNumber = 100 + Math.floor(rand() * 9800);
      const street = pick(STREETS, rand());
      const poBox = 1000 + Math.floor(rand() * 8000);

      out.push({
        apn,
        address: `${String(houseNumber)} ${street}`,
        city: place.city,
        zip: place.zip,
        lat,
        lon,
        yearBuilt,
        roofYear,
        roofAgeYears: roofYear === null ? null : thisYear - roofYear,
        roofBasis,
        roofConfidence:
          roofBasis === 'last_roofing_permit' ? 'high' : roofBasis === 'year_built' ? 'medium' : null,
        useType: pick(USE_TYPES, rand()),
        ownerOccupied: occupancy < 0.55 ? true : occupancy < 0.85 ? false : null,
        ownerName: ownerKnown ? pick(OWNERS, rand()) : null,
        ownerMailing: ownerKnown ? `PO BOX ${String(poBox)}, ${place.city} CA ${place.zip}` : null,
        lastTransferDate: hasTransfer ? `${String(transferYear)}-${transferMonth}-15` : null,
        yearsSinceTransfer: hasTransfer ? thisYear - transferYear : null,
        permits,
        provenance: {
          source: `${FIXTURE_LABEL}: assessor parcels`,
          sourceRecordId: apn,
          sourceUrl: `${FIXTURE_URL}/parcel/${apn}`,
          fetchedAt,
        },
      });
    }
  });
  return out;
}

function toRow(p: PropertyDetail, distanceMiles: number): OracleLeadRow {
  const open = p.permits.filter((permit) => permit.isRoofing && permit.isOpen);
  const longest = open.reduce<number | null>(
    (max, permit) =>
      permit.daysOpen !== null && (max === null || permit.daysOpen > max) ? permit.daysOpen : max,
    null,
  );
  return {
    apn: p.apn,
    address: p.address,
    city: p.city,
    zip: p.zip,
    lat: p.lat,
    lon: p.lon,
    distanceMiles: Number(distanceMiles.toFixed(3)),
    roofYear: p.roofYear,
    roofAgeYears: p.roofAgeYears,
    roofBasis: p.roofBasis,
    roofConfidence: p.roofConfidence,
    openRoofPermits: open.length,
    longestOpenDays: longest,
    ownerOccupied: p.ownerOccupied,
    lastTransferDate: p.lastTransferDate,
    useType: p.useType,
  };
}

const desc = (a: number | null, b: number | null): number => (b ?? -1) - (a ?? -1);

function matchesSignal(signal: SearchInput['signal'], aged: boolean, openOk: boolean): boolean {
  switch (signal) {
    case 'aged_roof':
      return aged;
    case 'open_permit':
      return openOk;
    case 'both':
      return aged && openOk;
    case 'any':
      return aged || openOk;
  }
}

/** In-memory stand-in for the Oracle MCP. See the file header: development only. */
export class FixtureOracle implements OraclePort {
  private readonly properties: PropertyDetail[];
  private readonly asOf: string;
  private readonly fetchedAt: string;

  constructor(now: Date = new Date()) {
    this.properties = buildProperties(now);
    const fetched = new Date(now.getTime() - 2 * DAY_MS);
    this.asOf = isoDate(fetched);
    this.fetchedAt = fetched.toISOString();
  }

  searchLeads(input: SearchInput): Promise<OracleSearch> {
    const result: OracleSearch = {
      total: 0,
      agedRoofCount: 0,
      openPermitCount: 0,
      asOf: this.asOf,
      rows: [],
    };
    if (!inBBox(input.center, DEFAULT_COUNTY.bbox)) return Promise.resolve(result);

    const minOpenDays = input.minOpenYears * 365.25;
    const matches: OracleLeadRow[] = [];

    for (const property of this.properties) {
      const miles = haversineMiles(input.center, property);
      if (miles > input.radiusMiles) continue;
      const row = toRow(property, miles);
      const aged = row.roofAgeYears !== null && row.roofAgeYears >= input.minRoofAgeYears;
      const openOk = row.openRoofPermits > 0 && (row.longestOpenDays ?? 0) >= minOpenDays;
      if (!matchesSignal(input.signal, aged, openOk)) continue;
      if (input.permitStatus === 'open' && row.openRoofPermits === 0) continue;
      if (
        input.permitStatus === 'closed' &&
        !(row.openRoofPermits === 0 && property.permits.some((permit) => permit.isRoofing))
      ) {
        continue;
      }
      if (aged) result.agedRoofCount += 1;
      if (row.openRoofPermits > 0) result.openPermitCount += 1;
      matches.push(row);
    }

    matches.sort((a, b) => {
      switch (input.sort) {
        case 'distance':
          return a.distanceMiles - b.distanceMiles;
        case 'roof_age':
          return desc(a.roofAgeYears, b.roofAgeYears);
        case 'open_days':
          return desc(a.longestOpenDays, b.longestOpenDays);
        case 'score':
          return desc(a.longestOpenDays, b.longestOpenDays) || desc(a.roofAgeYears, b.roofAgeYears);
      }
    });

    result.total = matches.length;
    result.rows = matches.slice(input.offset, input.offset + input.limit);
    return Promise.resolve(result);
  }

  getProperty(apn: string): Promise<PropertyDetail | null> {
    return Promise.resolve(this.properties.find((p) => p.apn === apn) ?? null);
  }

  datasetSummary(): Promise<DatasetSummary> {
    const permits = this.properties.reduce((n, p) => n + p.permits.length, 0);
    return Promise.resolve({
      county: `${DEFAULT_COUNTY.name} - ${FIXTURE_LABEL}`,
      asOf: this.asOf,
      lastRunId: 'dev-fixture',
      counts: [
        { table: 'property', rows: this.properties.length },
        { table: 'permit', rows: permits },
        { table: 'contractor', rows: CONTRACTORS.length },
      ],
      sources: [
        {
          name: `${FIXTURE_LABEL}: assessor parcels`,
          url: `${FIXTURE_URL}/parcel`,
          rows: this.properties.length,
          fetchedAt: this.fetchedAt,
          limits: 'Generated in memory by the local dev server. Set ORACLE_MCP_URL for real data.',
        },
        {
          name: `${FIXTURE_LABEL}: building permits`,
          url: `${FIXTURE_URL}/permit`,
          rows: permits,
          fetchedAt: this.fetchedAt,
          limits: 'Synthetic permits and contractors. BBB ratings are mostly absent on purpose.',
        },
      ],
      manifestCid: null,
    });
  }

  schema(): Promise<string> {
    return Promise.resolve(
      'DEV FIXTURE: no SQL schema. Set ORACLE_MCP_URL to use the real data service.',
    );
  }

  query(sql: string): Promise<OracleQuery> {
    return Promise.resolve({ columns: [], rows: [], rowCount: 0, truncated: false, sql });
  }
}
