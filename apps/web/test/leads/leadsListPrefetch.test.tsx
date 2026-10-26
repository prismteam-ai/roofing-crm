// The drawer-to-/leads flow on a fresh QueryClient (the hosted B-07-TC-NF-01 path: map drawer opened
// with ?sel=, Create lead, View leads). Without a cached list the created lead has nothing to be
// written into, so /leads waits for its own leads.list round trip. With the unfiltered first page
// prefetched when a lead can be created, the create handler's insert lands in a real cached page and
// /leads paints it at once.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LIST_KEY = ["leads", "list"] as const;
const listFn = vi.fn();
const createFn = vi.fn();
const fakeTrpc = {
  leads: {
    list: {
      queryOptions: (input: unknown) => ({
        queryKey: [...LIST_KEY, input],
        queryFn: () => listFn(input),
      }),
      queryKey: () => LIST_KEY,
    },
    presence: { queryKey: () => ["leads", "presence"] },
    create: { mutationOptions: () => ({ mutationFn: (v: unknown) => createFn(v) }) },
  },
};
vi.mock("@crm/api-client/react", () => ({ useTRPC: () => fakeTrpc, useTRPCClient: () => ({}) }));

import {
  DEFAULT_LEADS_LIST_INPUT,
  useCreateLead,
  useLeadsList,
  usePrefetchLeadsList,
} from "../../src/routes/Leads/leadsApi";
import { parseLeadQuery, toLeadsListInput } from "../../src/routes/Leads/leadFilters.state";

const ME = "7f3c2a10-5b6e-4d1a-9c2b-0e8f6a4d1b23";
const lead = (n: number, createdAt: string) => ({
  leadKey: `48453:tcad:020188512${String(n)}`,
  leadId: `L-${String(n)}`,
  address: `TCAD 020188512${String(n)}`,
  lat: 30.4,
  lon: -97.6,
  status: "new" as const,
  assignee: ME,
  createdFrom: "map" as const,
  sourceManifestCid: "bafkreimanifest",
  createdAt,
  eventSequence: 0,
});
const OLD = lead(5, "2020-01-01T10:00:00.000Z");
const NEW = lead(9, "2030-01-01T10:00:00.000Z");

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

/** A leads.list round trip that takes `ms`, answering `leads`. */
const answerAfter = (ms: number, leads: unknown[]) =>
  listFn.mockImplementation(
    () =>
      new Promise((resolve) => setTimeout(() => resolve({ leads, totalCount: leads.length }), ms)),
  );

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the default list input", () => {
  it("is exactly what /leads asks for with no filters (so a prefetch and the page share one entry)", () => {
    expect(DEFAULT_LEADS_LIST_INPUT).toEqual(
      toLeadsListInput(parseLeadQuery(new URLSearchParams())),
    );
  });
});

describe("baseline: no list cached when the lead is created (the hypothesis)", () => {
  it("the create inserts nothing (no invented one-row list) and /leads waits on its own round trip", async () => {
    answerAfter(150, [OLD]);
    const create = renderHook(() => useCreateLead(), { wrapper });
    createFn.mockResolvedValue(NEW);
    await act(async () => {
      await create.result.current.mutateAsync({} as never);
    });
    expect(queryClient.getQueryData([...LIST_KEY, DEFAULT_LEADS_LIST_INPUT])).toBeUndefined();
    // View leads: /leads mounts its list hook. Nothing to paint, so it is loading on the network.
    const page = renderHook(() => useLeadsList(DEFAULT_LEADS_LIST_INPUT), { wrapper });
    expect(page.result.current.status).toBe("pending");
    expect(listFn).toHaveBeenCalled();
    // When the round trip lands, the new lead (missing from it: eventual consistency) is merged in.
    await waitFor(() => expect(page.result.current.status).toBe("success"));
    expect(page.result.current.data?.leads.map((l) => l.leadKey)).toEqual([
      NEW.leadKey,
      OLD.leadKey,
    ]);
  });
});

describe("with the first page prefetched", () => {
  it("paints /leads from cache at once, with the created lead first, while it refetches in the background", async () => {
    answerAfter(20, [OLD]);
    const prefetch = renderHook(() => usePrefetchLeadsList(), { wrapper });
    await act(async () => {
      await prefetch.result.current();
    });
    expect(queryClient.getQueryData([...LIST_KEY, DEFAULT_LEADS_LIST_INPUT])).toBeDefined();

    createFn.mockResolvedValue(NEW);
    const create = renderHook(() => useCreateLead(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({} as never);
    });
    // The background refetch is slow and lacks the lead: /leads must not wait for it.
    answerAfter(2_000, [OLD]);
    const page = renderHook(() => useLeadsList(DEFAULT_LEADS_LIST_INPUT), { wrapper });
    expect(page.result.current.status).toBe("success");
    expect(page.result.current.isLoading).toBe(false);
    expect(page.result.current.data?.leads.map((l) => l.leadKey)).toEqual([
      NEW.leadKey,
      OLD.leadKey,
    ]);
    expect(page.result.current.data?.totalCount).toBe(2);
  });

  it("does not refetch a fresh prefetched page again and again", async () => {
    answerAfter(1, [OLD]);
    const prefetch = renderHook(() => usePrefetchLeadsList(), { wrapper });
    await act(async () => {
      await prefetch.result.current();
      await prefetch.result.current();
    });
    expect(listFn).toHaveBeenCalledTimes(1);
  });

  it("a page still loading when the create finishes falls back to the normal fetch and then merges the row", async () => {
    answerAfter(100, [OLD]);
    const prefetch = renderHook(() => usePrefetchLeadsList(), { wrapper });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = prefetch.result.current();
    });
    createFn.mockResolvedValue(NEW);
    const create = renderHook(() => useCreateLead(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({} as never);
    });
    // Nothing was in the cache yet, so nothing was invented.
    expect(queryClient.getQueryData([...LIST_KEY, DEFAULT_LEADS_LIST_INPUT])).toBeUndefined();
    const page = renderHook(() => useLeadsList(DEFAULT_LEADS_LIST_INPUT), { wrapper });
    await act(async () => {
      await pending;
    });
    await waitFor(() => expect(page.result.current.status).toBe("success"));
    expect(page.result.current.data?.leads.map((l) => l.leadKey)).toEqual([
      NEW.leadKey,
      OLD.leadKey,
    ]);
  });
});
