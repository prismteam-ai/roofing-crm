// useCandidates marks existing leads from `leads.presence` (every assignee, chunks of 100), not
// from the caller's first-100 `leads.list`; the bulk and undo hooks go through createMany /
// undoCreate. Only the tRPC option factories and client are faked (askApi.test.tsx pattern).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { propertiesSearchInput } from "../../src/routes/Map/Candidates/candidates";
import { FILTERS, must, permit, property } from "./fixtures";

const presenceFn = vi.fn();
const listFn = vi.fn();
const createManyFn = vi.fn();
const undoFn = vi.fn();
let props: ReturnType<typeof property>[] = [];
let propertyCounts: { afterRadius: number; afterRoofAge: number } | undefined;
let permitReply: { permits: ReturnType<typeof permit>[]; total?: number; truncated?: boolean } = {
  permits: [permit(1)],
};
const permitInputs: unknown[] = [];
const propertyInputs: unknown[] = [];

const fakeTrpc = {
  search: {
    properties: {
      queryOptions: (input: unknown) => {
        propertyInputs.push(input);
        return {
          queryKey: [["search", "properties"], input],
          queryFn: () => ({
            properties: props,
            ...(propertyCounts === undefined ? {} : { counts: propertyCounts }),
          }),
        };
      },
    },
    permits: {
      queryOptions: (input: unknown) => {
        permitInputs.push(input);
        return {
          queryKey: [["search", "permits"], input],
          queryFn: () => permitReply,
        };
      },
    },
  },
  leads: {
    list: {
      queryKey: () => [["leads", "list"]],
      queryOptions: () => ({ queryKey: [["leads", "list"]], queryFn: listFn }),
    },
    presence: {
      queryKey: () => [["leads", "presence"]],
      queryOptions: (input: { requestIdentifiers: string[] }) => ({
        queryKey: [["leads", "presence"], input],
        queryFn: () => presenceFn(input),
      }),
    },
  },
};
const fakeClient = {
  leads: {
    createMany: { mutate: (v: unknown) => createManyFn(v) },
    undoCreate: { mutate: (v: unknown) => undoFn(v) },
  },
};
vi.mock("@crm/api-client/react", () => ({
  useTRPC: () => fakeTrpc,
  useTRPCClient: () => fakeClient,
}));

import {
  useBulkCreateLeads,
  useCandidates,
  useUndoCreatedLeads,
} from "../../src/routes/Map/Candidates/candidatesApi";

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
const filters = { ...FILTERS, center: { lat: 30.4, lng: -97.6 } };

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  propertyCounts = undefined;
  permitReply = { permits: [permit(1)] };
  permitInputs.length = 0;
  propertyInputs.length = 0;
  presenceFn.mockReset();
  listFn.mockReset();
  createManyFn.mockReset();
  undoFn.mockReset();
});
afterEach(cleanup);

describe("candidatesApi owner filters", () => {
  it("builds the same search.properties input as the map, with owner keys only when on", async () => {
    props = [property(1)];
    const center = { lat: 30.4, lng: -97.6 };
    renderHook(() => useCandidates({ ...filters, tenureYearsMin: 10, outOfArea: true }), {
      wrapper,
    });
    await waitFor(() => expect(propertyInputs.length).toBeGreaterThan(0));
    expect(propertyInputs[0]).toEqual(
      propertiesSearchInput(center, filters.radiusMi, filters.roofAgeMinYears, 10, true),
    );
    expect(propertyInputs[0]).toMatchObject({ tenureYearsMin: 10, outOfArea: true });
    propertyInputs.length = 0;
    renderHook(() => useCandidates(filters), { wrapper });
    await waitFor(() => expect(propertyInputs.length).toBeGreaterThan(0));
    expect(propertyInputs[0]).not.toHaveProperty("tenureYearsMin");
    expect(propertyInputs[0]).not.toHaveProperty("outOfArea");
  });
});

describe("candidatesApi lead marks", () => {
  it("marks a lead owned by someone else, from leads.presence, and never calls leads.list", async () => {
    props = [property(1), property(2)];
    presenceFn.mockResolvedValue([
      {
        requestIdentifier: "0201885121",
        leadKey: "48453:tcad:0201885121",
        leadId: "L-1",
        status: "contacted",
      },
    ]);
    const { result } = renderHook(() => useCandidates(filters), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() =>
      expect(must(result.current.candidates[0]).lead).toMatchObject({ leadId: "L-1" }),
    );
    expect(must(result.current.candidates[1]).lead).toBeNull();
    expect(presenceFn).toHaveBeenCalledWith({
      fips: "48453",
      requestIdentifiers: ["0201885121", "0201885122"],
    });
    expect(listFn).not.toHaveBeenCalled();
    expect(result.current.leadsUnavailable).toBe(false);
  });

  it("asks in chunks of 100 identifiers", async () => {
    props = Array.from({ length: 230 }, (_, i) => property(i + 1));
    presenceFn.mockResolvedValue([]);
    const { result } = renderHook(() => useCandidates(filters), { wrapper });
    await waitFor(() => expect(presenceFn).toHaveBeenCalledTimes(3));
    expect(
      presenceFn.mock.calls
        .map((c) => (c[0] as { requestIdentifiers: string[] }).requestIdentifiers.length)
        .sort((a, b) => a - b),
    ).toEqual([30, 100, 100]);
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("a failing presence read keeps the rows and says marks are unavailable", async () => {
    props = [property(1)];
    presenceFn.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useCandidates(filters), { wrapper });
    await waitFor(() => expect(result.current.leadsUnavailable).toBe(true));
    expect(result.current.candidates).toHaveLength(1);
  });
});

describe("candidatesApi bulk + undo hooks", () => {
  it("bulk create sends one createMany call with the inputs and returns row ids", async () => {
    createManyFn.mockResolvedValue({
      created: [{ leadKey: "48453:tcad:5", leadId: "L5" }],
      already: [],
      failed: [],
    });
    const { result } = renderHook(() => useBulkCreateLeads(), { wrapper });
    const input = { fips: "48453", requestIdentifier: "5" } as never;
    let out: Awaited<ReturnType<typeof result.current.run>> | undefined;
    await act(async () => {
      out = await result.current.run([{ id: "cid5", input }]);
    });
    expect(createManyFn).toHaveBeenCalledWith({ items: [input] });
    expect(out?.created).toEqual([
      { id: "cid5", result: { leadKey: "48453:tcad:5", leadId: "L5" } },
    ]);
  });

  it("undo sends exactly the given leads, each with its leadId, and tallies the answers", async () => {
    undoFn
      .mockResolvedValueOnce({ deleted: true })
      .mockResolvedValueOnce({ deleted: false, reason: "TOO_OLD" });
    const { result } = renderHook(() => useUndoCreatedLeads(), { wrapper });
    let tally: unknown;
    await act(async () => {
      tally = await result.current([
        { leadKey: "k1", leadId: "L1" },
        { leadKey: "k2", leadId: "L2" },
      ]);
    });
    expect(undoFn).toHaveBeenCalledWith({ leadKey: "k1", leadId: "L1" });
    expect(undoFn).toHaveBeenCalledWith({ leadKey: "k2", leadId: "L2" });
    expect(tally).toEqual({ undone: 1, refused: ["TOO_OLD"], failed: 0 });
  });
});

describe("candidatesApi permits (server-side filters and honest totals)", () => {
  it("asks the server for the status and open years instead of filtering in JavaScript", async () => {
    props = [property(1)];
    presenceFn.mockResolvedValue([]);
    const { result } = renderHook(
      () => useCandidates({ ...filters, permitStatus: "stalled", permitOpenYrs: 5 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(permitInputs[0]).toMatchObject({
      radiusMi: 5,
      sort: "openDays",
      statusClass: ["stalled"],
      openDaysMin: 1827,
    });
  });

  it("reports the server's permit total and that the page was clipped", async () => {
    props = [property(1)];
    presenceFn.mockResolvedValue([]);
    permitReply = { permits: [permit(1)], total: 1200, truncated: true };
    const { result } = renderHook(() => useCandidates(filters), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.permitTotal).toBe(1200);
    expect(result.current.permitsTruncated).toBe(true);
  });

  it("counts the ring from the server's total, not the page length", async () => {
    props = [property(1), property(2)];
    propertyCounts = { afterRadius: 340, afterRoofAge: 212 };
    presenceFn.mockResolvedValue([]);
    const { result } = renderHook(() => useCandidates(filters), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.totalInRing).toBe(212);
    expect(result.current.propertiesTruncated).toBe(true);
    expect(result.current.propertiesShown).toBe(2);
  });

  it("without counts (older reply) falls back to the rows it has", async () => {
    props = [property(1), property(2)];
    presenceFn.mockResolvedValue([]);
    const { result } = renderHook(() => useCandidates(filters), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.totalInRing).toBe(2);
    expect(result.current.propertiesTruncated).toBe(false);
  });
});

describe("candidatesApi lead marks unavailable (why)", () => {
  it("says the presence read failed", async () => {
    props = [property(1)];
    presenceFn.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useCandidates(filters), { wrapper });
    await waitFor(() => expect(result.current.leadsUnavailable).toBe(true));
    expect(result.current.leadsReason).toBe("failed");
  });

  it("says when the ring has more than 1,000 properties", async () => {
    props = Array.from({ length: 1001 }, (_, i) => property(i + 1));
    presenceFn.mockResolvedValue([]);
    const { result } = renderHook(() => useCandidates(filters), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.leadsUnavailable).toBe(true);
    expect(result.current.leadsReason).toBe("tooMany");
  });

  it("has no reason when the marks are all there", async () => {
    props = [property(1)];
    presenceFn.mockResolvedValue([]);
    const { result } = renderHook(() => useCandidates(filters), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.leadsReason).toBeNull();
  });
});
