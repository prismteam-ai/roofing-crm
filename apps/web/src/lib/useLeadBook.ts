import type { RouterOutputs } from '@roofing-crm/api-client';
import type { Lead, LeadCreate, LeadUpdate } from '@roofing-crm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTRPC, useTRPCClient } from './api.js';
import { describeError } from './format.js';

type LeadList = RouterOutputs['leads']['list'];
type Snapshot = [readonly unknown[], LeadList | undefined][];

export type NoticeKind = 'success' | 'error' | 'info';
export type Notify = (kind: NoticeKind, text: string) => void;

export interface LeadBook {
  /** Every lead in this browser's workspace, newest first. */
  leads: Lead[];
  byApn: Map<string, Lead>;
  isLoading: boolean;
  error: string | null;
  /** APNs with a create call in flight, so their buttons can show progress. */
  pendingApns: ReadonlySet<string>;
  create: (drafts: LeadCreate[]) => Promise<Lead[]>;
  update: (patch: LeadUpdate) => void;
  remove: (leadId: string) => void;
}

function applyPatch(lead: Lead, patch: LeadUpdate): Lead {
  return {
    ...lead,
    status: patch.status ?? lead.status,
    priority: patch.priority ?? lead.priority,
    assignee: patch.assignee === undefined ? lead.assignee : patch.assignee,
    notes: patch.notes ?? lead.notes,
  };
}

/**
 * The CRM's own records. Edits and deletes are optimistic: the table changes at once, and if
 * the API rejects the change the previous rows are put back and the user is told.
 */
export function useLeadBook(notify: Notify): LeadBook {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const listFilter = trpc.leads.list.pathFilter();
  const all = useQuery(trpc.leads.list.queryOptions({}));
  const [pendingApns, setPendingApns] = useState<ReadonlySet<string>>(new Set());

  const leads = useMemo(() => all.data?.leads ?? [], [all.data]);
  const byApn = useMemo(() => new Map(leads.map((lead) => [lead.apn, lead])), [leads]);

  const optimistic = async (change: (list: LeadList) => LeadList): Promise<Snapshot> => {
    await queryClient.cancelQueries(listFilter);
    const snapshot = queryClient.getQueriesData<LeadList>(listFilter);
    queryClient.setQueriesData<LeadList>(listFilter, (old) => (old ? change(old) : old));
    return snapshot;
  };
  const rollback = (snapshot: Snapshot | undefined): void => {
    for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data);
  };
  const refresh = (): Promise<void> => queryClient.invalidateQueries(listFilter);

  const updateMutation = useMutation(
    trpc.leads.update.mutationOptions({
      onMutate: (patch) =>
        optimistic((list) => ({
          ...list,
          leads: list.leads.map((l) => (l.leadId === patch.leadId ? applyPatch(l, patch) : l)),
        })),
      onError: (error, _patch, snapshot) => {
        rollback(snapshot);
        notify('error', `Lead not saved, change undone. ${describeError(error)}`);
      },
      onSettled: refresh,
    }),
  );

  const removeMutation = useMutation(
    trpc.leads.remove.mutationOptions({
      onMutate: ({ leadId }) =>
        optimistic((list) => ({
          total: Math.max(0, list.total - 1),
          leads: list.leads.filter((l) => l.leadId !== leadId),
        })),
      onError: (error, _input, snapshot) => {
        rollback(snapshot);
        notify('error', `Lead not deleted. ${describeError(error)}`);
      },
      onSuccess: () => {
        notify('success', 'Lead deleted.');
      },
      onSettled: refresh,
    }),
  );

  const create = useCallback(
    async (drafts: LeadCreate[]): Promise<Lead[]> => {
      if (drafts.length === 0) return [];
      const apns = drafts.map((d) => d.apn);
      setPendingApns((current) => new Set([...current, ...apns]));
      // The batch link sends these as one HTTP request.
      const results = await Promise.allSettled(drafts.map((d) => client.leads.create.mutate(d)));
      setPendingApns((current) => new Set([...current].filter((apn) => !apns.includes(apn))));
      await queryClient.invalidateQueries(trpc.leads.list.pathFilter());

      const done = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      const failed = results.find((r) => r.status === 'rejected');
      const created = done.filter((r) => r.created).length;
      const existing = done.length - created;
      const parts = [
        created > 0 ? `${String(created)} ${created === 1 ? 'lead' : 'leads'} created` : null,
        existing > 0 ? `${String(existing)} already in your leads` : null,
      ].filter((part): part is string => part !== null);
      if (failed) {
        const count = results.length - done.length;
        notify(
          'error',
          `${String(count)} of ${String(results.length)} not created. ${describeError(failed.reason)}` +
            (parts.length > 0 ? ` (${parts.join(', ')}.)` : ''),
        );
      } else {
        notify('success', `${parts.join(', ')}.`);
      }
      return done.map((r) => r.lead);
    },
    [client, queryClient, trpc, notify],
  );

  return {
    leads,
    byApn,
    isLoading: all.isLoading,
    error: all.error ? describeError(all.error) : null,
    pendingApns,
    create,
    update: updateMutation.mutate,
    remove: (leadId) => {
      removeMutation.mutate({ leadId });
    },
  };
}
