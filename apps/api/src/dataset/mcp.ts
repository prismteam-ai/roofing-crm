import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import pLimit from 'p-limit';
import type { z } from 'zod';
import { logger } from '../logger.js';
import { withRetry } from '../retry.js';
import { mcpTools, type DatasetClient, type FindPropertiesInput } from './client.js';

type ToolName = keyof typeof mcpTools;

/** DatasetClient over the pipeline MCP server (streamable HTTP + bearer token). */
export class McpDatasetClient implements DatasetClient {
  readonly kind = 'mcp' as const;
  private client: Client | null = null;
  private readonly limit = pLimit(4);

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const client = new Client({ name: 'roofing-crm-api', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(this.url), {
      requestInit: { headers: { Authorization: `Bearer ${this.token}` } },
    });
    await client.connect(transport);
    client.onclose = () => {
      this.client = null;
    };
    this.client = client;
    return client;
  }

  async call<N extends ToolName>(
    name: N,
    input: z.input<(typeof mcpTools)[N]['input']>,
  ): Promise<z.infer<(typeof mcpTools)[N]['output']>> {
    const args = mcpTools[name].input.parse(input);
    return this.limit(() =>
      withRetry(
        async () => {
          const client = await this.connect();
          const res = await client.callTool({ name, arguments: args });
          if (res.isError)
            throw new Error(
              `MCP tool ${name} failed: ${JSON.stringify(res.content).slice(0, 500)}`,
            );
          const payload = res.structuredContent ?? parseTextContent(res.content);
          return mcpTools[name].output.parse(payload);
        },
        {
          retries: 2,
          onRetry: (err, attempt) => {
            this.client = null;
            logger.warn({ tool: name, attempt, err: String(err) }, 'mcp retry');
          },
        },
      ),
    );
  }

  findProperties(input: FindPropertiesInput) {
    return this.call('findProperties', input);
  }
  getProperty(pin14: string) {
    return this.call('getProperty', { pin14 });
  }
  queryDataset(sql: string, limit = 100) {
    return this.call('queryDataset', { sql, limit });
  }
  async getDatasetInfo() {
    return { ...(await this.call('getDatasetInfo', {})), client: 'mcp' as const };
  }
}

function parseTextContent(content: unknown): unknown {
  if (!Array.isArray(content)) throw new Error('MCP tool returned no content');
  const text = content.find((c: { type?: string }) => c?.type === 'text') as
    { text?: string } | undefined;
  if (!text?.text) throw new Error('MCP tool returned no text content');
  return JSON.parse(text.text);
}
