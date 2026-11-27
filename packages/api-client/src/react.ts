import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@roofing-crm/api';

/**
 * React Query bindings for the API. `useTRPC()` returns typed `queryOptions` / `mutationOptions`
 * factories; `useTRPCClient()` returns the raw client for imperative calls.
 */
export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
