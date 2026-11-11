/**
 * Deterministic fixture generator: ~300 Cook County-shaped property rows around
 * Chicago, Evanston and Oak Park with nested roofing permits and contractors.
 * Shapes follow the shared dataset contract (property/permit/contractor tables).
 * Run: pnpm fixtures:generate
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AS_OF = new Date('2026-11-01T00:00:00Z');
const RUN_ID = 'run_2026-11-01T00-00-00Z_fixture';
const INGESTED_AT = '2026-11-01T03:12:44Z';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261101);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T;
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(AS_OF.getTime() - n * 86400000);

const areas = [
  {
    name: 'Chicago',
    lat: 41.8781,
    lon: -87.6298,
    spread: 0.09,
    zip: ['60607', '60612', '60622', '60647', '60614', '60618', '60608'],
    share: 0.55,
  },
  {
    name: 'Evanston',
    lat: 42.0451,
    lon: -87.6877,
    spread: 0.025,
    zip: ['60201', '60202'],
    share: 0.22,
  },
  {
    name: 'Oak Park',
    lat: 41.885,
    lon: -87.7845,
    spread: 0.02,
    zip: ['60302', '60304'],
    share: 0.23,
  },
] as const;
const streets = [
  'N Ashland Ave',
  'W Fullerton Ave',
  'S Oak Park Ave',
  'N Ridge Ave',
  'W Armitage Ave',
  'N Damen Ave',
  'S Kenilworth Ave',
  'W Dempster St',
  'N Western Ave',
  'W Lake St',
  'S Lombard Ave',
  'N Sheridan Rd',
  'W Chicago Ave',
  'N Kedzie Ave',
  'S Harvey Ave',
];
const first = [
  'Maria',
  'James',
  'Linda',
  'Robert',
  'Patricia',
  'Michael',
  'Jennifer',
  'David',
  'Susan',
  'Daniel',
  'Karen',
  'Jose',
  'Nancy',
  'Thomas',
  'Lisa',
];
const last = [
  'Garcia',
  'Johnson',
  'Nowak',
  'Williams',
  'Kowalski',
  'Brown',
  'Martinez',
  'Davis',
  'Lopez',
  'Miller',
  'Wilson',
  'Anderson',
  'Patel',
  'Nguyen',
  'Taylor',
];
const contractorNames = [
  'Windy City Roofing Inc',
  'North Shore Roof & Gutter LLC',
  'Prairie State Roofing Co',
  'Lakeview Exteriors',
  'Oak Park Roofing Specialists',
  'Reliable Roof Systems Inc',
  'Midwest Shingle Masters',
  'Evanston Roofing & Siding',
  'Cicero Roof Repair',
  'Chicago Flat Roof Co',
  'Skyline Roofing Group',
  'Sunrise Roofing & Remodeling',
];
const bbbRatings = ['A+', 'A+', 'A', 'A-', 'B+', 'B', 'C', 'F'] as const;

type Contractor = {
  contractor_id: string;
  name: string;
  license_number: string | null;
  license_type: string | null;
  license_status: string | null;
  ever_disciplined: boolean | null;
  bbb_rating: string | null;
  bbb_url: string | null;
  bbb_state: 'confirmed_present' | 'confirmed_empty' | 'unavailable' | 'unknown';
  source_url: string | null;
  ingested_at: string;
};
const contractors: Contractor[] = contractorNames.map((name, i) => {
  const roll = rnd();
  const bbb_state =
    roll < 0.55
      ? 'confirmed_present'
      : roll < 0.75
        ? 'confirmed_empty'
        : roll < 0.9
          ? 'unavailable'
          : 'unknown';
  const licensed = rnd() < 0.85;
  return {
    contractor_id: `IDFPR-104-${String(100000 + i * 731).padStart(6, '0')}`,
    name,
    license_number: licensed ? `104.${String(10000 + i * 397).padStart(6, '0')}` : null,
    license_type: licensed ? 'ROOFING CONTRACTOR' : null,
    license_status: licensed ? (rnd() < 0.9 ? 'ACTIVE' : 'EXPIRED') : null,
    ever_disciplined: licensed ? rnd() < 0.1 : null,
    bbb_rating: bbb_state === 'confirmed_present' ? pick(bbbRatings) : null,
    bbb_url:
      bbb_state === 'confirmed_present'
        ? `https://www.bbb.org/us/il/chicago/profile/roofing-contractors/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-0654-${88000000 + i}`
        : null,
    bbb_state,
    source_url: licensed
      ? 'https://data.illinois.gov/dataset/professional-licenses/resource/pzzh-kp68'
      : null,
    ingested_at: INGESTED_AT,
  };
});

const properties = [];
let permitSeq = 0;
for (let i = 0; i < 300; i++) {
  const r = rnd();
  const area =
    r < areas[0].share ? areas[0] : r < areas[0].share + areas[1].share ? areas[1] : areas[2];
  const lat = +(area.lat + (rnd() - 0.5) * 2 * area.spread).toFixed(6);
  const lon = +(area.lon + (rnd() - 0.5) * 2 * area.spread * 1.3).toFixed(6);
  const township =
    area.name === 'Chicago'
      ? pick(['WEST CHICAGO', 'NORTH CHICAGO', 'SOUTH CHICAGO', 'LAKE VIEW'])
      : area.name === 'Evanston'
        ? 'EVANSTON'
        : 'OAK PARK';
  const pin14 =
    `${String(int(10, 20)).padStart(2, '0')}${String(int(1, 36)).padStart(2, '0')}${String(int(100, 430)).padStart(3, '0')}${String(int(1, 60)).padStart(3, '0')}${String(int(0, 1003) === 0 ? 1001 : 0).padStart(4, '0')}`
      .slice(0, 14)
      .padEnd(14, '0');
  const year_built = rnd() < 0.05 ? null : int(1885, 2020);
  const owner = `${pick(first)} ${pick(last)}`;
  const outOfArea = rnd() < 0.18;
  const mailState = outOfArea ? pick(['FL', 'CA', 'TX', 'AZ', 'NY']) : 'IL';
  const soldYearsAgo = rnd() < 0.12 ? null : +(rnd() * 25).toFixed(1);
  const lastSale = soldYearsAgo === null ? null : daysAgo(Math.round(soldYearsAgo * 365.25));
  const address = `${int(100, 7999)} ${pick(streets)}`;
  const isChicago = area.name === 'Chicago';

  // permits
  const permits = [];
  let reroofAnchor: Date | null = null;
  const nPermits = rnd() < 0.45 ? 0 : int(1, 3);
  for (let k = 0; k < nPermits; k++) {
    permitSeq++;
    const roofing = rnd() < 0.8;
    const openRoll = rnd();
    const isOpen = roofing ? openRoll < 0.55 : openRoll < 0.2;
    const ageDays = isOpen ? (rnd() < 0.5 ? int(2000, 5500) : int(30, 1999)) : int(400, 9000);
    const issued = daysAgo(ageDays);
    const closed = isOpen ? null : daysAgo(Math.max(1, ageDays - int(20, 400)));
    const contractor = rnd() < 0.8 ? pick(contractors) : null;
    const descr = roofing
      ? pick([
          'TEAR OFF AND REROOF EXISTING SINGLE FAMILY RESIDENCE',
          'REPLACE ASPHALT SHINGLE ROOF',
          'RE-ROOF FLAT ROOF WITH MODIFIED BITUMEN',
          'ROOFING: REMOVE 2 LAYERS, INSTALL NEW SHINGLES',
          'ROOF REPAIR AND GUTTERS',
        ])
      : pick([
          'KITCHEN REMODEL',
          'INSTALL ROOFTOP SOLAR PV SYSTEM',
          'REPLACE WATER HEATER',
          'NEW REAR DECK',
        ]);
    const status = isOpen
      ? pick(['PERMIT ISSUED', 'OPEN', 'IN REVIEW', 'ISSUED'])
      : pick(['COMPLETE', 'CLOSED', 'FINALED', 'EXPIRED']);
    const source_system = isChicago ? 'chicago_building_permits' : 'cook_assessor_permits';
    const permit_id = isChicago
      ? `CHI-${100500000 + permitSeq * 13}`
      : `CCA-${20000000 + permitSeq * 7}`;
    if (roofing && !isOpen && closed && (!reroofAnchor || closed > reroofAnchor))
      reroofAnchor = closed;
    permits.push({
      permit_id,
      source_system,
      pin14,
      address,
      permit_type: roofing ? 'PERMIT - EASY PERMIT PROCESS' : 'PERMIT - RENOVATION/ALTERATION',
      work_description: descr,
      is_roofing: roofing,
      roofing_match_rule: roofing
        ? 'work_description ~ /\\bRE-?ROOF|\\bROOF(ING)?\\b|SHINGLE|TEAR[- ]?OFF/i'
        : null,
      status,
      status_is_open: isOpen,
      issued_at: isoDate(issued),
      applied_at: isoDate(daysAgo(ageDays + int(3, 40))),
      closed_at: closed ? isoDate(closed) : null,
      open_days: isOpen ? ageDays : Math.round((closed!.getTime() - issued.getTime()) / 86400000),
      contractor_name: contractor?.name ?? null,
      contractor_id: contractor?.contractor_id ?? null,
      contractor: contractor ?? undefined,
      source_url: isChicago
        ? `https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu?permit_=${permit_id.slice(4)}`
        : `https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Permits/6yjf-dfxs?permit_number=${permit_id.slice(4)}`,
      ingested_at: INGESTED_AT,
    });
  }
  const roof_age_basis = reroofAnchor ? 'reroof_permit' : year_built ? 'year_built' : null;
  const anchor = reroofAnchor ?? (year_built ? new Date(Date.UTC(year_built, 6, 1)) : null);
  const roof_age_years = anchor
    ? +((AS_OF.getTime() - anchor.getTime()) / (365.25 * 86400000)).toFixed(1)
    : null;
  const roof_age_confidence =
    roof_age_basis === 'reroof_permit'
      ? 'high'
      : roof_age_basis === 'year_built'
        ? roof_age_years !== null && roof_age_years < 25
          ? 'medium'
          : 'low'
        : null;

  properties.push({
    pin14,
    address,
    city: area.name.toUpperCase(),
    zip: pick(area.zip),
    lat,
    lon,
    year_built,
    class: pick(['202', '203', '204', '205', '211', '278', '295']),
    municipality: area.name.toUpperCase(),
    township,
    owner_name: owner.toUpperCase(),
    mail_address: outOfArea
      ? `${int(100, 9999)} ${pick(['Palm Dr', 'Sunset Blvd', 'Ocean Ave', 'Desert Rd', 'Park Ave'])}`
      : address,
    mail_city: outOfArea
      ? pick(['MIAMI', 'LOS ANGELES', 'HOUSTON', 'PHOENIX', 'NEW YORK'])
      : area.name.toUpperCase(),
    mail_state: mailState,
    mail_zip: outOfArea ? String(int(10000, 99999)) : pick(area.zip),
    is_out_of_area: outOfArea,
    last_sale_date: lastSale ? isoDate(lastSale) : null,
    last_sale_price: lastSale ? int(120, 1400) * 1000 : null,
    roof_age_years,
    roof_age_basis,
    roof_age_confidence,
    source_url: `https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Universe/nj4t-kc8j?pin=${pin14}`,
    ingested_at: INGESTED_AT,
    permits,
  });
}

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'properties.json'), JSON.stringify(properties, null, 1) + '\n');
const nPermits = properties.reduce((n, p) => n + p.permits.length, 0);
const nOpenRoofing = properties.reduce(
  (n, p) => n + p.permits.filter((x) => x.is_roofing && x.status_is_open).length,
  0,
);
writeFileSync(
  join(here, 'info.json'),
  JSON.stringify(
    {
      runId: RUN_ID,
      rootCid: null,
      syncedAt: INGESTED_AT,
      counts: {
        property: properties.length,
        permit: nPermits,
        roofing_permit_open: nOpenRoofing,
        contractor: contractors.length,
      },
      limitations: [
        'Fixture dataset: synthetic rows shaped like Cook County sources, generated deterministically (seed 20261101). Not real parcels.',
        'rootCid is null because the fixture has not been published to IPFS/Elephant.',
        'queryDataset (SQL) is not supported by the fixture client.',
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `wrote ${properties.length} properties, ${nPermits} permits (${nOpenRoofing} open roofing), ${contractors.length} contractors`,
);
