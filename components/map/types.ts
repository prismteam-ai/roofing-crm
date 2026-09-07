import type { SearchParams } from "@/lib/queries/properties";
import type { PermitRecord, PropertyCandidate } from "@/lib/queries/types";

/** Client-side search form state (mirrors `searchParamsSchema`). */
export interface SearchForm {
  radiusMiles: number;
  roofAgeMin: number;
  openPermitsOnly: boolean;
  agedRoofsOnly: boolean;
  longOpenEnabled: boolean;
  longOpenYears: number;
  ownerOutOfState: boolean;
  noSaleEnabled: boolean;
  noSaleYears: number;
  ratedContractorOnly: boolean;
  propertyType: "residential" | "commercial" | "all";
}

/** Response of GET /api/search. */
export interface SearchResponse {
  params: SearchParams;
  rows: PropertyCandidate[];
  totals: {
    total: number;
    openPermits: number;
    longOpenPermits: number;
    agedRoofs: number;
    outOfStateOwners: number;
    bbbParcels: number;
  };
  truncated: boolean;
  sql: { rows: string; count: string };
  leadIds: Record<string, number>;
}

/** Response of GET /api/properties/:id. */
export interface PropertyDetailResponse {
  property: PropertyCandidate;
  permits: PermitRecord[];
}
