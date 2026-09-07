import { z } from "zod";

/**
 * Server-side environment contract. Parsed lazily so that `next build` and unit tests
 * do not require every variable to be present.
 *
 * @module config/env
 */
const envSchema = z.object({
  ORACLE_MCP_URL: z.string().url().default("http://localhost:8877/mcp"),
  ORACLE_MCP_AUTH_TOKEN: z.string().optional(),
  ORACLE_MCP_COUNTY: z.string().min(1).default("osceola"),
  DATABASE_URL: z.string().min(1).optional(),
  DB_DRIVER: z.enum(["pg", "neon"]).default("pg"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AGENT_MODEL: z.string().min(1).default("claude-sonnet-4-5"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Read and validate `process.env` once per process. */
export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse({
      ...process.env,
      ORACLE_MCP_AUTH_TOKEN: process.env.ORACLE_MCP_AUTH_TOKEN || undefined,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
      DATABASE_URL: process.env.DATABASE_URL || undefined,
    });
    if (!parsed.success) {
      throw new Error(
        `Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

/** True when the assistant can call the model. */
export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
