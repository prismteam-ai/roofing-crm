import { randomUUID } from 'node:crypto';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import type { Services } from './context.js';
import { McpOraclePort } from './data/mcpOraclePort.js';
import { DynamoLeadStore, MemoryLeadStore } from './leads/leadStores.js';

export interface Env {
  ORACLE_MCP_URL?: string;
  LEADS_TABLE?: string;
  AGENT_PROVIDER?: string;
  AGENT_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  AWS_REGION?: string;
}

/**
 * Model choice is configuration, not code: both providers sit behind the Vercel AI SDK, so
 * swapping vendor is an environment change. No key and no Bedrock setting means no agent.
 */
export function resolveModel(env: Env): { model: LanguageModel | null; modelName: string } {
  const provider = env.AGENT_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'none');
  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
    const modelName = env.AGENT_MODEL ?? 'claude-sonnet-5-5';
    return { model: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(modelName), modelName };
  }
  if (provider === 'bedrock') {
    const modelName = env.AGENT_MODEL ?? 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
    return {
      model: createAmazonBedrock({ region: env.AWS_REGION ?? 'us-east-2' })(modelName),
      modelName,
    };
  }
  return { model: null, modelName: 'none' };
}

export function buildServices(env: Env): Services {
  if (!env.ORACLE_MCP_URL) {
    throw new Error('ORACLE_MCP_URL is required: the CRM reads data only through the Oracle MCP.');
  }
  return {
    oracle: new McpOraclePort(env.ORACLE_MCP_URL),
    leads: env.LEADS_TABLE ? new DynamoLeadStore(env.LEADS_TABLE) : new MemoryLeadStore(),
    ...resolveModel(env),
    now: () => new Date(),
    newId: () => randomUUID(),
  };
}
