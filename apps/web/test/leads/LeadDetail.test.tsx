// B-07 T021: LeadDetail (AC-5, FR-005, constitution XI). When the lead is not in the current run
// the signals snapshot must NOT be rendered as current: a MissingValue-style "Not in Run" state
// replaces it, with the snapshot's provenance still visible as history.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useLead = vi.fn();
let statusPending = false;
vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useLead: (...args: unknown[]) => useLead(...args),
  useUpdateLeadStatus: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: statusPending }),
  useAddLeadNote: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
  useAssignLead: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));

import { Component as LeadDetail } from "../../src/routes/Leads/LeadDetail";

afterEach(() => {
  cleanup();
  useLead.mockReset();
  statusPending = false;
});

const base = {
  leadId: "01J0LEAD",
  leadKey: "48453:tcad:0201885122",
  address: "TCAD 0201885122",
  lat: 30.27,
  lon: -97.74,
  status: "contacted" as const,
  assignee: "rep@example.com",
  createdFrom: "map" as const,
  sourceManifestCid: "bafkreimanifestold",
  createdAt: "2026-10-20T09:14:00Z",
  eventSequence: 2,
  signals: {
    roofAgeYears: 23,
    roofAgeBasis: "permit",
    contractor: "ACME ROOFING",
    capturedAt: "2026-10-20T00:00:00Z",
  },
  notes: [
    {
      sequence: 2,
      at: "2026-10-21T10:00:00Z",
      by: "rep@example.com",
      change: "Called owner",
      kind: "note" as const,
    },
  ],
  history: [
    {
      sequence: 0,
      at: "2026-10-20T09:14:00Z",
      by: "rep@example.com",
      change: "Created from map",
      kind: "create" as const,
    },
    {
      sequence: 1,
      at: "2026-10-20T11:00:00Z",
      by: "rep@example.com",
      change: "new -> contacted",
      kind: "statusChange" as const,
    },
  ],
  notInCurrentRun: false,
};

function renderDetail(): void {
  render(
    <MemoryRouter initialEntries={["/leads/48453:tcad:0201885122"]}>
      <Routes>
        <Route path="/leads/:leadKey" element={<LeadDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LeadDetail", () => {
  it("shows the signals snapshot with provenance when the lead is in the current run", () => {
    useLead.mockReturnValue({ status: "success", data: base, refetch: vi.fn() });
    renderDetail();
    expect(screen.getByText(/23 yrs/)).toBeTruthy();
    expect(screen.getByText(/ACME ROOFING/)).toBeTruthy();
    expect(screen.queryByText(/not in the current run/i)).toBeNull();
    expect(screen.getByText("Called owner")).toBeTruthy();
    expect(screen.getByText("Status: New → Contacted")).toBeTruthy();
  });

  it("shows the saved roof-age confidence for a new lead", () => {
    useLead.mockReturnValue({
      status: "success",
      data: { ...base, signals: { ...base.signals, roofAgeConfidence: "low" } },
      refetch: vi.fn(),
    });
    renderDetail();
    expect(screen.getByText("Confidence: Low")).toBeTruthy();
  });

  it("says honestly when an older lead has no saved confidence", () => {
    useLead.mockReturnValue({ status: "success", data: base, refetch: vi.fn() });
    renderDetail();
    expect(
      screen.getByText("Confidence not saved with this lead (created before it was recorded)"),
    ).toBeTruthy();
  });

  it("renders the not-in-run state and never renders the signals as current", () => {
    useLead.mockReturnValue({
      status: "success",
      data: { ...base, notInCurrentRun: true },
      refetch: vi.fn(),
    });
    renderDetail();
    const state = screen.getByTestId("not-in-run");
    expect(within(state).getByText(/not in the current run/i)).toBeTruthy();
    // the snapshot values must not appear as current anywhere in the "Current signals" section
    expect(screen.queryByText(/23 yrs/)).toBeNull();
    expect(screen.queryByText(/ACME ROOFING/)).toBeNull();
    // status/assignee/notes/history (the rep's own work) remain
    expect(screen.getByText("Called owner")).toBeTruthy();
  });

  it("names the current run in the not-in-run heading when its id is known", () => {
    useLead.mockReturnValue({
      status: "success",
      data: { ...base, notInCurrentRun: true, currentRunId: "travis-run-2" },
      refetch: vi.fn(),
    });
    renderDetail();
    expect(
      within(screen.getByTestId("not-in-run")).getByText("Not in run travis-run-2"),
    ).toBeTruthy();
  });

  it("disables Add note while the status change is saving (race guard)", () => {
    useLead.mockReturnValue({ status: "success", data: base, refetch: vi.fn() });
    renderDetail();
    fireEvent.change(screen.getByLabelText("Add a note"), { target: { value: "Called" } });
    expect(screen.getByRole("button", { name: "Add note" }).hasAttribute("disabled")).toBe(false);
    cleanup();
    statusPending = true;
    renderDetail();
    fireEvent.change(screen.getByLabelText("Add a note"), { target: { value: "Called" } });
    expect(screen.getByRole("button", { name: "Add note" }).hasAttribute("disabled")).toBe(true);
  });

  // Found removing the leadsApi double cast: the router's `leads.get` returns `signals` as
  // `LeadSignals | undefined` (no SIGNALS item stored), which the hand-written type hid, so this
  // case crashed the page. It now says why the snapshot is missing, with the manifest provenance.
  it("says why when an in-run lead has no stored signals snapshot, instead of crashing", () => {
    useLead.mockReturnValue({
      status: "success",
      data: { ...base, signals: undefined },
      refetch: vi.fn(),
    });
    renderDetail();
    const section = screen.getByRole("region", { name: "Current signals" });
    expect(within(section).getByText("No signals snapshot stored for this lead")).toBeTruthy();
    expect(screen.queryByText(/23 yrs/)).toBeNull();
    expect(screen.getByText("Called owner")).toBeTruthy();
  });

  it("shows an error banner when the lead cannot be loaded", () => {
    useLead.mockReturnValue({ status: "error", error: new Error("x"), refetch: vi.fn() });
    renderDetail();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
