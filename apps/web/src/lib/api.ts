import { createApiClient, getWorkspaceId, type ApiClient } from '@roofing-crm/api-client';

export { TRPCProvider, useTRPC, useTRPCClient } from '@roofing-crm/api-client/react';
export { getWorkspaceId };
export type { ApiClient };

const LOCAL_DEV_API = 'http://localhost:8787';

/** API base URL from the environment; only `vite dev` falls back to the local dev server. */
export function apiUrl(): string | null {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured;
  return import.meta.env.DEV ? LOCAL_DEV_API : null;
}

export function makeApiClient(url: string): ApiClient {
  return createApiClient({ url });
}
