import { z } from "zod";

const Env = z.object({
  ORACLE_API_URL: z.url(),
  ORACLE_MCP_URL: z.url(),
  /** The one published Oracle run this CRM reads; a different run served is a mismatch. */
  ORACLE_MANIFEST_CID: z.string().regex(/^b[a-z2-7]{20,}$/, "a CIDv1 (base32)"),
  LEADS_TABLE: z.string().min(1).default("roofing-crm-leads"),
  DYNAMODB_ENDPOINT: z.url().optional(),
  LEAD_CREATES_PER_DAY: z.coerce.number().int().positive().default(200),
  PORT: z.coerce.number().int().positive().default(4318),
  /** Agent: the key directly (local) or the SSM SecureString parameter that holds it (hosted). */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY_PARAM: z.string().min(1).optional(),
  CRM_AGENT_MODEL: z.string().min(1).default("claude-opus-5-5"),
  AGENT_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(2_000_000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** Origins allowed to call the API with credentials (the Amplify domain when hosted). */
  ALLOWED_ORIGINS: z.string().default(""),
});
export type Env = z.infer<typeof Env>;

/** Validated environment; empty values count as unset. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const r = Env.safeParse(cleaned);
  if (!r.success) {
    const keys = [...new Set(r.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`invalid environment: ${keys.join(", ")} (see .env.example)`);
  }
  return r.data;
}
