import type { AppRouter } from "@crm/api/router";
import { createTRPCClient, httpBatchLink, type TRPCLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { inferRouterOutputs } from "@trpc/server";

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
export type Outputs = inferRouterOutputs<AppRouter>;

/** API origin: same origin in development (Vite proxy); the API Gateway URL when hosted. */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function createApiClient(links?: TRPCLink<AppRouter>[]) {
  return createTRPCClient<AppRouter>({
    links: links ?? [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        // The demo workspace cookie (crm_ws) must travel with every call, also cross-origin.
        fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),
      }),
    ],
  });
}
export type ApiClient = ReturnType<typeof createApiClient>;
