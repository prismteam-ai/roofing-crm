import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  splitLink,
  type TRPCClient,
  type TRPCLink,
} from '@trpc/client';
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
  /**
   * Optional second URL for `agent.*` calls. API Gateway cuts requests at 30 s and a multi-step
   * agent answer can run longer, so the same Lambda is also reachable through a function URL.
   */
  agentUrl?: string;
  /** Replace the network link, e.g. with an in-memory link in tests. */
  links?: ApiLink[];
}

const trim = (url: string): string => url.replace(/\/+$/, '');
const headers = (): Record<string, string> => ({ 'x-workspace-id': getWorkspaceId() });

/** The one place a tRPC client is built. Apps import this; they never build their own. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const main = httpBatchLink({ url: trim(options.url), headers });
  const network: ApiLink = options.agentUrl
    ? splitLink({
        condition: (op) => op.path.startsWith('agent.'),
        true: httpLink({ url: trim(options.agentUrl), headers }),
        false: main,
      })
    : main;
  return createTRPCClient<AppRouter>({ links: options.links ?? [network] });
}
