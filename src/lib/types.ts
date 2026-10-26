export interface Property {
  property_key: string; print_key_code: string; sbl_key: string; situs_address: string | null; town_or_city: string | null;
  property_class: string | null; property_class_description: string | null;
  lat: number; lon: number; coord_method: string | null;
  owner_name: string | null; owner_location_class: string | null; mailing_city: string | null; mailing_state: string | null;
  ownership_signal: string | null; last_deed_change_roll_year: number | null; full_market_value: number | null;
  roof_age_basis: string; roof_year: number | null; roof_age_years: number | null; roof_age_confidence: string | null;
  roof_age_caveat: string | null; evidence_permit_no: string | null;
  bbb_score: number | null;
  miles: number;
}

export interface Permit {
  permit_no: string; property_key: string; permit_type: string | null; permit_subtype: string | null;
  status: string | null; status_class: "open" | "closed" | "void" | "unknown" | null; status_known: boolean;
  is_open: boolean; is_roofing: boolean; roofing_confidence: "none" | "low" | "medium" | "high";
  roofing_basis_summary: string | null;
  applied_date: string | null; issued_date: string | null; finaled_date: string | null; close_date: string | null;
  open_since: string | null; open_since_basis: string | null; years_open: number | null;
  expiration_date_valid: string | null; past_expiration: boolean | null;
  job_description: string | null; fees_charged: string | null;
  contractor_name: string | null; trade_contacts: string | null;
  bbb_score: number | null;
}

/** A permit joined to its property (what the map/list shows for the "open permits" view). */
export interface PermitLead extends Permit {
  situs_address: string | null; lat: number; lon: number; miles: number;
  roof_age_years: number | null; roof_age_confidence: string | null; roof_age_basis: string;
}

export type PermitFilter = "roofing" | "roofing_low" | "all_open";

export interface Pin { lat: number; lon: number }

export type LeadStatus = "New" | "Contacted" | "Quoted" | "Won" | "Lost";
export interface Lead {
  id: string; created_at: string; status: LeadStatus; notes: string;
  property_key: string; address: string; lat: number; lon: number;
  owner_name: string | null; out_of_area_owner: boolean;
  roof_age_years: number | null; roof_age_confidence: string | null; roof_age_basis: string;
  permit_no: string | null; permit_status: string | null; permit_open: boolean | null; permit_years_open: number | null;
  roofing_confidence: string | null; contractor_name: string | null; bbb_score: number | null;
}

/** Minimal GeoJSON shapes used by the map (avoids a @types/geojson dependency). */
export interface PointFeature { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "Point"; coordinates: [number, number] } }
export interface FC { type: "FeatureCollection"; features: PointFeature[] }
export interface PolygonFeature { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "Polygon"; coordinates: [number, number][][] } }
