import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().default(8080),
  OPENAI_API_KEY: z.string().optional(),
  PIPELINE_MCP_URL: z.string().url().optional().or(z.literal('')),
  MCP_HTTP_AUTH_TOKEN: z.string().optional(),
  LEADS_DB_PATH: z.string().default('data/leads.sqlite'),
  TRACE_DIR: z.string().default('data/traces'),
  LOG_LEVEL: z.string().default('info'),
  WEB_DIST: z.string().default('../web/dist'),
  FIXTURE_DIR: z.string().optional(),
  AGENT_MODE: z.enum(['auto', 'offline']).default('auto'),
});
export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const env = envSchema.parse(raw);
  return {
    ...env,
    PIPELINE_MCP_URL: env.PIPELINE_MCP_URL || undefined,
    OPENAI_API_KEY: env.OPENAI_API_KEY || undefined,
  };
}
