// The cached Leads list and a just-created lead. Creating a lead costs one round trip; the list the
// person lands on after "View leads" used to cost a second one before the row could paint. So a
// successful create goes straight into the cached `leads.list` entries it belongs to (newest first,
// shaped like a listed lead), and the list refetches in the background without anyone waiting.
//
// The leads index (GSI1) is eventually consistent, so that refetch can briefly lack the new lead.
// `overlayLeadsList` (the list hook's `select`) keeps the new lead, merged by lead key, until a
// refetch contains it or `OPTIMISTIC_WINDOW_MS` passes, and keeps an undone lead out for the same
// window. Failed creates and duplicates (409) never reach here: only a successful create does.
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { LeadListItem, LeadsListOutput } from "./leadsApi.js";

/** How long a created (or undone) lead is held against a refetch that has not caught up. */
export const OPTIMISTIC_WINDOW_MS = 15_000;

/** What `leads.create` returns: the stored lead (no snapshot or activity: the list adds those). */
export type CreatedLead = Omit<LeadListItem, "notInCurrentRun" | "signals" | "lastActivity"> &
  Partial<Pick<LeadListItem, "signals" | "lastActivity">>;

/** A created lead shaped like a listed one. Its snapshot is not in the create response, so it is
 *  null until the background refetch brings the stored one; its only activity is the creation. */
function listed(lead: CreatedLead): LeadListItem {
  return {
    ...lead,
    notInCurrentRun: false,
    signals: lead.signals ?? null,
    lastActivity: lead.lastActivity ?? { at: lead.createdAt, kind: "created" },
  };
}

interface Registry {
  readonly added: Map<string, { lead: CreatedLead; at: number }>;
  readonly removed: Map<string, number>;
}

const registries = new WeakMap<QueryClient, Registry>();

function registryOf(client: QueryClient): Registry {
  let registry = registries.get(client);
  if (registry === undefined) {
    registry = { added: new Map(), removed: new Map() };
    registries.set(client, registry);
  }
  return registry;
}

interface ListInputLike {
  readonly filters?: unknown;
  readonly status?: string;
  readonly assignee?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/** The `leads.list` input a cache entry was made for: the last key part, which tRPC wraps as
 *  `{ input, type }` (a bare input is accepted too). */
function inputOf(key: QueryKey): ListInputLike {
  const last = key[key.length - 1];
  if (typeof last === "object" && last !== null && "input" in last) {
    return ((last as { input?: ListInputLike }).input ?? {}) as ListInputLike;
  }
  return (typeof last === "object" && last !== null ? last : {}) as ListInputLike;
}

const hasFilters = (filters: unknown): boolean =>
  typeof filters === "object" && filters !== null && Object.keys(filters).length > 0;

/** True when a lead with this status and assignee appears in the list asked for by `input`: the
 *  first page, no geo or roof or permit filter, my own leads (or the lead's assignee), and the
 *  lead's status. Anything narrower is only refetched. */
function belongs(input: ListInputLike, lead: { status: string; assignee: string }): boolean {
  if (hasFilters(input.filters) || input.cursor !== undefined) return false;
  if (input.status !== undefined && input.status !== lead.status) return false;
  if (input.assignee !== undefined && input.assignee !== lead.assignee) return false;
  return true;
}

function insertSorted(leads: readonly LeadListItem[], lead: LeadListItem): LeadListItem[] {
  const at = leads.findIndex((l) => lead.createdAt > l.createdAt);
  const next = [...leads];
  next.splice(at === -1 ? next.length : at, 0, lead);
  return next;
}

/** A created lead: into every cached list it belongs to, then a background refetch of all lists. */
export function addCreatedLead(
  client: QueryClient,
  listKey: QueryKey,
  lead: CreatedLead,
  now: number = Date.now(),
): void {
  const registry = registryOf(client);
  registry.removed.delete(lead.leadKey);
  registry.added.set(lead.leadKey, { lead, at: now });
  const item = listed(lead);
  for (const query of client.getQueryCache().findAll({ queryKey: listKey })) {
    const data = query.state.data as LeadsListOutput | undefined;
    if (data === undefined || !belongs(inputOf(query.queryKey), lead)) continue;
    if (data.leads.some((l) => l.leadKey === lead.leadKey)) continue;
    client.setQueryData(query.queryKey, {
      ...data,
      leads: insertSorted(data.leads, item),
      totalCount: data.totalCount + 1,
    });
  }
  // Not awaited: the row is already on screen; this only brings the lists in line with the server.
  void client.invalidateQueries({ queryKey: listKey });
  // When the window passes, one more refetch settles anything that was still being held.
  setTimeout(
    () => void client.invalidateQueries({ queryKey: listKey }),
    OPTIMISTIC_WINDOW_MS + 100,
  );
}

/** An undone lead: out of every cached list at once, and kept out of a refetch that still has it. */
export function removeUndoneLead(
  client: QueryClient,
  listKey: QueryKey,
  leadKey: string,
  now: number = Date.now(),
): void {
  const registry = registryOf(client);
  registry.added.delete(leadKey);
  registry.removed.set(leadKey, now);
  for (const query of client.getQueryCache().findAll({ queryKey: listKey })) {
    const data = query.state.data as LeadsListOutput | undefined;
    if (data === undefined || !data.leads.some((l) => l.leadKey === leadKey)) continue;
    client.setQueryData(query.queryKey, {
      ...data,
      leads: data.leads.filter((l) => l.leadKey !== leadKey),
      totalCount: Math.max(0, data.totalCount - 1),
    });
  }
  void client.invalidateQueries({ queryKey: listKey });
}

/** The list hook's `select`: the server's page plus a created lead it does not hold yet, minus an
 *  undone lead it still holds, both only inside the window. Pure over its arguments. */
export function overlayLeadsList(
  client: QueryClient,
  input: ListInputLike,
  data: LeadsListOutput,
  now: number = Date.now(),
): LeadsListOutput {
  const registry = registries.get(client);
  if (registry === undefined) return data;
  let leads = data.leads;
  let total = data.totalCount;
  for (const [key, at] of registry.removed) {
    if (now - at > OPTIMISTIC_WINDOW_MS) {
      registry.removed.delete(key);
      continue;
    }
    if (leads.some((l) => l.leadKey === key)) {
      leads = leads.filter((l) => l.leadKey !== key);
      total = Math.max(0, total - 1);
    }
  }
  for (const [key, { lead, at }] of registry.added) {
    if (now - at > OPTIMISTIC_WINDOW_MS) {
      registry.added.delete(key);
      continue;
    }
    if (!belongs(input, lead) || leads.some((l) => l.leadKey === key)) continue;
    leads = insertSorted(leads, listed(lead));
    total += 1;
  }
  return leads === data.leads ? data : { ...data, leads, totalCount: total };
}
