// B-07 T020: LeadsList states (AC-4 + edge cases). The leads API hooks are mocked; the component
// must show an explicit empty state, never an error or an endless spinner, and flag leads that are
// not in the current run instead of showing them as current.
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useLeadsList = vi.fn();
vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useLeadsList: (...args: unknown[]) => useLeadsList(...args),
}));

import { Component as LeadsList } from "../../src/routes/Leads/LeadsList";

afterEach(() => {
  cleanup();
  useLeadsList.mockReset();
});

function renderAt(url: string): void {
  render(
    <MemoryRouter initialEntries={[url]}>
      <LeadsList />
    </MemoryRouter>,
  );
}

const lead = {
  leadId: "01J0LEAD",
  leadKey: "48453:tcad:0201885122",
  address: "TCAD 0201885122",
  lat: 30.27,
  lon: -97.74,
  status: "new" as const,
  assignee: "rep@example.com",
  createdFrom: "map" as const,
  sourceManifestCid: "bafkreimanifest",
  createdAt: "2026-10-20T09:14:00Z",
  eventSequence: 0,
  notInCurrentRun: false,
};

describe("LeadsList", () => {
  it("shows an explicit empty state when there are no leads at all", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [], totalCount: 0 },
      refetch: vi.fn(),
    });
    renderAt("/leads");
    expect(screen.getByRole("heading", { name: /no leads yet/i })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/loading/i)).toBeNull();
  });

  it("shows a distinct no-match state when filters match zero leads", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [], totalCount: 0 },
      refetch: vi.fn(),
    });
    renderAt("/leads?roof=25&permit=stalled");
    expect(screen.getByRole("heading", { name: /no leads match these filters/i })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error banner with Retry on failure", () => {
    useLeadsList.mockReturnValue({ status: "error", error: new Error("x"), refetch: vi.fn() });
    renderAt("/leads");
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("lists leads with the total, link to detail, and flags a lead not in the current run", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: {
        leads: [
          lead,
          { ...lead, leadId: "01J0GONE", leadKey: "48453:tcad:0000000000", notInCurrentRun: true },
        ],
        totalCount: 2,
      },
      refetch: vi.fn(),
    });
    renderAt("/leads");
    expect(screen.getByText("2 leads")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /TCAD 0201885122/ })).toHaveLength(2);
    // the pill on the row and ONE count line: no second full-width banner
    expect(screen.getAllByText(/not in the current run/i)).toHaveLength(2);
    expect(screen.getByText(/1 not in the current run keeps its snapshot/i)).toBeTruthy();
    expect(screen.queryByText(/Property not in the current run/)).toBeNull();
    expect(screen.queryByText(/Status, notes and history are complete/)).toBeNull();
  });

  it("passes URL filters to leads.list", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [], totalCount: 0 },
      refetch: vi.fn(),
    });
    renderAt("/leads?roof=20&permit=open");
    expect(useLeadsList).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ roofAgeMinYears: 20, permitStatus: "open" }),
      }),
    );
  });

  it("the table columns are Lead, Status, Roof, Main permit, Last activity", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [lead], totalCount: 1 },
      refetch: vi.fn(),
    });
    renderAt("/leads");
    const head = document.querySelector("[aria-hidden='true'][class*='thead']");
    expect(Array.from(head?.children ?? []).map((c) => c.textContent)).toEqual([
      "Lead",
      "Status",
      "Roof",
      "Main permit",
      "Last activity",
    ]);
  });

  it("without the new API fields every cell says why, and invents nothing", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [lead], totalCount: 1 },
      refetch: vi.fn(),
    });
    renderAt("/leads");
    const row = screen.getByRole("listitem");
    expect(within(row).getAllByText("Signals not saved for this lead")).toHaveLength(2);
    expect(row.textContent).not.toMatch(/yrs|Open \d+ days/);
    // last activity falls back to the creation time, which is stored
    expect(within(row).getByText(/Created/)).toBeTruthy();
    expect(row.querySelector("time")?.getAttribute("datetime")).toBe(lead.createdAt);
  });

  it("null signals and null last activity (new API, older lead) read the same", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [{ ...lead, signals: null, lastActivity: null }], totalCount: 1 },
      refetch: vi.fn(),
    });
    renderAt("/leads");
    expect(within(screen.getByRole("listitem")).getAllByText(/Signals not saved/)).toHaveLength(2);
  });

  it("with the new fields: roof, main permit and last activity fill in; assignee and source fold into the cells", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: {
        leads: [
          {
            ...lead,
            status: "contacted",
            signals: {
              roofAgeYears: 23,
              roofAgeBasis: "permit",
              openPermitId: "2003-012345 BP",
              openDays: 2336,
              contractor: "Acme Roofing",
              capturedAt: "2026-10-20T00:00:00Z",
            },
            lastActivity: {
              at: "2026-10-20T15:02:00Z",
              kind: "note",
              excerpt: "Left a door hanger.",
            },
          },
        ],
        totalCount: 1,
      },
      refetch: vi.fn(),
    });
    renderAt("/leads");
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("23 yrs")).toBeTruthy();
    expect(within(row).getByText("Last reroof permit")).toBeTruthy();
    expect(within(row).getByText("Open 2336 days")).toBeTruthy();
    expect(within(row).getByText("6.4 yrs · 2003-012345 BP")).toBeTruthy();
    expect(within(row).getByText("Acme Roofing")).toBeTruthy();
    expect(within(row).getByText("Oct 20, 15:02 UTC")).toBeTruthy();
    expect(within(row).getByText("Note: Left a door hanger.")).toBeTruthy();
    expect(row.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-20T15:02:00Z");
    // Assignee sits under the status pill, the source under the lead; no separate From / Created cells.
    expect(within(row).getByText("rep@example.com")).toBeTruthy();
    expect(within(row).getByText("From Map")).toBeTruthy();
    expect(within(row).queryByText("Oct 20, 09:14 UTC")).toBeNull();
  });

  it("a lead that was only created says Created with its time (the e2e reads this)", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: {
        leads: [{ ...lead, lastActivity: { at: lead.createdAt, kind: "created" } }],
        totalCount: 1,
      },
      refetch: vi.fn(),
    });
    renderAt("/leads");
    expect(screen.getByRole("listitem").textContent).toMatch(
      /Created \w{3} \d{1,2}, \d{2}:\d{2} UTC/,
    );
  });
});
