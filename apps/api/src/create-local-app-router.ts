/**
 * Local tRPC domain routers: in-memory leads + Lee search (MCP or stand-in).
 *
 * Browser refresh talks to this process — not DynamoDB and not localStorage.
 * Set ROOFING_CRM_ELEPHANT_MCP=1 and inject an ElephantMcpToolClient when
 * live queryProperties/findPropertiesInArea are reliable.
 */
import {
  listPublishedCounties as listPublishedCountiesFromElephantClient,
  mergeQueryTableServedCountiesIntoCatalog,
  parseElephantMcpToolJson,
  type ElephantMcpToolClient,
} from "@roofing-crm-challenge/elephant-client";
import { ELEPHANT_MCP_SERVER_ENV } from "./elephant-mcp-env.js";
import { createAgentRouter } from "./routers/agent.js";
import { createRoofingOpportunityAgentDependencies } from "./rag/create-agent-ask-dependencies.js";
import { createCountiesRouter } from "./routers/counties.js";
import { createAppRouter } from "./routers/health.js";
import { createLeadsRouter, generateUlidLeadRecordId } from "./routers/leads.js";
import { createPropertiesRouter } from "./routers/properties.js";
import {
  createSearchRouter,
  type SearchInRadiusPropertyRow,
} from "./routers/search.js";
import { buildLeadRecordCreateSnapshotFromSearchPropertyRow } from "./build-lead-record-create-snapshot-from-search-property-row.js";
import { createInMemoryLeadRecordRepository } from "./leads-record-repository.js";
import { listLocalLeeStandInPropertiesInBoundingBox } from "./local-lee-stand-in-search-property-rows.js";
import { mapSearchPropertyRowToOraclePropertyRecord } from "./map-search-property-row-to-oracle-property-record.js";
import { createQueryPropertiesInBoundingBoxLoader } from "./query-properties-in-bounding-box.js";

/** Lee-only catalog payload while live listPublishedCounties is unused locally. */
const LOCAL_LEE_PUBLISHED_COUNTY_CATALOG = {
  counties: [
    {
      countyKey: "lee",
      countyName: "Lee",
      stateCode: "FL",
      queryTableUrl: JSON.parse(
        ELEPHANT_MCP_SERVER_ENV.PROPERTY_QUERY_TABLE_MAP ?? "{}",
      ).lee as string,
    },
  ],
};

/**
 * Options for the local (non-Lambda) app router.
 */
export interface CreateLocalAppRouterOptions {
  elephantMcpToolClient?: ElephantMcpToolClient;
  nowIso?: () => string;
}

/**
 * Builds the same tRPC app as Lambda, with local transports.
 */
export function createLocalAppRouter(options: CreateLocalAppRouterOptions = {}) {
  const propertyRowsByPropertyId = new Map<string, SearchInRadiusPropertyRow>();
  const leadRecordRepository = createInMemoryLeadRecordRepository();

  const listPropertiesInBoundingBox =
    options.elephantMcpToolClient === undefined
      ? listLocalLeeStandInPropertiesInBoundingBox
      : createQueryPropertiesInBoundingBoxLoader(options.elephantMcpToolClient);

  const rememberPropertyRows = async (arguments_: {
    county: string;
    boundingBox: {
      minLat: number;
      minLng: number;
      maxLat: number;
      maxLng: number;
    };
    center: { lat: number; lng: number };
  }): Promise<SearchInRadiusPropertyRow[]> => {
    const propertyRows = await listPropertiesInBoundingBox({
      county: arguments_.county,
      boundingBox: arguments_.boundingBox,
      center: arguments_.center,
    });
    for (const propertyRow of propertyRows) {
      propertyRowsByPropertyId.set(propertyRow.propertyId, propertyRow);
    }
    return propertyRows;
  };

  const loadOfficialPublishedCountyCatalog = async (): Promise<unknown> => {
    if (options.elephantMcpToolClient === undefined) {
      return LOCAL_LEE_PUBLISHED_COUNTY_CATALOG;
    }
    return parseElephantMcpToolJson(
      await options.elephantMcpToolClient.callTool("listPublishedCounties", {}),
    );
  };

  const listOfficialPublishedCounties = () =>
    listPublishedCountiesFromElephantClient(loadOfficialPublishedCountyCatalog);

  const listServedPublishedCounties = async () => {
    const officialCatalog = await listOfficialPublishedCounties();
    if (options.elephantMcpToolClient === undefined) {
      return officialCatalog;
    }
    return mergeQueryTableServedCountiesIntoCatalog(
      officialCatalog,
      ELEPHANT_MCP_SERVER_ENV.PROPERTY_QUERY_TABLE_MAP ?? "{}",
      ELEPHANT_MCP_SERVER_ENV.ORACLE_GEO_INDEX_IPNS_MAP ?? "{}",
    );
  };

  const counties = createCountiesRouter({
    listPublishedCounties: listServedPublishedCounties,
  });

  const searchRouterDependencies = {
    listPropertiesInBoundingBox: rememberPropertyRows,
    listPublishedCounties: listOfficialPublishedCounties,
  };

  const search = createSearchRouter(searchRouterDependencies);

  const properties = createPropertiesRouter({
    getOracleProperty: async ({ propertyId }) => {
      const propertyRow = propertyRowsByPropertyId.get(propertyId);
      if (propertyRow === undefined) {
        throw new Error(`No local property cache for ${propertyId}`);
      }
      return mapSearchPropertyRowToOraclePropertyRecord(propertyRow);
    },
    getPermitQuerySchema: async () => {
      throw new Error("Lee permit query table is unserved");
    },
    queryPermits: async ({ parcelIdentifier: _parcelIdentifier }) => [],
  });

  const leads = createLeadsRouter({
    leadRecordRepository,
    loadLeadRecordCreateSnapshot: async ({ propertyId, countyKey, permitIds }) => {
      const propertyRow = propertyRowsByPropertyId.get(propertyId);
      if (propertyRow === undefined) {
        throw new Error(
          `Lead snapshot needs a prior search.inRadius hit for ${propertyId}`,
        );
      }
      return buildLeadRecordCreateSnapshotFromSearchPropertyRow({
        countyKey,
        propertyRow,
        permitIds,
        currentUtcYear: new Date().getUTCFullYear(),
      });
    },
    generateLeadRecordId: generateUlidLeadRecordId,
    nowIso: options.nowIso ?? (() => new Date().toISOString()),
  });

  const roofingOpportunityAgentDependenciesPromise =
    createRoofingOpportunityAgentDependencies(searchRouterDependencies);

  const agent = createAgentRouter({
    runAsk: async (input) => {
      const roofingOpportunityAgentDependencies =
        await roofingOpportunityAgentDependenciesPromise;
      const { runRoofingOpportunityAgent } =
        await import("./rag/run-roofing-opportunity-agent.js");
      return runRoofingOpportunityAgent(input, roofingOpportunityAgentDependencies);
    },
  });

  return createAppRouter({
    counties,
    search,
    properties,
    leads,
    agent,
  });
}
