/**
 * CRM lead pipeline -- the app's own data, not part of the pipeline's
 * consumer contract. Pure types and transitions here; persistence
 * (IndexedDB) and the "create a lead from a search result" mapping are
 * app-specific and live in apps/web/src/lib/crmStore.ts.
 */
import type { EvidenceTier } from './tiers.js';

export type CrmStage = 'New' | 'Contacted' | 'Qualified' | 'Won' | 'Lost';
export const CRM_STAGES: readonly CrmStage[] = ['New', 'Contacted', 'Qualified', 'Won', 'Lost'];

export interface LeadNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface LeadActivityEntry {
  id: string;
  at: string;
  actor: string;
  summary: string;
}

export interface CrmLead {
  id: string;
  parcelId: string;
  tier: EvidenceTier;
  source: 'property' | 'permit';
  address: string | null;
  city: string | null;
  lat: number;
  lon: number;
  /** Snapshot at creation time -- a lead stays legible even if the underlying dataset moves on. */
  roofAgeYears: number | null;
  roofAgeBasis: string;
  justValue: number | null;
  permitId: string | null;
  permitNumber: string | null;
  permitOpenDays: number | null;
  score: number;
  stage: CrmStage;
  /** Freeform "acting as" name -- no auth wall, per the assignment's public-access requirement. */
  owner: string;
  notes: LeadNote[];
  activity: LeadActivityEntry[];
  /** True only for leads created by the one-time demo seed, never hidden -- see crmStore.ts. */
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Not a security-sensitive ID (leads are local-first, never sent anywhere) --
 * just needs to be unique within one browser's IndexedDB, so a timestamp plus
 * a short random suffix is enough without depending on crypto.randomUUID
 * being present in every target environment.
 */
export function newLeadId(): string {
  return `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function advanceStage(lead: CrmLead, stage: CrmStage, actor: string, now = new Date()): CrmLead {
  if (stage === lead.stage) return lead;
  const entry: LeadActivityEntry = {
    id: newLeadId(),
    at: now.toISOString(),
    actor,
    summary: `Moved from ${lead.stage} to ${stage}`,
  };
  return { ...lead, stage, updatedAt: now.toISOString(), activity: [...lead.activity, entry] };
}

export function addNote(lead: CrmLead, text: string, author: string, now = new Date()): CrmLead {
  const trimmed = text.trim();
  if (trimmed.length === 0) return lead;
  const note: LeadNote = { id: newLeadId(), text: trimmed, author, createdAt: now.toISOString() };
  const entry: LeadActivityEntry = { id: newLeadId(), at: now.toISOString(), actor: author, summary: 'Added a note' };
  return { ...lead, updatedAt: now.toISOString(), notes: [...lead.notes, note], activity: [...lead.activity, entry] };
}
