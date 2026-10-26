// B-07: LeadDetail actions and states: loading, not-found/error, status change, note submit
// (trim, clear on success, guards while saving), missing-value reasons, not-in-run variants.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useLead = vi.fn();
const statusMutate = vi.fn();
const noteMutate = vi.fn();
const assignMutate = vi.fn();
let assignState: { isPending: boolean; error: unknown } = { isPending: false, error: null };
// "Me" is whoever the session says: this test signs in as `rep-me`.
vi.mock("../../src/routes/Leads/leadFormat", async (importActual) => ({
  ...(await importActual<typeof import("../../src/routes/Leads/leadFormat")>()),
  myIds: () => ["rep-me"],
}));
let statusState: { isPending: boolean; error: unknown } = { isPending: false, error: null };
let noteState: { isPending: boolean; error: unknown } = { isPending: false, error: null };
vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useLead: (...args: unknown[]) => useLead(...args),
  useUpdateLeadStatus: () => ({
    mutate: statusMutate,
    reset: vi.fn(),
    isSuccess: false,
    ...statusState,
  }),
  useAddLeadNote: () => ({ mutate: noteMutate, reset: vi.fn(), ...noteState }),
  useAssignLead: () => ({ mutate: assignMutate, reset: vi.fn(), ...assignState }),
}));

import { Component as LeadDetail } from "../../src/routes/Leads/LeadDetail";

afterEach(() => {
  cleanup();
  useLead.mockReset();
  statusMutate.mockReset();
  noteMutate.mockReset();
  assignMutate.mockReset();
  assignState = { isPending: false, error: null };
  statusState = { isPending: false, error: null };
  noteState = { isPending: false, error: null };
});

const KEY = "48453:tcad:0201885122";
const base = {
  leadId: "01J0LEAD",
  leadKey: KEY,
  address: "TCAD 0201885122",
  lat: 30.27,
  lon: -97.74,
  status: "contacted" as const,
  assignee: "rep@example.com",
  createdFrom: "map" as const,
  sourceManifestCid: "bafkreimanifestold",
  createdAt: "2026-10-20T09:14:00Z",
  eventSequence: 0,
  signals: { capturedAt: "2026-10-20T00:00:00Z" },
  notes: [] as unknown[],
  history: [] as unknown[],
  notInCurrentRun: false,
};

function show(data: Record<string, unknown> = {}): void {
  useLead.mockReturnValue({ status: "success", data: { ...base, ...data }, refetch: vi.fn() });
}

function renderDetail(): void {
  render(
    <MemoryRouter initialEntries={[`/leads/${encodeURIComponent(KEY)}`]}>
      <Routes>
        <Route path="/leads/:leadKey" element={<LeadDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LeadDetail load states", () => {
  it("asks for the lead named in the route and shows a skeleton, not an error, while loading", () => {
    useLead.mockReturnValue({ status: "pending" });
    renderDetail();
    expect(useLead).toHaveBeenCalledWith(KEY);
    expect(screen.queryByRole("alert")).toBeNull();
    // The title comes from the link while the data loads; no signals or notes are drawn yet.
    expect(screen.getByRole("heading", { name: "TCAD 0201885122" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Notes" })).toBeNull();
    expect(screen.getByRole("progressbar", { name: "Loading the lead" })).toBeTruthy();
  });

  it("shows a Retry banner for a lead that cannot be loaded (including not found)", () => {
    const refetch = vi.fn();
    useLead.mockReturnValue({ status: "error", error: new Error("NOT_FOUND"), refetch });
    renderDetail();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load/i);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("LeadDetail status change", () => {
  it("saves the chosen status for this lead", () => {
    show();
    renderDetail();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "won" } });
    expect(statusMutate).toHaveBeenCalledWith({ leadKey: KEY, status: "won", expectedSequence: 0 });
  });

  it("disables the status select while a change is saving and shows no save error", () => {
    show();
    statusState = { isPending: true, error: null };
    renderDetail();
    expect(screen.getByLabelText("Status").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells the rep when the status could not be saved", () => {
    show();
    statusState = { isPending: false, error: new Error("CONFLICT") };
    renderDetail();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t save the status/i);
  });
});

describe("LeadDetail notes", () => {
  it("submits the trimmed note and clears the box only once the save succeeds", () => {
    show();
    renderDetail();
    const box = screen.getByLabelText("Add a note") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "  Left voicemail  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(noteMutate).toHaveBeenCalledTimes(1);
    expect(noteMutate.mock.calls[0]?.[0]).toEqual({
      leadKey: KEY,
      text: "Left voicemail",
      expectedSequence: 0,
    });
    expect(box.value).toBe("  Left voicemail  ");
    const options = noteMutate.mock.calls[0]?.[1] as { onSuccess: () => void };
    act(() => options.onSuccess());
    expect(box.value).toBe("");
  });

  it("does not submit an empty or whitespace-only note", () => {
    show();
    renderDetail();
    fireEvent.change(screen.getByLabelText("Add a note"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(noteMutate).not.toHaveBeenCalled();
  });

  it("caps the note at 4000 characters", () => {
    show();
    renderDetail();
    expect(screen.getByLabelText("Add a note").getAttribute("maxlength")).toBe("4000");
  });

  it("disables Add note while the note itself is saving", () => {
    show();
    noteState = { isPending: true, error: null };
    renderDetail();
    expect(screen.getByRole("button", { name: "Add note" }).hasAttribute("disabled")).toBe(true);
  });

  it("tells the rep when the note could not be saved", () => {
    show();
    noteState = { isPending: false, error: new Error("x") };
    renderDetail();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t save the note/i);
  });

  it("shows empty notes/history messages, and a stored note as the rep's own words", () => {
    show();
    renderDetail();
    expect(screen.getByText("No notes yet.")).toBeTruthy();
    expect(screen.getByText("No history yet.")).toBeTruthy();
    cleanup();
    show({
      notes: [
        {
          sequence: 1,
          at: "2026-10-21T10:00:00Z",
          by: "rep@example.com",
          change: 'note: "Said \\"call back\\" & left msg"',
          kind: "note",
        },
      ],
    });
    renderDetail();
    expect(screen.getByText('Said "call back" & left msg')).toBeTruthy();
    expect(screen.getByText("rep@example.com · Oct 21, 10:00 UTC")).toBeTruthy();
  });
});

describe("LeadDetail signals", () => {
  it("says why each missing signal is missing instead of leaving it blank", () => {
    show();
    renderDetail();
    for (const reason of [
      "Roof age not available",
      "No open permit at capture",
      "Not saved with the lead (created before the contractor was recorded)",
      "Not saved with the lead",
    ]) {
      expect(screen.getByText(reason)).toBeTruthy();
    }
    expect(screen.getByText(/collected 2026-10-20 00:00:00 UTC/)).toBeTruthy();
  });

  it("shows present signals including permit age in days and BBB rating", () => {
    show({
      signals: {
        roofAgeYears: 23,
        roofAgeBasis: "permit",
        openPermitId: "BP-9",
        openDays: 41,
        contractor: "ACME ROOFING",
        bbbRating: "A+",
        capturedAt: "2026-10-20T00:00:00Z",
      },
    });
    renderDetail();
    expect(screen.getByText("23 yrs")).toBeTruthy();
    expect(screen.getByText("Basis: Last reroof permit")).toBeTruthy();
    expect(screen.getByText("BP-9")).toBeTruthy();
    expect(screen.getByText("open 41 days (0.1 yrs)")).toBeTruthy();
    expect(screen.getByText("A+")).toBeTruthy();
  });

  it("says the basis is missing when a roof age has none", () => {
    show({ signals: { roofAgeYears: 23, capturedAt: "2026-10-20T00:00:00Z" } });
    renderDetail();
    expect(screen.getByText("Basis not available")).toBeTruthy();
  });

  it("shows an open permit without a day count when the age is unknown", () => {
    show({ signals: { openPermitId: "BP-9", capturedAt: "2026-10-20T00:00:00Z" } });
    renderDetail();
    expect(screen.getByText("BP-9")).toBeTruthy();
  });

  it("not in run, run id absent: generic heading, no current-manifest sentence", () => {
    show({
      notInCurrentRun: true,
      signals: { roofAgeYears: 23, capturedAt: "2026-10-20T00:00:00Z" },
    });
    renderDetail();
    const state = screen.getByTestId("not-in-run");
    expect(within(state).getByRole("heading", { name: "Not in the current run" })).toBeTruthy();
    expect(within(state).queryByText(/the run now served is manifest/)).toBeNull();
    expect(screen.queryByText("23 yrs")).toBeNull();
  });

  it("not in run, run and manifest known: names both and still withholds signals", () => {
    show({
      notInCurrentRun: true,
      currentRunId: "run-9",
      currentManifestCid: "bafkreicurrent",
      signals: { roofAgeYears: 23, capturedAt: "2026-10-20T00:00:00Z" },
    });
    renderDetail();
    const state = screen.getByTestId("not-in-run");
    expect(within(state).getByRole("heading", { name: "Not in run run-9" })).toBeTruthy();
    expect(within(state).getByText(/the run now served is manifest/)).toBeTruthy();
    expect(within(state).getByText(/Signals withheld/)).toBeTruthy();
    expect(screen.queryByText("23 yrs")).toBeNull();
  });
});

describe("LeadDetail Assign to me", () => {
  it("offers the button when someone else holds the lead, and assigns with the loaded sequence", () => {
    show({ assignee: "rep-other", eventSequence: 4 });
    renderDetail();
    const button = screen.getByRole("button", { name: "Assign this lead to me" });
    fireEvent.click(button);
    expect(assignMutate).toHaveBeenCalledWith(
      { leadKey: KEY, expectedSequence: 4 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("shows nothing extra when the lead is already mine", () => {
    show({ assignee: "rep-me" });
    renderDetail();
    expect(screen.queryByRole("button", { name: /assign/i })).toBeNull();
    expect(screen.getByText("Assignee: Me")).toBeTruthy();
  });

  it("says Assigned to you after success", () => {
    show({ assignee: "rep-other" });
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Assign this lead to me" }));
    const opts = assignMutate.mock.calls[0]?.[1] as { onSuccess: () => void };
    act(() => opts.onSuccess());
    expect(screen.getByRole("status").textContent).toContain("Assigned to you");
  });

  it("on a stale sequence refetches and says the lead is shown as it is now", () => {
    const refetch = vi.fn();
    useLead.mockReturnValue({
      status: "success",
      data: { ...base, assignee: "rep-other" },
      refetch,
    });
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Assign this lead to me" }));
    const opts = assignMutate.mock.calls[0]?.[1] as { onError: (e: unknown) => void };
    act(() => opts.onError({ data: { appCode: "STALE_SEQUENCE" } }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/This lead changed while you were looking\./)).toBeTruthy();
  });

  it("disables the button while assigning", () => {
    assignState = { isPending: true, error: null };
    show({ assignee: "rep-other" });
    renderDetail();
    expect(
      (screen.getByRole("button", { name: "Assign this lead to me" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("a failed assignment shows an error banner with Try again", () => {
    assignState = { isPending: false, error: new Error("boom") };
    show({ assignee: "rep-other" });
    renderDetail();
    expect(screen.getByRole("alert").textContent).toContain("Couldn't assign the lead.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(assignMutate).toHaveBeenCalledTimes(1);
  });

  it("renders an assignee event in the history from what it stored, naming no one it does not know", () => {
    show({
      assignee: "rep-me",
      history: [
        {
          sequence: 1,
          at: "2026-10-21T09:00:00Z",
          by: "rep-me",
          kind: "assignee",
          change: "assignee: rep-other -> rep-me",
        },
        {
          sequence: 2,
          at: "2026-10-21T10:00:00Z",
          by: "rep-me",
          kind: "assignee",
          change: "odd text",
        },
      ],
    });
    renderDetail();
    expect(screen.getByText("Assigned to Me (was rep-other)")).toBeTruthy();
    expect(screen.getByText("Reassigned")).toBeTruthy();
  });
});
