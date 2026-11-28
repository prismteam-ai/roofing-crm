import { z } from "zod";
import { DEFAULT_RADIUS_MILES, DEFAULT_ROOF_AGE_YEARS, RADIUS_BOUNDS } from "./constants.ts";

export const LatLon = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
export type LatLon = z.infer<typeof LatLon>;

export const PermitStatus = z.enum(["open", "completed", "other", "needs_review"]);
export type PermitStatus = z.infer<typeof PermitStatus>;

export const Layer = z.enum(["aged_roofs", "open_permits"]);
export type Layer = z.infer<typeof Layer>;

export const SearchInput = z.object({
  center: LatLon,
  radiusMiles: z.number().min(RADIUS_BOUNDS.min).max(RADIUS_BOUNDS.max).default(DEFAULT_RADIUS_MILES),
  minRoofAgeYears: z.number().min(0).max(150).default(DEFAULT_ROOF_AGE_YEARS),
  minOpenYears: z.number().min(0).max(100).default(0),
  layers: z.array(Layer).min(1).default(["aged_roofs", "open_permits"]),
  permitStatus: z.array(PermitStatus).optional(),
});
export type SearchInput = z.infer<typeof SearchInput>;

export const OpenRoofPermit = z.object({
  permitId: z.string(),
  openDays: z.number().nullable(),
  status: PermitStatus,
  contractorName: z.string().nullable(),
  /** DBPR license status of the permit's contractor (e.g. "Current,Active"), when linked. */
  contractorLicenseStatus: z.string().nullable(),
  bbbGrade: z.string().nullable(),
});
export type OpenRoofPermit = z.infer<typeof OpenRoofPermit>;

export const LeadCandidate = z.object({
  /** Lexicon parcel_identifier: the stable lead key. */
  propertyId: z.string(),
  /** Published Elephant property CID (provenance); null when the published archive lacks the parcel. */
  propertyCid: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  roofAgeYears: z.number().nullable(),
  roofAgeBasis: z.string(),
  openRoofPermits: z.array(OpenRoofPermit),
  score: z.number(),
  reasons: z.array(z.string()),
});
export type LeadCandidate = z.infer<typeof LeadCandidate>;

export const SearchResult = z.object({
  candidates: z.array(LeadCandidate),
  outsideCoverage: z.boolean(),
  /** Jurisdictions in the radius without permit data (Oracle permitCoverage). */
  permitGaps: z.array(z.string()),
  /**
   * Layers whose Oracle query hit the row limit. Aged roofs are then spread over the circle (the
   * oldest roofs of each part of it); open permits keep the longest-open.
   */
  capped: z.array(Layer).default([]),
  /** How many rows each layer matched in the Oracle, before the row limit. */
  totals: z
    .object({ aged_roofs: z.number().int().optional(), open_permits: z.number().int().optional() })
    .default({}),
  rowLimit: z.number().int().positive().default(2000),
  manifestCid: z.string(),
});
export type SearchResult = z.infer<typeof SearchResult>;

export const LeadSignals = z.object({
  roofAgeYears: z.number().nullable(),
  roofAgeBasis: z.string(),
  maxOpenDays: z.number().nullable(),
  bbbGrade: z.string().nullable(),
  ownerLocationClass: z.string(),
});
export type LeadSignals = z.infer<typeof LeadSignals>;
