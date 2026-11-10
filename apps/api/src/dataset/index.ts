import type { Env } from '../env.js';
import { logger } from '../logger.js';
import type { DatasetClient } from './client.js';
import { FixtureDatasetClient } from './fixture.js';
import { McpDatasetClient } from './mcp.js';

export * from './client.js';
export { FixtureDatasetClient, filterProperties, loadFixture } from './fixture.js';
export { McpDatasetClient } from './mcp.js';

export function createDatasetClient(env: Env): DatasetClient {
  if (env.PIPELINE_MCP_URL && env.MCP_HTTP_AUTH_TOKEN) {
    logger.info({ url: env.PIPELINE_MCP_URL }, 'dataset: pipeline MCP');
    return new McpDatasetClient(env.PIPELINE_MCP_URL, env.MCP_HTTP_AUTH_TOKEN);
  }
  logger.warn('dataset: PIPELINE_MCP_URL not set, using committed fixture');
  return new FixtureDatasetClient(env.FIXTURE_DIR);
}
