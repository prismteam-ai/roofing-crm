// A created lead goes straight into the cached Leads list (so /leads paints its row from cache) and
// the background refetch, which can briefly lack it (the leads index is eventually consistent),
// never removes it inside the optimistic window. Real QueryClient; only the tRPC option factories
// are faked.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LIST_KEY = ["leads", "list"] as const;
const listFn = vi.fn();
const createFn = vi.fn();
const undoFn = vi.fn();

const fakeTrpc = {
  leads: {
    list: {
      queryOptions: (input: unknown) => ({
        queryKey: [...LIST_KEY, input],
        queryFn: () => listFn(input),
      }),
      queryKey: () => LIST_KEY,
    },
    presence: { queryKey: () => ["leads", "presence"] as const },
    create: { mutationOptions: () => ({ mutationFn: (v: unknown) => createFn(v) }) },
    undoCreate: { mutationOptions: () => ({ mutationFn: (v: unknown) => undoFn(v) }) },
  },
};
vi.mock("@crm/api-client/react", () => ({
  useTRPC: () => fakeTrpc,
  useTRPCClient: () => ({}),
}));

import {
  OPTIMISTIC_WINDOW_MS,
  addCreatedLead,
  overlayLeadsList,
  removeUndoneLead,
} from "../../src/routes/Leads/leadsListCache";
import { useCreateLead, useLeadsList } from "../../src/routes/Leads/leadsApi";
import { useUndoCreateLead } from "../../src/routes/Map/Candidates/candidatesApi";

const ME = "7f3c2a10-5b6e-4d1a-9c2b-0e8f6a4d1b23";
const NOW = Date.parse("2026-10-25T12:00:00.000Z");

const stored = (n: number, over: Record<string, unknown> = {}) => ({
  leadKey: `48453:tcad:020188512${String(n)}`,
  leadId: `L-${String(n)}`,
  address: `TCAD 020188512${String(n)}`,
  lat: 30.4,
  lon: -97.6,
  status: "new" as const,
  assignee: ME,
  createdFrom: "map" as const,
  sourceManifestCid: "bafkreimanifest",
  createdAt: new Date(NOW - (10 - n) * 60_000).toISOString(),
  eventSequence: 0,
  ...over,
});
const item = (n: number, over: Record<string, unknown> = {}) => ({
  ...stored(n, over),
  notInCurrentRun: false,
  signals: null,
  lastActivity: null,
});

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const UNFILTERED = { limit: 25 };
const seed = (input: unknown, leads: unknown[], total = leads.length) =>
  queryClient.setQueryData([...LIST_KEY, input], { leads, totalCount: total });
const read = (input: unknown) =>
  queryClient.getQueryData<{ leads: { leadKey: string }[]; totalCount: number }>([
    ...LIST_KEY,
    input,
  ]);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("addCreatedLead", () => {
  it("puts the new lead first in the unfiltered list, shaped like a listed lead", () => {
    seed(UNFILTERED, [item(5), item(4)]);
    const created = stored(9, { createdAt: new Date(NOW).toISOString() });
    addCreatedLead(queryClient, LIST_KEY, created, NOW);
    const data = read(UNFILTERED);
    expect(data?.leads.map((l) => l.leadKey)).toEqual([
      created.leadKey,
      item(5).leadKey,
      item(4).leadKey,
    ]);
    expect(data?.leads[0]).toEqual({
      ...created,
      notInCurrentRun: false,
      signals: null,
      lastActivity: { at: created.createdAt, kind: "created" },
    });
    expect(data?.totalCount).toBe(3);
  });

  it("keeps newest-first order: an older create sorts below a newer lead", () => {
    seed(UNFILTERED, [item(5), item(2)]);
    const created = stored(3, { createdAt: item(3).createdAt });
    addCreatedLead(queryClient, LIST_KEY, created, NOW);
    expect(read(UNFILTERED)?.leads.map((l) => l.leadKey)).toEqual([
      item(5).leadKey,
      created.leadKey,
      item(2).leadKey,
    ]);
  });

  it("does not insert twice", () => {
    seed(UNFILTERED, [item(5)]);
    addCreatedLead(queryClient, LIST_KEY, stored(5), NOW);
    expect(read(UNFILTERED)?.leads).toHaveLength(1);
    expect(read(UNFILTERED)?.totalCount).toBe(1);
  });

  it("inserts into a status list the lead belongs to, my own list, and nothing else", () => {
    const mine = { assignee: ME, limit: 25 };
    const statusNew = { status: "new", limit: 25 };
    const statusWon = { status: "won", limit: 25 };
    const filtered = { filters: { roofAgeMinYears: 15 }, limit: 25 };
    const someoneElse = { assignee: "someone-else", limit: 25 };
    const nextPage = { cursor: "25", limit: 25 };
    for (const input of [mine, statusNew, statusWon, filtered, someoneElse, nextPage])
      seed(input, [item(1)]);
    addCreatedLead(queryClient, LIST_KEY, stored(9), NOW);
    expect(read(mine)?.leads).toHaveLength(2);
    expect(read(statusNew)?.leads).toHaveLength(2);
    for (const untouched of [statusWon, filtered, someoneElse, nextPage])
      expect(read(untouched)?.leads, JSON.stringify(untouched)).toHaveLength(1);
  });

  it("marks the entries it did not insert into as stale (they refetch), without waiting", () => {
    const filtered = { filters: { roofAgeMinYears: 15 }, limit: 25 };
    seed(filtered, [item(1)]);
    addCreatedLead(queryClient, LIST_KEY, stored(9), NOW);
    expect(queryClient.getQueryState([...LIST_KEY, filtered])?.isInvalidated).toBe(true);
  });
});

describe("overlayLeadsList (a refetch that lacks the new lead)", () => {
  it("keeps the new lead while a refetch does not contain it yet, for the window", () => {
    addCreatedLead(
      queryClient,
      LIST_KEY,
      stored(9, { createdAt: new Date(NOW).toISOString() }),
      NOW,
    );
    const refetched = { leads: [item(5)], totalCount: 1 };
    const merged = overlayLeadsList(queryClient, UNFILTERED, refetched, NOW + 5_000);
    expect(merged.leads.map((l) => l.leadKey)).toEqual([stored(9).leadKey, item(5).leadKey]);
    expect(merged.totalCount).toBe(2);
    // The created lead is shaped like a listed one: no snapshot yet, its only activity the creation.
    expect(merged.leads[0]).toMatchObject({
      signals: null,
      lastActivity: { at: new Date(NOW).toISOString(), kind: "created" },
      notInCurrentRun: false,
    });
  });

  it("drops it once the window has passed, or once a refetch contains it", () => {
    addCreatedLead(
      queryClient,
      LIST_KEY,
      stored(9, { createdAt: new Date(NOW).toISOString() }),
      NOW,
    );
    const lacking = { leads: [item(5)], totalCount: 1 };
    expect(
      overlayLeadsList(queryClient, UNFILTERED, lacking, NOW + OPTIMISTIC_WINDOW_MS + 1).leads,
    ).toHaveLength(1);
    const containing = { leads: [item(9), item(5)], totalCount: 2 };
    const merged = overlayLeadsList(queryClient, UNFILTERED, containing, NOW + 1_000);
    expect(merged.leads).toHaveLength(2);
    expect(merged.totalCount).toBe(2);
  });

  it("only overlays lists the lead belongs to", () => {
    addCreatedLead(queryClient, LIST_KEY, stored(9), NOW);
    const data = { leads: [item(5)], totalCount: 1 };
    expect(
      overlayLeadsList(queryClient, { filters: { roofAgeMinYears: 15 }, limit: 25 }, data, NOW)
        .leads,
    ).toHaveLength(1);
    expect(
      overlayLeadsList(queryClient, { status: "won", limit: 25 }, data, NOW).leads,
    ).toHaveLength(1);
  });

  it("useLeadsList shows the row from a refetch that lacks it", async () => {
    listFn.mockResolvedValue({ leads: [item(5)], totalCount: 1 });
    const { result } = renderHook(() => useLeadsList(UNFILTERED), { wrapper });
    await waitFor(() => expect(result.current.data?.leads).toHaveLength(1));
    act(() => addCreatedLead(queryClient, LIST_KEY, stored(9), NOW));
    await waitFor(() => expect(result.current.data?.leads[0]?.leadKey).toBe(stored(9).leadKey));
    // The background refetch (the invalidation) answers without it: the row stays.
    await waitFor(() => expect(listFn.mock.calls.length).toBeGreaterThan(1));
    expect(result.current.data?.leads.map((l) => l.leadKey)).toContain(stored(9).leadKey);
  });
});

describe("removeUndoneLead", () => {
  it("removes the lead from every cached list at once", () => {
    const mine = { assignee: ME, limit: 25 };
    seed(UNFILTERED, [item(9), item(5)]);
    seed(mine, [item(9)]);
    removeUndoneLead(queryClient, LIST_KEY, item(9).leadKey, NOW);
    expect(read(UNFILTERED)?.leads.map((l) => l.leadKey)).toEqual([item(5).leadKey]);
    expect(read(UNFILTERED)?.totalCount).toBe(1);
    expect(read(mine)?.leads).toHaveLength(0);
  });

  it("is not brought back by a refetch that still contains it (eventual consistency)", () => {
    addCreatedLead(queryClient, LIST_KEY, stored(9), NOW);
    removeUndoneLead(queryClient, LIST_KEY, stored(9).leadKey, NOW + 1_000);
    const stale = { leads: [item(9), item(5)], totalCount: 2 };
    const merged = overlayLeadsList(queryClient, UNFILTERED, stale, NOW + 2_000);
    expect(merged.leads.map((l) => l.leadKey)).toEqual([item(5).leadKey]);
    expect(merged.totalCount).toBe(1);
  });
});

describe("useCreateLead", () => {
  it("inserts the created lead and refetches in the background without waiting", async () => {
    seed(UNFILTERED, [item(5)]);
    createFn.mockResolvedValue(stored(9, { createdAt: new Date(NOW).toISOString() }));
    listFn.mockReturnValue(new Promise(() => undefined)); // a refetch that never answers
    const { result } = renderHook(() => useCreateLead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never);
    });
    expect(read(UNFILTERED)?.leads[0]?.leadKey).toBe(stored(9).leadKey);
  });

  it("inserts nothing when the create fails", async () => {
    seed(UNFILTERED, [item(5)]);
    createFn.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useCreateLead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never).catch(() => undefined);
    });
    expect(read(UNFILTERED)?.leads).toHaveLength(1);
  });

  it("inserts nothing on ALREADY_EXISTS (409)", async () => {
    seed(UNFILTERED, [item(5)]);
    createFn.mockRejectedValue(
      Object.assign(new Error("exists"), { data: { appCode: "ALREADY_EXISTS", httpStatus: 409 } }),
    );
    const { result } = renderHook(() => useCreateLead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never).catch(() => undefined);
    });
    expect(read(UNFILTERED)?.leads).toHaveLength(1);
    expect(read(UNFILTERED)?.totalCount).toBe(1);
  });
});

describe("useUndoCreateLead", () => {
  it("removes the lead from the cached list as soon as the server deletes it", async () => {
    seed(UNFILTERED, [item(9), item(5)]);
    undoFn.mockResolvedValue({ deleted: true });
    const { result } = renderHook(() => useUndoCreateLead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ leadKey: item(9).leadKey, leadId: "L-9" });
    });
    expect(read(UNFILTERED)?.leads.map((l) => l.leadKey)).toEqual([item(5).leadKey]);
  });

  it("leaves the list alone when the server refuses (the kept-reason copy still applies)", async () => {
    seed(UNFILTERED, [item(9), item(5)]);
    undoFn.mockResolvedValue({ deleted: false, reason: "CHANGED" });
    const { result } = renderHook(() => useUndoCreateLead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ leadKey: item(9).leadKey, leadId: "L-9" });
    });
    expect(read(UNFILTERED)?.leads).toHaveLength(2);
    await waitFor(() => expect(result.current.data).toEqual({ deleted: false, reason: "CHANGED" }));
  });
});
