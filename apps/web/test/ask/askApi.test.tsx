// B-09 T039: askApi.ts hooks run for real against a real QueryClient; only the tRPC option
// factories (`useTRPC`) are faked (same pattern as test/leads/leadsApi.test.tsx). Proves the ask
// input reaches `agent.ask` and the confirm input reaches `agent.confirmLead` verbatim.
// CR-B-09 finding 19: the hooks are typed by the real `AppRouter` from `@crm/api-client` — no
// `as unknown as` structural cast — so the result types are the router's own.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { AgentAnswer } from "@crm/shared";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

const askFn = vi.fn();
const confirmFn = vi.fn();
const indexInfoFn = vi.fn();

const fakeTrpc = {
  agent: {
    ask: { mutationOptions: () => ({ mutationFn: (v: unknown) => askFn(v) }) },
    confirmLead: { mutationOptions: () => ({ mutationFn: (v: unknown) => confirmFn(v) }) },
  },
  shell: {
    indexInfo: {
      queryOptions: () => ({ queryKey: [["shell", "indexInfo"]], queryFn: () => indexInfoFn() }),
    },
  },
};
vi.mock("@crm/api-client/react", () => ({ useTRPC: () => fakeTrpc }));

import { useAskAgent, useConfirmLead, useRunInfo } from "../../src/routes/Ask/askApi";

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("askApi", () => {
  it("useAskAgent sends the question and threadId to agent.ask verbatim", async () => {
    askFn.mockResolvedValue({ outcome: "answered" });
    const { result } = renderHook(() => useAskAgent(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ question: "roofs near Pflugerville", threadId: "t1" }),
    );
    expect(askFn).toHaveBeenCalledWith({ question: "roofs near Pflugerville", threadId: "t1" });
  });

  it("useConfirmLead sends threadId and tcadId to agent.confirmLead verbatim", async () => {
    confirmFn.mockResolvedValue({ leadId: "L1" });
    const { result } = renderHook(() => useConfirmLead(), { wrapper });
    await act(() => result.current.mutateAsync({ threadId: "t1", tcadId: "0201885122" }));
    expect(confirmFn).toHaveBeenCalledWith({ threadId: "t1", tcadId: "0201885122" });
  });

  it("useRunInfo reads the promoted run from shell.indexInfo (the data chip's own query)", async () => {
    indexInfoFn.mockResolvedValue({ runId: "3" });
    const { result } = renderHook(() => useRunInfo(), { wrapper });
    await vi.waitFor(() => expect(result.current.data?.runId).toBe("3"));
    expect(indexInfoFn).toHaveBeenCalledTimes(1);
  });

  it("is typed by the real AppRouter: agent.ask's data is an AgentAnswer (CR finding 19)", () => {
    type AskData = NonNullable<ReturnType<typeof useAskAgent>["data"]>;
    expectTypeOf<AskData["outcome"]>().toEqualTypeOf<AgentAnswer["outcome"]>();
    expectTypeOf<AskData["candidates"]>().toEqualTypeOf<AgentAnswer["candidates"]>();
  });

  it("does not cast the tRPC client (no `as unknown as`)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "../../src/routes/Ask/askApi.ts"), "utf8");
    expect(source).not.toMatch(/as unknown as/);
  });
});
