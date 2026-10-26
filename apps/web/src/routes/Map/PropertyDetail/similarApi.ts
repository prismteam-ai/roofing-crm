// The only place the drawer's "Similar properties" touches the tRPC client (tests mock this
// module). Loaded lazily: `enabled` is false until the section is opened.
import type { ApiOutputs } from "@crm/api-client";
import { useTRPC } from "@crm/api-client/react";
import { useQuery } from "@tanstack/react-query";

export type SimilarOutput = ApiOutputs["search"]["similar"];

export function useSimilarProperties(propertyCid: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.search.similar.queryOptions({ propertyCid, limit: 5 }),
    enabled,
    staleTime: 5 * 60_000,
  });
}
