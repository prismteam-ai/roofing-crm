/**
 * Shared typed client for the CRM leads API (tRPC v11: queries over GET, mutations over POST).
 * The CRM app uses this; it never builds its own client. The URL is absolute (from config.json).
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@roofing-crm/leads-api/router";

export type { AppRouter };
export * from "@roofing-crm/leads-api/schema";

export interface LeadsClientOptions {
  /** Absolute leads API base URL (RoofingCrmLeads output LeadsApiUrl). */
  leadsApiUrl: string;
  /** The CRM's Bearer token (the same token as the data API). */
  apiToken: string;
}

export function createLeadsClient({
  leadsApiUrl,
  apiToken,
}: LeadsClientOptions) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: new URL("/trpc", leadsApiUrl).toString(),
        maxURLLength: 2000,
        headers: () => ({ authorization: `Bearer ${apiToken}` }),
      }),
    ],
  });
}
export type LeadsClient = ReturnType<typeof createLeadsClient>;
