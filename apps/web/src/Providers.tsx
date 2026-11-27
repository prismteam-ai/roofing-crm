import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { TRPCProvider, type ApiClient } from './lib/api.js';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Failures surface at once with a Retry button; silent retries would only delay the message.
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}

export function Providers({ client, children }: { client: ApiClient; children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
