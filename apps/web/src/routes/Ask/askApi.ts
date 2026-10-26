// B-09 T039: the only place the Ask screen touches the shared tRPC client (packages/api-client).
// `agent.ask` is a mutation, not a query, because each question is an explicit rep action, not a
// cacheable GET (contracts/agent-api.md). `agent.confirmLead` is the separate, non-model-invoked
// mutation that is the only path to `LeadService.create` (contracts/agent-api.md "Not
// model-invoked") — the Ask screen calls it only from an explicit rep click, never automatically
// on receiving a proposal.
//
// CR-B-09 finding 19: typed by the real `AppRouter` through `useTRPC()` (the `agent` router is mounted
// in apps/api/src/routers/index.ts) — no structural double cast, so a contract change on
// the server is a type error here.
import { useTRPC } from "@crm/api-client/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { removeUndoneLead } from "../Leads/leadsListCache.js";

/** The promoted run the answers cite (the composer's "answers cite CountyLens run {n}" line). The
 *  same `shell.indexInfo` query the top bar's data chip reads, so it shares that cache entry. */
export function useRunInfo() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.shell.indexInfo.queryOptions(), staleTime: 5 * 60_000 });
}

export function useAskAgent() {
  const trpc = useTRPC();
  return useMutation(trpc.agent.ask.mutationOptions());
}

export function useConfirmLead() {
  const trpc = useTRPC();
  return useMutation(trpc.agent.confirmLead.mutationOptions());
}

/** Undo of the one lead this screen just created (`leads.undoCreate`): the same call and refusal
 *  wording as the candidate list and triage (`routes/Map/Candidates/undoCopy.ts`). A refusal comes
 *  back as `{ deleted: false, reason }`, an outcome to explain rather than an error. */
export function useUndoCreate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.leads.undoCreate.mutationOptions(),
    onSuccess: (answer, vars) => {
      if (answer.deleted) removeUndoneLead(queryClient, trpc.leads.list.queryKey(), vars.leadKey);
    },
  });
}

/** The bulk "Create leads for all n" (`agent.confirmLeads`): only tcadIds this thread proposed.
 *  Typed straight from the router. A duplicate is a per-item result, never an error. */
export function useConfirmLeads() {
  const trpc = useTRPC();
  return useMutation(trpc.agent.confirmLeads.mutationOptions());
}

/** Undo of the leads one bulk create made (and only those); the candidate list's own hook. */
export { useUndoCreatedLeads } from "../Map/Candidates/candidatesApi.js";
