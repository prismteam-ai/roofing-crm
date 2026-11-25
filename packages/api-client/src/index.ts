import { createTRPCClient, httpBatchLink, type TRPCClient, type TRPCLink } from '@trpc/client';
import type { AppRouter } from '@roofing-crm/api';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { getWorkspaceId } from './workspace.js';

export type { AppRouter };
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type ApiClient = TRPCClient<AppRouter>;
export type ApiLink = TRPCLink<AppRouter>;

export { getWorkspaceId, resetWorkspaceIdCache } from './workspace.js';
export { TRPCClientError } from '@trpc/client';

export interface ApiClientOptions {
  /** Base URL of the tRPC API, normally `import.meta.env.VITE_API_URL`. */
  url: string;
  /** Replace the network link, e.g. with an in-memory link in tests. */
  links?: ApiLink[];
}

/** The one place a tRPC client is built. Apps import this; they never build their own. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  return createTRPCClient<AppRouter>({
    links: options.links ?? [
      httpBatchLink({
        url: options.url.replace(/\/+$/, ''),
        headers: () => ({ 'x-workspace-id': getWorkspaceId() }),
      }),
    ],
  });
}
