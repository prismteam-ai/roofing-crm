// "My leads" layer (CRM-HANDOFF E-52/E-72): the marker ring by lead status (line style, not colour
// alone), the legend line and the hook that reads which properties in the ring are leads.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dot } from "../../../src/components/Map/CrmMap";
import { MapLegend } from "../../../src/components/Map/MapLegend.js";

const presenceFn = vi.fn();
vi.mock("@crm/api-client/react", () => ({
  useTRPC: () => ({
    leads: {
      presence: {
        queryOptions: (input: { requestIdentifiers: string[] }) => ({
          queryKey: ["leads.presence", input],
          queryFn: () => presenceFn(input),
        }),
      },
    },
  }),
}));

import {
  LEAD_PRESENCE_LIMIT,
  LEAD_PRESENCE_MAX_CALLS,
  useLeadMarks,
} from "../../../src/routes/Map/Candidates/useLeadMarks";

afterEach(cleanup);

describe("dot lead ring", () => {
  const cases = [
    ["new", "solid"],
    ["contacted", "dashed"],
    ["qualified", "double"],
    ["won", "double"],
    ["lost", "dotted"],
  ] as const;

  it.each(cases)("%s is drawn %s, as an outline outside the dot", (status, style) => {
    const el = dot("red", false, "round", false, undefined, status);
    expect(el.style.outlineStyle).toBe(style);
    expect(el.style.outlineWidth).toBe("3px");
    expect(el.style.outlineColor).toMatch(/^var\(--md-sys-color-/);
    expect(el.dataset.leadStatus).toBe(status);
    // The roof colour and the border stay.
    expect(el.style.background).toBe("red");
    expect(el.style.border).toContain("2px solid");
  });

  it("has no ring without a lead, and leaves the long-open ring and triage ring in place", () => {
    const plain = dot("red", false);
    expect(plain.dataset.leadStatus).toBeUndefined();
    expect(plain.style.outline).toBe("5px solid transparent");
    const both = dot("red", true, "round", true, undefined, "contacted");
    expect(both.style.border).toContain("3px solid");
    expect(both.style.boxShadow).toContain("--md-sys-color-primary");
    expect(both.style.outlineStyle).toBe("dashed");
  });
});

describe("MapLegend lead line", () => {
  it("explains the ring when My leads is on, and says why some may be missing", () => {
    render(
      <MapLegend
        mode="detail"
        roofs
        permits={false}
        leads
        leadsNote="Too many to mark."
        loadedCount={3}
      />,
    );
    expect(
      screen.getByText(
        "Ringed = already a lead (solid New, dashed Contacted, double Qualified and Won, dotted Lost)",
      ),
    ).not.toBeNull();
    expect(screen.getByText("Too many to mark.")).not.toBeNull();
  });

  it("omits the line when the layer is off", () => {
    render(<MapLegend mode="detail" roofs permits={false} loadedCount={3} />);
    expect(screen.queryByText(/Ringed = already a lead/)).toBeNull();
  });
});

describe("useLeadMarks", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const props = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ requestIdentifier: String(1000 + i) }));

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    presenceFn.mockReset();
  });

  it("maps request identifier to the lead's status", async () => {
    presenceFn.mockResolvedValue([{ leadKey: "48453:tcad:1001", leadId: "l1", status: "won" }]);
    const { result } = renderHook(() => useLeadMarks(props(3)), { wrapper });
    await waitFor(() => expect(result.current.marks.get("1001")?.status).toBe("won"));
    expect(result.current.marks.get("1000")).toBeUndefined();
    expect(result.current.unavailable).toBe(false);
    expect(result.current.reason).toBeNull();
  });

  it("asks in chunks of 100 and stops at the call cap, saying the ring is too large", async () => {
    presenceFn.mockResolvedValue([]);
    const n = LEAD_PRESENCE_LIMIT * LEAD_PRESENCE_MAX_CALLS + 1;
    const { result } = renderHook(() => useLeadMarks(props(n)), { wrapper });
    await waitFor(() => expect(presenceFn).toHaveBeenCalledTimes(LEAD_PRESENCE_MAX_CALLS));
    expect(presenceFn.mock.calls[0]?.[0].requestIdentifiers).toHaveLength(LEAD_PRESENCE_LIMIT);
    expect(result.current.reason).toBe("tooMany");
    expect(result.current.unavailable).toBe(true);
  });

  it("reports a failed read instead of showing no leads", async () => {
    presenceFn.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useLeadMarks(props(2)), { wrapper });
    await waitFor(() => expect(result.current.reason).toBe("failed"));
    expect(result.current.unavailable).toBe(true);
    expect(result.current.marks.size).toBe(0);
  });

  it("reads nothing while disabled", () => {
    renderHook(() => useLeadMarks(props(2), false), { wrapper });
    expect(presenceFn).not.toHaveBeenCalled();
  });
});
