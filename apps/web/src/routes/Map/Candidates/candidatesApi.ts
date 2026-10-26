// The only place the Candidate list and Field triage touch the tRPC client. They read the SAME
// `search.properties` / `search.permits` queries the map makes (identical inputs, so React Query
// shares one cache entry and switching Map ↔ List ↔ Triage costs no extra call), plus the
// lead presence (`leads.presence`, every assignee) for the "Lead · {status}" mark (E-52). Components call these hooks; tests
// mock this module.
import type { ApiInputs, ApiOutputs } from "@crm/api-client";
import { useTRPC, useTRPCClient } from "@crm/api-client/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { isAlreadyExists, toCreateInput } from "../../Leads/LeadCreateAction.js";
import { addCreatedLead, removeUndoneLead } from "../../Leads/leadsListCache.js";
import { runBulkCreateMany, type BulkOutcome } from "./bulkCreate.js";
import { runUndoMany, type UndoAnswer, type UndoTally } from "./undoCopy.js";
import { LEAD_PRESENCE_LIMIT, LEAD_PRESENCE_MAX_CALLS, useLeadMarks } from "./useLeadMarks.js";
import {
  buildCandidates,
  type Candidate,
  permitQueryInput,
  propertiesSearchInput,
  type CandidateFilters,
  type LeadsReason,
} from "./candidates.js";

export type CreatedLead = ApiOutputs["leads"]["create"];
export type LeadCreateInput = ApiInputs["leads"]["create"];
export type CreatedFrom = LeadCreateInput["createdFrom"];
export type PropertyDetailOutput = ApiOutputs["property"]["get"];

export { LEAD_PRESENCE_LIMIT, LEAD_PRESENCE_MAX_CALLS };

export type CandidatesStatus = "idle" | "loading" | "error" | "ready";

export interface CandidatesResult {
  readonly status: CandidatesStatus;
  /** Joined, unsorted candidates (empty until ready). */
  readonly candidates: readonly Candidate[];
  /** Properties in the ring before the permit filter (the header's "{n} within …"). */
  readonly totalInRing: number;
  /** The server's count of permits in range, before its 500-row page (never the page length). */
  readonly permitTotal: number;
  /** The server clipped the permits to its page: say so. */
  readonly permitsTruncated: boolean;
  /** The server has more properties than the page it returned (nearest first). */
  readonly propertiesTruncated: boolean;
  /** Properties in the page that came back. */
  readonly propertiesShown: number;
  /** search.permits failed: rows still show, without permit signals (partial). */
  readonly permitsUnavailable: boolean;
  /** leads.presence failed or the ring was too large to mark in full: marks may be missing; create still refuses duplicates server-side. */
  readonly leadsUnavailable: boolean;
  /** Why (null when the marks are all there): the read failed, or the ring has over 1,000 properties. */
  readonly leadsReason: LeadsReason | null;
  readonly refetch: () => void;
}

export function useCandidates(filters: CandidateFilters): CandidatesResult {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { center, radiusMi, roofAgeMinYears, tenureYearsMin, outOfArea } = filters;
  // Exactly the map's input shape (Map.tsx `searchInput`), so the cache entry is shared.
  const properties = useQuery({
    ...trpc.search.properties.queryOptions(
      center === null
        ? { center: { lat: 0, lng: 0 }, radiusMi }
        : propertiesSearchInput(
            center,
            radiusMi,
            roofAgeMinYears,
            tenureYearsMin,
            outOfArea,
            filters.permitStatus,
            filters.permitOpenYrs,
          ),
    ),
    enabled: center !== null,
  });
  const permits = useQuery({
    ...trpc.search.permits.queryOptions(
      permitQueryInput(center, radiusMi, filters.permitStatus, filters.permitOpenYrs),
    ),
    enabled: center !== null,
  });
  // Lead marks for every property in the ring, whoever owns the lead (shared with the map layer).
  const lead = useLeadMarks(properties.data?.properties ?? []);

  const candidates = useMemo(() => {
    if (properties.data === undefined) return [];
    return buildCandidates(
      properties.data.properties,
      permits.data?.permits ?? [],
      lead.marks,
      filters,
    );
  }, [properties.data, permits.data, lead.marks, filters]);

  const refetch = useCallback(() => {
    void properties.refetch();
    void permits.refetch();
    void queryClient.refetchQueries({ queryKey: trpc.leads.presence.queryKey() });
  }, [properties, permits, queryClient, trpc]);

  let status: CandidatesStatus = "ready";
  if (center === null) status = "idle";
  else if (properties.isError) status = "error";
  // Wait for permits too when a permit filter narrows the list, or the rows would jump.
  else if (properties.isPending || (permits.isPending && !permits.isError)) status = "loading";

  return {
    status,
    candidates,
    // The server's count of matches, not the page's length (an older reply without counts falls
    // back to the rows it has).
    totalInRing: properties.data?.counts?.afterRoofAge ?? properties.data?.properties.length ?? 0,
    propertiesShown: properties.data?.properties.length ?? 0,
    propertiesTruncated:
      (properties.data?.counts?.afterRoofAge ?? 0) > (properties.data?.properties.length ?? 0),
    permitTotal: permits.data?.total ?? permits.data?.permits.length ?? 0,
    permitsTruncated: permits.data?.truncated === true,
    permitsUnavailable: permits.isError,
    leadsUnavailable: lead.unavailable,
    leadsReason: lead.reason,
    refetch,
  };
}

/** One property's detail (`property.get`): BBB state and "near {place}" for the triage card.
 *  Same query key as the map's drawer, so opening details after a card costs no extra call. */
export function usePropertyDetail(propertyCid: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.property.get.queryOptions({ propertyCid: propertyCid ?? "" }),
    enabled: propertyCid !== null,
  });
}

/** The `leads.create` input for a candidate, with its origin (List or Map); null without a
 *  published location (the server needs lat/lon). */
export function candidateCreateInput(
  candidate: Candidate,
  createdFrom: CreatedFrom,
): LeadCreateInput | null {
  const input = toCreateInput(
    candidate.property,
    candidate.permits,
    candidate.mainPermit ?? undefined,
  );
  return input === null ? null : { ...input, createdFrom };
}

export { isAlreadyExists };

/** Refreshes everything that shows lead presence: the marks here and the Leads list. */
function useRefreshLeadPresence(): () => Promise<void> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.leads.presence.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.leads.list.queryKey() }),
    ]);
  }, [queryClient, trpc]);
}

/** One-tap create (triage). The lead goes into the cached Leads list at once; lead presence is
 *  refreshed in the background once it settles (not awaited, so the next card is not held up). */
export function useCreateCandidateLead() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshLeadPresence();
  return useMutation({
    ...trpc.leads.create.mutationOptions(),
    onSuccess: (lead) => addCreatedLead(queryClient, trpc.leads.list.queryKey(), lead),
    onSettled: () => {
      void refresh();
    },
  });
}

export type UndoCreateOutput = ApiOutputs["leads"]["undoCreate"];

/** Undo of ONE lead this person just created (`leads.undoCreate`). Refreshes presence when it
 *  settles, so a removed lead's mark disappears. */
export function useUndoCreateLead() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshLeadPresence();
  return useMutation({
    ...trpc.leads.undoCreate.mutationOptions(),
    // Deleted: out of the cached Leads list at once. Refused: the list is left as it is.
    onSuccess: (answer, vars) => {
      if (answer.deleted) removeUndoneLead(queryClient, trpc.leads.list.queryKey(), vars.leadKey);
    },
    onSettled: refresh,
  });
}

/** Undo of the leads one bulk create made (and only those): at most 2 calls in flight. */
export function useUndoCreatedLeads() {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshLeadPresence();
  return useCallback(
    async (leads: readonly { leadKey: string; leadId: string }[]): Promise<UndoTally> => {
      try {
        return await runUndoMany(leads, async (lead): Promise<UndoAnswer> => {
          const answer = await client.leads.undoCreate.mutate(lead);
          // Deleted: out of the cached Leads list at once.
          if (answer.deleted)
            removeUndoneLead(queryClient, trpc.leads.list.queryKey(), lead.leadKey);
          return answer;
        });
      } finally {
        await refresh();
      }
    },
    [client, trpc, queryClient, refresh],
  );
}

export interface BulkState {
  readonly running: boolean;
  readonly done: number;
  readonly total: number;
}

/** Bulk create through `leads.createMany` (25 per call); presence is refreshed once, at the end. */
export function useBulkCreateLeads() {
  const client = useTRPCClient();
  const refresh = useRefreshLeadPresence();
  const [state, setState] = useState<BulkState>({ running: false, done: 0, total: 0 });

  const run = useCallback(
    async (
      items: readonly { id: string; input: LeadCreateInput }[],
    ): Promise<BulkOutcome<{ leadKey: string; leadId: string }>> => {
      setState({ running: true, done: 0, total: items.length });
      try {
        return await runBulkCreateMany(
          items,
          (inputs) => client.leads.createMany.mutate({ items: inputs }),
          (done, total) => setState({ running: true, done, total }),
        );
      } finally {
        setState((s) => ({ ...s, running: false }));
        await refresh();
      }
    },
    [client, refresh],
  );
  return { run, state };
}
