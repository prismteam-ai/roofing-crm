/**
 * HTTP client for properties.get over the hosted or local tRPC API.
 */
import { fetchTrpcQuery } from "../api/trpc-http";
import type { PropertyPermitDetail } from "./PropertyPermitLayerPanel";
import type { PublishedPropertyBbbProfile } from "./PublishedPropertyDrawer";

/**
 * Input for loading one published property with permit and BBB detail.
 */
export interface PropertiesGetQueryInput {
  county: string;
  propertyId: string;
  detailResolution?: "drawer" | "scan";
}

/**
 * properties.get response shape mirrored from the API contract.
 */
export interface PropertiesGetResult {
  propertyId: string;
  county: string;
  parcelIdentifier: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressZip: string | null;
  latitude: number | null;
  longitude: number | null;
  builtYear: number | null;
  builtYearSource: string | null;
  roofAgeBasis: "structure_year_built";
  hasPermits: boolean | null;
  permitCount: number | null;
  permits: PropertyPermitDetail[];
  permitDetailsSource: "consolidated_permits" | "query_permits" | "synthetic_demo";
  hasBbbContractor: boolean | null;
  bbb: PublishedPropertyBbbProfile | null;
}

/**
 * Client surface the map shell uses for property drawer detail.
 */
export interface PropertiesGetApiClient {
  getProperty(input: PropertiesGetQueryInput): Promise<PropertiesGetResult>;
}

/**
 * Builds a PropertiesGetApiClient over tRPC HTTP JSON.
 */
export function createHttpPropertiesGetApiClient(
  apiBaseUrl: string,
): PropertiesGetApiClient {
  return {
    async getProperty(input: PropertiesGetQueryInput): Promise<PropertiesGetResult> {
      return fetchTrpcQuery<PropertiesGetResult>(apiBaseUrl, "properties.get", input);
    },
  };
}
