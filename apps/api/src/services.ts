import { randomUUID } from 'node:crypto';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { LanguageModel } from 'ai';
import type { Services } from './context.js';
import { McpOraclePort } from './data/mcpOraclePort.js';
import { DynamoLeadStore, MemoryLeadStore } from './leads/leadStores.js';

export interface Env {
  ORACLE_MCP_URL?: string;
  LEADS_TABLE?: string;
  AGENT_PROVIDER?: string;
  AGENT_MODEL?: string;
  /** Local development only. In AWS the key is read from SSM (AGENT_KEY_PARAMETER). */
  ANTHROPIC_API_KEY?: string;
  AGENT_KEY_PARAMETER?: string;
  AWS_REGION?: string;
}

export interface ModelChoice {
  model: LanguageModel | null;
  modelName: string;
}

const NO_MODEL: ModelChoice = { model: null, modelName: 'none' };

/**
 * Model choice is configuration, not code: both providers sit behind the Vercel AI SDK, so
 * swapping vendor is an environment change. No key and no Bedrock setting means no agent.
 */
export function resolveModel(env: Env, apiKey: string | undefined): ModelChoice {
  const provider = env.AGENT_PROVIDER ?? (apiKey ? 'anthropic' : 'none');
  if (provider === 'anthropic' && apiKey) {
    const modelName = env.AGENT_MODEL ?? 'claude-sonnet-5-5';
    return { model: createAnthropic({ apiKey })(modelName), modelName };
  }
  if (provider === 'bedrock' && env.AGENT_MODEL) {
    return {
      model: createAmazonBedrock({ region: env.AWS_REGION ?? 'us-east-2' })(env.AGENT_MODEL),
      modelName: env.AGENT_MODEL,
    };
  }
  return NO_MODEL;
}

/** Reads the model key from SSM SecureString. The key never sits in code, env files or logs. */
export async function loadAgentKey(env: Env, ssm: SSMClient = new SSMClient({})): Promise<string | undefined> {
  if (env.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY;
  if (!env.AGENT_KEY_PARAMETER || env.AGENT_PROVIDER === 'bedrock') return undefined;
  try {
    const out = await ssm.send(
      new GetParameterCommand({ Name: env.AGENT_KEY_PARAMETER, WithDecryption: true }),
    );
    return out.Parameter?.Value;
  } catch {
    // Missing parameter: the agent reports "not configured"; the rest of the CRM keeps working.
    return undefined;
  }
}

export async function buildServices(env: Env): Promise<Services> {
  if (!env.ORACLE_MCP_URL) {
    throw new Error('ORACLE_MCP_URL is required: the CRM reads data only through the Oracle MCP.');
  }
  return {
    oracle: new McpOraclePort(env.ORACLE_MCP_URL),
    leads: env.LEADS_TABLE ? new DynamoLeadStore(env.LEADS_TABLE) : new MemoryLeadStore(),
    ...resolveModel(env, await loadAgentKey(env)),
    now: () => new Date(),
    newId: () => randomUUID(),
  };
}
