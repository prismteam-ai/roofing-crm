/**
 * County-aware coverage and answer copy for agent.ask.
 */
import {
  CHESTER_DEMO_RAG_COUNTY,
  isChesterDemoRagCounty,
  isRealChesterCounty,
} from "./chester-demo-rag-contract.js";

export const LEE_DEV_FALLBACK_COVERAGE_NOTE =
  "Lee County published records only. Chester County is not included yet.";

export const CHESTER_DEMO_RAG_COVERAGE_NOTE =
  "Chester (demo data): synthetic demo signals for evaluation only. Roof ages and roofing permits are not real county GIS facts. Coverage is 42 of 73 municipalities.";

export const REAL_CHESTER_STRUCTURED_ONLY_COVERAGE_NOTE =
  "Real Chester County published records only. RAG is unavailable here; built year is not published and permits are not roofing-classified on the real table.";

export const AGENT_NOT_INDEXED_COVERAGE_NOTE =
  "Lee County sample records only. Chester County is not included.";

export const AGENT_ASK_NOT_INDEXED_USE_RADIUS_COPY =
  "RoofRadar AI cannot answer questions here yet. Use Roofs in this radius instead.";

export const AGENT_ASK_COUNTY_NOT_MAP_READY_COPY =
  "This county is listed but not searchable yet. Walk Lee County to convert doors.";

export const AGENT_ASK_MISSING_MAP_CONTEXT_COPY =
  "Drop a pin and set a search radius to ask about roofing opportunities here.";

export const AGENT_WEST_CHESTER_LEE_INDEX_COPY =
  "RoofRadar AI only covers published Lee County records. West Chester and Chester County are listed but not searchable yet. Walk Lee County to review doors near Fort Myers, or use the map filters.";

export const AGENT_REAL_CHESTER_STRUCTURED_ONLY_COPY =
  "RoofRadar AI does not index real Chester County records yet. Use the map filters and structured search for published Chester parcels.";

export const AGENT_CHESTER_DEMO_NOT_READY_COPY =
  "The Chester demo RAG corpus is not ready yet. Use Roofs in this radius while indexing completes.";

export const AGENT_ASK_LOW_CONFIDENCE_COPY =
  "Not sure enough to pick a door from these records.";

export const AGENT_NO_OPEN_PERMITS_IN_RADIUS_COPY =
  "No open roofing permits are published for parcels in this radius on the consolidated county records. Oldest published roofs nearby are the next-best doors:";

export function resolveAgentCoverageNote(county: string): string {
  if (isChesterDemoRagCounty(county)) {
    return CHESTER_DEMO_RAG_COVERAGE_NOTE;
  }
  if (isRealChesterCounty(county)) {
    return REAL_CHESTER_STRUCTURED_ONLY_COVERAGE_NOTE;
  }
  return LEE_DEV_FALLBACK_COVERAGE_NOTE;
}

export function resolveCorpusLabel(county: string): string {
  if (isChesterDemoRagCounty(county)) {
    return "chester-demo synthetic demo";
  }
  if (isRealChesterCounty(county)) {
    return "real Chester County";
  }
  return "Lee County";
}

export function shouldRefuseChesterGeographyOnLeeIndex(
  county: string,
  mentionsChesterGeography: boolean,
): boolean {
  return county.trim().toLowerCase() === "lee" && mentionsChesterGeography;
}

export function isStructuredSearchOnlyCounty(county: string): boolean {
  return isRealChesterCounty(county);
}

export const CHESTER_DEMO_RAG_COUNTY_KEY = CHESTER_DEMO_RAG_COUNTY;
