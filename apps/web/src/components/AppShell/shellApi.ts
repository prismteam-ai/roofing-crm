// The only place the shell touches the shared tRPC client (packages/api-client). The data chip
// reads the promoted run from `shell.indexInfo` — the same pointer every search/property
// response carries — and the Apps menu reads its links from `shell.appLinks` (server config).
// Tests mock this module.
import type { ApiOutputs } from "@crm/api-client";
import { useTRPC } from "@crm/api-client/react";
import { useQuery } from "@tanstack/react-query";

export type ShellIndexInfo = ApiOutputs["shell"]["indexInfo"];
export type ShellAppLinks = ApiOutputs["shell"]["appLinks"];

export function useShellIndexInfo() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.shell.indexInfo.queryOptions(), staleTime: 5 * 60_000 });
}

export function useShellAppLinks() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.shell.appLinks.queryOptions(), staleTime: Infinity });
}
