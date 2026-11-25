import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import type { LanguageModel } from 'ai';
import type { LeadStore, OraclePort, UsageStore } from './ports.js';

export const SERVICE_NAME = 'roofing-crm-api';

export const logger = new Logger({ serviceName: SERVICE_NAME });
export const tracer = new Tracer({ serviceName: SERVICE_NAME });
export const metrics = new Metrics({ serviceName: SERVICE_NAME, namespace: 'RoofingCrm' });

/** Everything a procedure may touch. Built once per cold start, injected in tests. */
export interface Services {
  oracle: OraclePort;
  leads: LeadStore;
  usage: UsageStore;
  /** Daily ceilings on paid agent calls: per browser workspace and for the whole deployment. */
  agentLimits: { perWorkspace: number; total: number };
  /** Null when no model is configured; the agent then says so and never fakes an answer. */
  model: LanguageModel | null;
  modelName: string;
  now: () => Date;
  newId: () => string;
}

export interface Context extends Services {
  workspaceId: string;
  logger: Logger;
  metrics: Metrics;
}

/** Placeholder for calls that carry no workspace id. Read-only data calls accept it; lead and agent calls do not. */
export const PUBLIC_WORKSPACE = 'public';

const WORKSPACE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * No login: each browser sends a random workspace id, which scopes its leads. A missing or
 * malformed id falls back to a shared "public" workspace so a first click still works.
 */
export function workspaceFromHeader(value: string | undefined): string {
  return value !== undefined && WORKSPACE_PATTERN.test(value) ? value : PUBLIC_WORKSPACE;
}

export function buildContext(services: Services, workspaceHeader: string | undefined): Context {
  return { ...services, workspaceId: workspaceFromHeader(workspaceHeader), logger, metrics };
}
