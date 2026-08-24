import type { CountyCatalogKey } from "./county-catalog-key.js";
import type { LeadStatus } from "./lead-status.js";
import type { LeadProvenanceTier } from "./score-lead.js";

/**
 * How roof age is derived for a lead snapshot.
 *
 * Always structure year built — Elephant exposes built_year, not roof-install year.
 */
export type RoofAgeBasis = "structure_year_built";

/**
 * Persisted CRM lead snapshot for a published property.
 *
 * Snapshots address and age fields at create time so outreach survives reload
 * without writing back to Elephant. Active uniqueness is (propertyId, not archived).
 * Provenance tier and lead score are stamped at create and never trusted from the client.
 */
export interface LeadRecord {
  leadId: string;
  propertyId: string;
  parcelIdentifier: string;
  countyKey: CountyCatalogKey;
  municipalityName: string | null;
  gisMuni: number | null;
  addressSnapshot: string;
  builtYear: number | null;
  roofAgeBasis: RoofAgeBasis;
  structureAgeYears: number | null;
  openPermitIds: string[];
  maxOpenPermitYears: number | null;
  contractorName: string | null;
  bbbRating: string | null;
  provenanceTier: LeadProvenanceTier;
  leadScore: number;
  status: LeadStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
