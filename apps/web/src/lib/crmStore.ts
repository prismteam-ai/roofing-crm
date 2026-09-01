/**
 * Local-first CRM lead storage: IndexedDB, one object store keyed by id.
 *
 * Deliberately not a shared backend -- the assignment's constraint is to
 * minimise new services/accounts, and this is what keeps the runtime gate
 * (a candidate-deployed public URL, always reachable) unconditionally true:
 * there is no database to be down. The honest cost is that leads live only
 * in the browser that created them; export/import makes that state visible
 * and portable rather than hiding the trade-off.
 */
import { newLeadId, type CrmLead } from '@roofing-crm/shared';
import type { LeadCandidate } from './leads.js';
import type { OpenPermitCandidate } from './permits.js';

const DB_NAME = 'roofing-crm';
const DB_VERSION = 1;
const STORE = 'leads';
const SEEDED_FLAG_KEY = 'roofing-crm:seeded-v1';

function isOpenPermitCandidate(c: LeadCandidate): c is OpenPermitCandidate {
  return 'permitOpenDays' in c;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export async function listLeads(): Promise<CrmLead[]> {
  const db = await openDb();
  const all = await tx(db, 'readonly', (s) => s.getAll() as IDBRequest<CrmLead[]>);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putLead(lead: CrmLead): Promise<void> {
  const db = await openDb();
  await tx(db, 'readwrite', (s) => s.put(lead));
}

export async function deleteLead(id: string): Promise<void> {
  const db = await openDb();
  await tx(db, 'readwrite', (s) => s.delete(id));
}

/** Builds a new CrmLead from a search-result candidate. Pure mapping, not persisted here. */
export function createLeadFromCandidate(candidate: LeadCandidate, owner: string, now = new Date()): CrmLead {
  const permit = isOpenPermitCandidate(candidate) ? candidate : null;
  const iso = now.toISOString();
  return {
    id: newLeadId(),
    parcelId: candidate.parcelId,
    tier: candidate.tier,
    source: permit ? 'permit' : 'property',
    address: permit?.permitAddress ?? candidate.address,
    city: candidate.city,
    lat: candidate.lat,
    lon: candidate.lon,
    roofAgeYears: candidate.roofAgeYears,
    roofAgeBasis: candidate.roofAgeBasis,
    justValue: candidate.justValue,
    permitId: permit?.permitId ?? null,
    permitNumber: permit?.permitNumber ?? null,
    permitOpenDays: permit?.permitOpenDays ?? null,
    score: candidate.score,
    stage: 'New',
    owner,
    notes: [],
    activity: [{ id: newLeadId(), at: iso, actor: owner, summary: 'Created from search results' }],
    isDemo: false,
    createdAt: iso,
    updatedAt: iso,
  };
}

/**
 * One-time only, real data: creates a handful of demo leads from the
 * strongest real Tier A candidates (a wide, county-scale search around
 * Brevard's centre) so the pipeline board is populated on arrival rather
 * than empty. Never fabricated -- these are genuine parcels/permits from
 * whichever dataset is live at the moment of seeding, clearly flagged
 * `isDemo: true` so they read as illustrative, not as the user's own work,
 * and can be deleted like any other lead. Runs at most once per browser.
 */
export async function seedDemoLeadsIfNeeded(
  findSeedCandidates: () => Promise<OpenPermitCandidate[]>,
): Promise<CrmLead[]> {
  if (localStorage.getItem(SEEDED_FLAG_KEY)) return [];
  const existing = await listLeads();
  if (existing.length > 0) {
    localStorage.setItem(SEEDED_FLAG_KEY, '1');
    return [];
  }
  const candidates = await findSeedCandidates();
  const now = new Date();
  const seeded: CrmLead[] = candidates.slice(0, 4).map((c, i) => {
    const lead = createLeadFromCandidate(c, 'Demo seed', now);
    return {
      ...lead,
      isDemo: true,
      stage: (['New', 'New', 'Contacted', 'Qualified'] as const)[i] ?? 'New',
      activity: [
        { id: newLeadId(), at: now.toISOString(), actor: 'Demo seed', summary: 'Seeded from live dataset on first visit' },
      ],
    };
  });
  for (const lead of seeded) await putLead(lead);
  localStorage.setItem(SEEDED_FLAG_KEY, '1');
  return seeded;
}

export interface LeadExport {
  format: 'roofing-crm-leads';
  version: 1;
  exportedAt: string;
  leads: CrmLead[];
}

export async function exportLeadsJson(): Promise<string> {
  const leads = await listLeads();
  const payload: LeadExport = { format: 'roofing-crm-leads', version: 1, exportedAt: new Date().toISOString(), leads };
  return JSON.stringify(payload, null, 2);
}

/** Upserts by id; returns how many were imported. Throws on malformed input rather than partially importing. */
export async function importLeadsJson(json: string): Promise<number> {
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== 'object' || parsed === null
    || (parsed as { format?: unknown }).format !== 'roofing-crm-leads'
    || !Array.isArray((parsed as { leads?: unknown }).leads)
  ) {
    throw new Error('Not a roofing-crm leads export file.');
  }
  const leads = (parsed as LeadExport).leads;
  for (const lead of leads) {
    if (typeof lead.id !== 'string' || typeof lead.parcelId !== 'string') {
      throw new Error('Malformed lead record in import file.');
    }
  }
  for (const lead of leads) await putLead(lead);
  return leads.length;
}
