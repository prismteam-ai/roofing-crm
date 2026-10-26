// B-07: the leads hooks (leadsApi.ts) run for real against a real QueryClient; only the tRPC
// option factories (`useTRPC`) are faked. Proves the query inputs reach the router and that each
// mutation refreshes exactly the cached queries it makes stale.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
  type MockInstance,
} from "vitest";

const LIST_KEY = ["leads", "list"] as const;
const GET_KEY = ["leads", "get"] as const;
const PRESENCE_KEY = ["leads", "presence"] as const;

const listFn = vi.fn();
const getFn = vi.fn();
const createFn = vi.fn();
const statusFn = vi.fn();
const noteFn = vi.fn();
const assignFn = vi.fn();
const listOptionInputs: unknown[] = [];
const getOptionInputs: unknown[] = [];

const fakeTrpc = {
  leads: {
    list: {
      queryOptions: (input: unknown) => {
        listOptionInputs.push(input);
        return { queryKey: [...LIST_KEY, input], queryFn: () => listFn(input) };
      },
      queryKey: () => LIST_KEY,
    },
    get: {
      queryOptions: (input: unknown) => {
        getOptionInputs.push(input);
        return { queryKey: [...GET_KEY, input], queryFn: () => getFn(input) };
      },
      queryKey: () => GET_KEY,
    },
    presence: { queryKey: () => PRESENCE_KEY },
    create: { mutationOptions: () => ({ mutationFn: (v: unknown) => createFn(v) }) },
    updateStatus: { mutationOptions: () => ({ mutationFn: (v: unknown) => statusFn(v) }) },
    assign: { mutationOptions: () => ({ mutationFn: (v: unknown) => assignFn(v) }) },
    addNote: { mutationOptions: () => ({ mutationFn: (v: unknown) => noteFn(v) }) },
  },
};
vi.mock("@crm/api-client/react", () => ({ useTRPC: () => fakeTrpc }));

import {
  useAddLeadNote,
  useAssignLead,
  useCreateLead,
  useLead,
  useLeadsList,
  useUpdateLeadStatus,
  type LeadDetailData,
  type LeadListItem,
} from "../../src/routes/Leads/leadsApi";

let queryClient: QueryClient;
let invalidate: MockInstance<QueryClient["invalidateQueries"]>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidate = vi.spyOn(queryClient, "invalidateQueries");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  listOptionInputs.length = 0;
  getOptionInputs.length = 0;
});

const invalidatedKeys = (): unknown[] =>
  invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);

describe("leads queries", () => {
  it("useLeadsList passes the filter input to leads.list and returns its data", async () => {
    listFn.mockResolvedValue({ leads: [], totalCount: 0 });
    const input = { filters: { roofAgeMinYears: 20 }, limit: 25 };
    const { result } = renderHook(() => useLeadsList(input), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(listOptionInputs[0]).toEqual(input);
    expect(listFn).toHaveBeenCalledWith(input);
    expect(result.current.data).toEqual({ leads: [], totalCount: 0 });
  });

  it("useLead asks leads.get for the lead key it was given", async () => {
    getFn.mockResolvedValue({ leadKey: "48453:tcad:1" });
    const { result } = renderHook(() => useLead("48453:tcad:1"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(getOptionInputs[0]).toEqual({ leadKey: "48453:tcad:1" });
    expect(getFn).toHaveBeenCalledWith({ leadKey: "48453:tcad:1" });
  });

  it("retries a failed lookup once, then surfaces it as an error status", async () => {
    getFn.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useLead("k"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("error"), { timeout: 4_000 });
    expect(getFn).toHaveBeenCalledTimes(2); // the first try plus one retry
  });

  it("does not retry a lead that does not exist", async () => {
    getFn.mockRejectedValue({ data: { code: "NOT_FOUND" } });
    const { result } = renderHook(() => useLead("missing"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(getFn).toHaveBeenCalledTimes(1);
  });
});

describe("leads mutations", () => {
  it("useCreateLead sends the input and refreshes the list and the lead-presence queries", async () => {
    createFn.mockResolvedValue({ leadId: "L1" });
    const { result } = renderHook(() => useCreateLead(), { wrapper });
    await act(() => result.current.mutateAsync({ address: "1 Main" } as never));
    expect(createFn).toHaveBeenCalledWith({ address: "1 Main" });
    expect(invalidatedKeys()).toEqual([LIST_KEY, PRESENCE_KEY]);
  });

  it("useUpdateLeadStatus sends the change and refreshes the detail then the list", async () => {
    statusFn.mockResolvedValue({ leadId: "L1" });
    const { result } = renderHook(() => useUpdateLeadStatus(), { wrapper });
    await act(() => result.current.mutateAsync({ leadKey: "k", status: "won" }));
    expect(statusFn).toHaveBeenCalledWith({ leadKey: "k", status: "won" });
    expect(invalidatedKeys()).toEqual([GET_KEY, LIST_KEY]);
  });

  it("useAssignLead sends the assignment and refreshes the detail then the list", async () => {
    assignFn.mockResolvedValue({ leadId: "L1" });
    const { result } = renderHook(() => useAssignLead(), { wrapper });
    await act(() => result.current.mutateAsync({ leadKey: "k", expectedSequence: 2 }));
    expect(assignFn).toHaveBeenCalledWith({ leadKey: "k", expectedSequence: 2 });
    expect(invalidatedKeys()).toEqual([GET_KEY, LIST_KEY]);
  });

  it("useAddLeadNote sends the note and refreshes only the detail query", async () => {
    noteFn.mockResolvedValue({ leadId: "L1" });
    const { result } = renderHook(() => useAddLeadNote(), { wrapper });
    await act(() => result.current.mutateAsync({ leadKey: "k", text: "called" }));
    expect(noteFn).toHaveBeenCalledWith({ leadKey: "k", text: "called" });
    expect(invalidatedKeys()).toEqual([GET_KEY]);
  });

  it("does not refresh anything when the write fails", async () => {
    statusFn.mockRejectedValue(new Error("conflict"));
    const { result } = renderHook(() => useUpdateLeadStatus(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ leadKey: "k", status: "won" }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});

// Type level (checked by `tsc`, the web type-check): the screen types are the router's own
// inferred types, so the "no stored snapshot" case the old structural cast hid stays visible.
describe("leadsApi types", () => {
  it("LeadDetailData.signals may be undefined, as the leads.get router returns it", () => {
    expectTypeOf<undefined>().toExtend<LeadDetailData["signals"]>();
    expectTypeOf<NonNullable<LeadDetailData["signals"]>>()
      .toHaveProperty("capturedAt")
      .toBeString();
    expectTypeOf<LeadListItem>().toHaveProperty("notInCurrentRun").toEqualTypeOf<boolean>();
  });
});
