/**
 * Lambda tRPC domain routers: DynamoDB leads + live Elephant MCP (no DEMO stand-ins).
 */
import { Logger } from "@aws-lambda-powertools/logger";
import {
  listPublishedCounties as listPublishedCountiesFromElephantClient,
  mergeQueryTableServedCountiesIntoCatalog,
  parseElephantMcpToolJson,
  type ElephantMcpToolClient,
} from "@roofing-crm-challenge/elephant-client";
import { ELEPHANT_MCP_SERVER_ENV } from "./elephant-mcp-env.js";
import { createAgentRouter } from "./routers/agent.js";
import { buildAgentAskNotIndexedResponse } from "./rag/run-roofing-opportunity-agent.js";
import { createRoofingOpportunityAgentDependencies } from "./rag/create-agent-ask-dependencies.js";
import { createCountiesRouter } from "./routers/counties.js";
import { createAppRouter } from "./routers/health.js";
import { createLeadsRouter, generateUlidLeadRecordId } from "./routers/leads.js";
import {
  createPropertiesRouter,
  type OraclePropertyRecord,
} from "./routers/properties.js";
import {
  createSearchRouter,
  type SearchInRadiusPropertyRow,
} from "./routers/search.js";
import { buildLeadRecordCreateSnapshotFromOraclePropertyRecord } from "./build-lead-record-create-snapshot-from-oracle-property-record.js";
import { buildLeadRecordCreateSnapshotFromSearchPropertyRow } from "./build-lead-record-create-snapshot-from-search-property-row.js";
import { mapElephantOraclePropertyPayload } from "./map-elephant-oracle-property-payload.js";
import { createElephantMcpStdioToolClient } from "./elephant-mcp-stdio-tool-client.js";
import {
  createDynamoDbLeadRecordRepository,
  type LeadRecordRepository,
} from "./leads-record-repository.js";
import {
  createQueryPropertiesInBoundingBoxLoader,
  createQueryPropertyRowByIdLoader,
} from "./query-properties-in-bounding-box.js";
import { mapSearchPropertyRowToOraclePropertyRecord } from "./map-search-property-row-to-oracle-property-record.js";
import { buildQueryPermitsSqlForProperty } from "./build-query-permits-sql.js";
import {
  mapQueryPermitViewRowToOraclePropertyPermitRecord,
  parseQueryPermitViewRows,
} from "./map-query-permit-row-to-oracle-record.js";
import { loadWithTimeout } from "./load-with-timeout.js";
import {
  EMPTY_LEAD_PERMIT_SIGNALS,
  resolveLeadPermitSignalsFromPermitRecords,
  type LeadPermitSignals,
} from "./resolve-lead-permit-signals.js";
import type { OraclePropertyPermitRecord } from "./routers/properties.js";

/** Router-scope structured logger (closures here run outside tRPC ctx). */
const lambdaAppRouterLogger = new Logger({ serviceName: "roofing-crm-api" });

/**
 * Resolves whether radius search is map-ready for a catalog county key.
 */
async function resolveMapSearchReadyForCountyKey(
  countyKey: string,
  listServedPublishedCounties: () => Promise<
    Array<{ countyKey: string; mapSearchReady: boolean }>
  >,
): Promise<boolean> {
  const catalog = await listServedPublishedCounties();
  const row = catalog.find(
    (entry) => entry.countyKey.trim().toLowerCase() === countyKey.trim().toLowerCase(),
  );
  return row?.mapSearchReady === true;
}

/**
 * Options for the Lambda production app router.
 */
export interface CreateLambdaAppRouterOptions {
  leadRecordTableName?: string;
  leadRecordRepository?: LeadRecordRepository;
  elephantMcpToolClient?: ElephantMcpToolClient;
  nowIso?: () => string;
}

/**
 * Builds the production tRPC app wired for DynamoDB + Elephant MCP stdio.
 */
export function createLambdaAppRouter(options: CreateLambdaAppRouterOptions = {}) {
  const leadRecordTableName =
    options.leadRecordTableName ?? process.env.LEAD_RECORD_TABLE_NAME;
  if (
    options.leadRecordRepository === undefined &&
    (leadRecordTableName === undefined || leadRecordTableName.length === 0)
  ) {
    throw new Error(
      "LEAD_RECORD_TABLE_NAME is required for createLambdaAppRouter unless leadRecordRepository is injected",
    );
  }

  const elephantMcpToolClient =
    options.elephantMcpToolClient ?? createElephantMcpStdioToolClient();
  const propertyRowsByPropertyId = new Map<string, SearchInRadiusPropertyRow>();
  const consolidatedOraclePropertyCache = new Map<string, OraclePropertyRecord>();
  const CONSOLIDATED_PROPERTY_TIMEOUT_MS = 8_000;
  const leadRecordRepository =
    options.leadRecordRepository ??
    createDynamoDbLeadRecordRepository({
      tableName: leadRecordTableName as string,
    });

  const listPropertiesInBoundingBox =
    createQueryPropertiesInBoundingBoxLoader(elephantMcpToolClient);
  const loadQueryPropertyRowById =
    createQueryPropertyRowByIdLoader(elephantMcpToolClient);

  /**
   * Loads bbox rows from the OpenSearch RAG corpus when live MCP fails.
   *
   * Serves the last-indexed snapshot so pin→radius→list survives cold DuckDB
   * starts and Elephant MCP outages instead of returning a 500.
   */
  const loadIndexedFallbackPropertyRows = async (arguments_: {
    county: string;
    boundingBox: {
      minLat: number;
      minLng: number;
      maxLat: number;
      maxLng: number;
    };
    center: { lat: number; lng: number };
  }): Promise<SearchInRadiusPropertyRow[]> => {
    if (process.env["OPENSEARCH_ENDPOINT"] === undefined) {
      return [];
    }
    const [{ createOpenSearchClient }, { createIndexedSearchPropertyRowLoader }] =
      await Promise.all([
        import("./rag/opensearch-retrieval-index.js"),
        import("./rag/search-property-rows-from-index.js"),
      ]);
    const loadRowsFromIndex = createIndexedSearchPropertyRowLoader(
      createOpenSearchClient(),
    );
    return loadRowsFromIndex(arguments_);
  };

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
    let propertyRows: SearchInRadiusPropertyRow[];
    try {
      propertyRows = await listPropertiesInBoundingBox({
        county: arguments_.county,
        boundingBox: arguments_.boundingBox,
        center: arguments_.center,
      });
    } catch (liveMcpError) {
      let fallbackRows: SearchInRadiusPropertyRow[];
      try {
        fallbackRows = await loadIndexedFallbackPropertyRows(arguments_);
      } catch {
        throw liveMcpError;
      }
      if (fallbackRows.length === 0) {
        throw liveMcpError;
      }
      lambdaAppRouterLogger.warn("search.inRadius.servedFromIndexedCorpus", {
        county: arguments_.county,
        rowCount: fallbackRows.length,
        liveMcpError:
          liveMcpError instanceof Error ? liveMcpError.message : String(liveMcpError),
      });
      propertyRows = fallbackRows;
    }
    for (const propertyRow of propertyRows) {
      propertyRowsByPropertyId.set(propertyRow.propertyId, propertyRow);
    }
    return propertyRows;
  };

  const loadOfficialPublishedCountyCatalog = async (): Promise<unknown> =>
    parseElephantMcpToolJson(
      await elephantMcpToolClient.callTool("listPublishedCounties", {}),
    );

  const listOfficialPublishedCounties = () =>
    listPublishedCountiesFromElephantClient(loadOfficialPublishedCountyCatalog);

  const listServedPublishedCounties = async () =>
    mergeQueryTableServedCountiesIntoCatalog(
      await listOfficialPublishedCounties(),
      ELEPHANT_MCP_SERVER_ENV.PROPERTY_QUERY_TABLE_MAP ?? "{}",
      ELEPHANT_MCP_SERVER_ENV.ORACLE_GEO_INDEX_IPNS_MAP ?? "{}",
    );

  const counties = createCountiesRouter({
    listPublishedCounties: listServedPublishedCounties,
  });

  const searchRouterDependencies = {
    listPropertiesInBoundingBox: rememberPropertyRows,
    listPublishedCounties: listOfficialPublishedCounties,
  };

  const search = createSearchRouter(searchRouterDependencies);

  const loadOraclePropertyRecord = async ({
    county,
    propertyId,
  }: {
    county: string;
    propertyId: string;
  }): Promise<OraclePropertyRecord> => {
    const cachedPropertyRow = propertyRowsByPropertyId.get(propertyId);
    if (cachedPropertyRow !== undefined) {
      return mapSearchPropertyRowToOraclePropertyRecord(cachedPropertyRow);
    }

    const queryPropertyRow = await loadQueryPropertyRowById({
      county,
      propertyId,
    });
    if (queryPropertyRow !== null) {
      propertyRowsByPropertyId.set(propertyId, queryPropertyRow);
      return mapSearchPropertyRowToOraclePropertyRecord(queryPropertyRow);
    }

    const raw = await elephantMcpToolClient.callTool("getOracleProperty", {
      county,
      propertyId,
    });
    return mapElephantOraclePropertyPayload(parseElephantMcpToolJson(raw), propertyId);
  };

  const loadConsolidatedOraclePropertyRecord = async ({
    county,
    propertyId,
  }: {
    county: string;
    propertyId: string;
  }): Promise<OraclePropertyRecord | null> => {
    const cacheKey = `${county.trim().toLowerCase()}:${propertyId}`;
    const cached = consolidatedOraclePropertyCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const consolidatedRecord = await loadWithTimeout(
        (async () => {
          const raw = await elephantMcpToolClient.callTool("getOracleProperty", {
            county,
            propertyId,
          });
          return mapElephantOraclePropertyPayload(
            parseElephantMcpToolJson(raw),
            propertyId,
          );
        })(),
        CONSOLIDATED_PROPERTY_TIMEOUT_MS,
      );
      consolidatedOraclePropertyCache.set(cacheKey, consolidatedRecord);
      return consolidatedRecord;
    } catch {
      return null;
    }
  };

  const loadPermitRecordsForProperty = async ({
    county,
    propertyId,
    parcelIdentifier,
  }: {
    county: string;
    propertyId: string;
    parcelIdentifier: string | null;
  }): Promise<OraclePropertyPermitRecord[]> => {
    const sql = buildQueryPermitsSqlForProperty({
      propertyId,
      parcelIdentifier,
      county,
    });
    const raw = parseElephantMcpToolJson(
      await elephantMcpToolClient.callTool("queryPermits", {
        county,
        sql,
        limit: 50,
      }),
    );
    return parseQueryPermitViewRows(raw).map((row) =>
      mapQueryPermitViewRowToOraclePropertyPermitRecord(row, { county }),
    );
  };

  /**
   * Recomputes permit signals (open years + provenance) for leads.create.
   *
   * A failed permit lookup must not block converting the lead — the score
   * simply lacks the permit component, which is the honest fallback.
   */
  const loadLeadPermitSignals = async (arguments_: {
    countyKey: string;
    propertyId: string;
    parcelIdentifier: string | null;
    permitIds: string[] | undefined;
    /** Published has-permits flag; false skips the lookup entirely. */
    rowHasPermits?: boolean | null;
  }): Promise<LeadPermitSignals> => {
    // When the client named no permits but the published row says the parcel
    // has none, the empty snapshot is the honest answer — skip the lookup.
    const clientNamedPermits =
      arguments_.permitIds !== undefined && arguments_.permitIds.length > 0;
    if (!clientNamedPermits && arguments_.rowHasPermits === false) {
      return EMPTY_LEAD_PERMIT_SIGNALS;
    }
    try {
      const permitRecords = await loadPermitRecordsForProperty({
        county: arguments_.countyKey,
        propertyId: arguments_.propertyId,
        parcelIdentifier: arguments_.parcelIdentifier,
      });
      return resolveLeadPermitSignalsFromPermitRecords({
        permitRecords,
        permitIds: arguments_.permitIds ?? [],
        currentUtcYear: new Date().getUTCFullYear(),
      });
    } catch (permitLookupError) {
      lambdaAppRouterLogger.warn("leads.create.permitSignalsUnavailable", {
        countyKey: arguments_.countyKey,
        propertyId: arguments_.propertyId,
        errorMessage:
          permitLookupError instanceof Error
            ? permitLookupError.message
            : String(permitLookupError),
      });
      return EMPTY_LEAD_PERMIT_SIGNALS;
    }
  };

  const properties = createPropertiesRouter({
    getOracleProperty: loadOraclePropertyRecord,
    getPermitQuerySchema: async ({ county }) =>
      parseElephantMcpToolJson(
        await elephantMcpToolClient.callTool("getPermitQuerySchema", {
          county,
        }),
      ),
    queryPermits: loadPermitRecordsForProperty,
    loadConsolidatedOracleProperty: loadConsolidatedOraclePropertyRecord,
    consolidatedPropertyTimeoutMs: CONSOLIDATED_PROPERTY_TIMEOUT_MS,
  });

  const leads = createLeadsRouter({
    leadRecordRepository,
    loadLeadRecordCreateSnapshot: async ({ propertyId, countyKey, permitIds }) => {
      const propertyRow = propertyRowsByPropertyId.get(propertyId);
      if (propertyRow !== undefined) {
        const permitSignals = await loadLeadPermitSignals({
          countyKey,
          propertyId,
          parcelIdentifier: propertyRow.parcelIdentifier,
          permitIds,
          rowHasPermits: propertyRow.hasPermits,
        });
        return buildLeadRecordCreateSnapshotFromSearchPropertyRow({
          countyKey,
          propertyRow,
          permitIds,
          permitSignals,
          currentUtcYear: new Date().getUTCFullYear(),
        });
      }

      const oraclePropertyRecord = await loadOraclePropertyRecord({
        county: countyKey,
        propertyId,
      });
      const permitSignals = await loadLeadPermitSignals({
        countyKey,
        propertyId,
        parcelIdentifier: oraclePropertyRecord.parcelIdentifier ?? null,
        permitIds,
        rowHasPermits: oraclePropertyRecord.hasPermits ?? null,
      });
      return buildLeadRecordCreateSnapshotFromOraclePropertyRecord({
        countyKey,
        oraclePropertyRecord,
        permitIds,
        permitSignals,
        currentUtcYear: new Date().getUTCFullYear(),
      });
    },
    generateLeadRecordId: generateUlidLeadRecordId,
    nowIso: options.nowIso ?? (() => new Date().toISOString()),
  });

  const agent = createAgentRouter({
    runAsk: async (input) => {
      try {
        const roofingOpportunityAgentDependencies =
          await createRoofingOpportunityAgentDependencies(searchRouterDependencies, {
            resolveMapSearchReady: (county) =>
              resolveMapSearchReadyForCountyKey(county, listServedPublishedCounties),
          });
        const { runRoofingOpportunityAgent } =
          await import("./rag/run-roofing-opportunity-agent.js");
        return await runRoofingOpportunityAgent(
          input,
          roofingOpportunityAgentDependencies,
        );
      } catch (error) {
        if (process.env["OPENSEARCH_ENDPOINT"] !== undefined) {
          throw error;
        }
        const mapSearchReady = await resolveMapSearchReadyForCountyKey(
          input.county,
          listServedPublishedCounties,
        );
        return buildAgentAskNotIndexedResponse(input, mapSearchReady);
      }
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
