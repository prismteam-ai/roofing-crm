import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { DatasetSummary, PropertyDetail, SearchInput } from '@roofing-crm/shared';
import type { z } from 'zod';
import {
  datasetSummarySchema,
  oracleQuerySchema,
  oracleSearchSchema,
  propertyDetailSchema,
  type OraclePort,
  type OracleQuery,
  type OracleSearch,
} from '../ports.js';

/** Tool names exposed by the Oracle pipeline's MCP server (`POST /mcp`, stateless streamable HTTP). */
export const ORACLE_TOOLS = {
  findRoofingLeads: 'findRoofingLeads',
  getOracleProperty: 'getOracleProperty',
  getAtlasDatasetInfo: 'getAtlasDatasetInfo',
  getAtlasSchema: 'getAtlasSchema',
  queryAtlas: 'queryAtlas',
} as const;

export class OracleUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OracleUnavailableError';
  }
}

interface ToolResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
}

function firstText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      part.type === 'text' &&
      'text' in part &&
      typeof part.text === 'string'
    ) {
      return part.text;
    }
  }
  return null;
}

/**
 * OraclePort backed by the pipeline's MCP endpoint. Every response is validated against the
 * shared schema before it enters the CRM, so a pipeline change fails here, loudly, and not as
 * a blank map later.
 *
 * Boundary note (external-dependency rule): these are interactive reads with bounded volume, so
 * the call is synchronous with a hard timeout; the caller surfaces a clear "data service
 * unavailable" state. Nothing here has side effects, so there is nothing to queue.
 */
export class McpOraclePort implements OraclePort {
  private client: Client | null = null;

  constructor(
    private readonly endpoint: string,
    private readonly timeoutMs = 12_000,
  ) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const client = new Client({ name: 'roofing-crm-api', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(this.endpoint)));
    this.client = client;
    return client;
  }

  private async call<S extends z.ZodTypeAny>(
    tool: string,
    args: Record<string, unknown>,
    schema: S,
  ): Promise<z.infer<S>> {
    let result: ToolResult;
    try {
      const client = await this.connect();
      result = (await client.callTool({ name: tool, arguments: args }, undefined, {
        timeout: this.timeoutMs,
      })) as ToolResult;
    } catch (cause) {
      this.client = null;
      throw new OracleUnavailableError(`Oracle MCP call ${tool} failed`, { cause });
    }
    if (result.isError) {
      throw new OracleUnavailableError(
        `Oracle MCP tool ${tool} returned an error: ${firstText(result.content) ?? 'no detail'}`,
      );
    }
    let payload: unknown = result.structuredContent;
    if (payload === undefined) {
      const text = firstText(result.content);
      if (text === null)
        throw new OracleUnavailableError(`Oracle MCP tool ${tool} returned no content`);
      payload = JSON.parse(text) as unknown;
    }
    return schema.parse(payload) as z.infer<S>;
  }

  searchLeads(input: SearchInput): Promise<OracleSearch> {
    return this.call(ORACLE_TOOLS.findRoofingLeads, { ...input }, oracleSearchSchema);
  }

  async getProperty(apn: string): Promise<PropertyDetail | null> {
    const wrapped = await this.call(
      ORACLE_TOOLS.getOracleProperty,
      { apn },
      propertyDetailSchema.nullable(),
    );
    return wrapped;
  }

  datasetSummary(): Promise<DatasetSummary> {
    return this.call(ORACLE_TOOLS.getAtlasDatasetInfo, {}, datasetSummarySchema);
  }

  private schemaText: string | null = null;

  /** The schema changes only when a new run is published, so one fetch per container is enough. */
  async schema(): Promise<string> {
    if (this.schemaText !== null) return this.schemaText;
    let result: ToolResult;
    try {
      const client = await this.connect();
      result = (await client.callTool(
        { name: ORACLE_TOOLS.getAtlasSchema, arguments: {} },
        undefined,
        { timeout: this.timeoutMs },
      )) as ToolResult;
    } catch (cause) {
      this.client = null;
      throw new OracleUnavailableError('Oracle MCP call getAtlasSchema failed', { cause });
    }
    this.schemaText = firstText(result.content) ?? JSON.stringify(result.structuredContent ?? {});
    return this.schemaText;
  }

  query(sql: string): Promise<OracleQuery> {
    return this.call(ORACLE_TOOLS.queryAtlas, { sql }, oracleQuerySchema);
  }
}
