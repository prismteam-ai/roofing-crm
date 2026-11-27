import { z } from "zod";

const Env = z.object({
  ORACLE_API_URL: z.url(),
  ORACLE_MCP_URL: z.url(),
  /** The one published Oracle run this CRM reads; a different run served is a mismatch. */
  ORACLE_MANIFEST_CID: z.string().regex(/^b[a-z2-7]{20,}$/, "a CIDv1 (base32)"),
  LEADS_TABLE: z.string().min(1).default("roofing-crm-leads"),
  DYNAMODB_ENDPOINT: z.url().optional(),
  PORT: z.coerce.number().int().positive().default(4318),
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
