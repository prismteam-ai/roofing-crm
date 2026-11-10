import { createTRPCClient, httpBatchLink, type TRPCClient } from '@trpc/client';
import type { AppRouter } from '@roofing/api/router';

export type { AppRouter } from '@roofing/api/router';
export type ApiClient = TRPCClient<AppRouter>;

export interface ClientOptions {
  baseUrl?: string;
  workspaceId: string;
  fetch?: typeof fetch;
}

export function createApiClient(opts: ClientOptions): ApiClient {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${opts.baseUrl ?? ''}/trpc`,
        headers: { 'x-workspace-id': opts.workspaceId },
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
      }),
    ],
  });
}

export const WORKSPACE_STORAGE_KEY = 'roofing-crm.workspaceId';

/** Per-browser workspace id, generated once and kept in localStorage. */
export function getOrCreateWorkspaceId(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  random: () => string = () => crypto.randomUUID(),
): string {
  const existing = storage.getItem(WORKSPACE_STORAGE_KEY);
  if (existing) return existing;
  const id = random();
  storage.setItem(WORKSPACE_STORAGE_KEY, id);
  return id;
}
