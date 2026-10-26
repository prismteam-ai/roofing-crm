// The Candidate list over mocked data hooks: rows with the lead mark, Hide existing leads, the
// selection bar, the confirmation sheet with skipped duplicates, the bulk result snackbar, and
// the loading / empty / error / partial states of the boards.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidatesResult } from "../../src/routes/Map/Candidates/candidatesApi";
import { candidates, FILTERS, must, permit, property } from "./fixtures";

let result: CandidatesResult;
const run = vi.fn();
const undoCreated = vi.fn();
vi.mock("../../src/routes/Map/Candidates/candidatesApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/routes/Map/Candidates/candidatesApi")>()),
  useCandidates: () => result,
  useBulkCreateLeads: () => ({ run, state: { running: false, done: 0, total: 0 } }),
  useUndoCreatedLeads: () => undoCreated,
}));

import { CandidateList } from "../../src/routes/Map/Candidates/CandidateList";

const ready = (over: Partial<CandidatesResult> = {}): CandidatesResult => ({
  status: "ready",
  candidates: candidates(
    [property(1), property(2), property(3)],
    [permit(1), permit(2), permit(3, { statusClass: "open", openDays: 1400 })],
    [{ leadKey: "48453:tcad:0201885121", leadId: "L-1", status: "contacted" }],
  ),
  totalInRing: 3,
  permitsUnavailable: false,
  permitTotal: 3,
  permitsTruncated: false,
  propertiesTruncated: false,
  propertiesShown: 3,
  leadsUnavailable: false,
  leadsReason: null,
  refetch: vi.fn(),
  ...over,
});

const mount = (props: Partial<React.ComponentProps<typeof CandidateList>> = {}) =>
  render(
    <MemoryRouter>
      <CandidateList filters={FILTERS} {...props} />
    </MemoryRouter>,
  );

beforeEach(() => {
  result = ready();
  run.mockReset();
  undoCreated.mockReset();
});
afterEach(cleanup);

describe("CandidateList", () => {
  it("shows one row per candidate with TCAD title, never an invented address", () => {
    mount();
    const rows = document.querySelectorAll("[data-candidate-row]");
    expect(rows).toHaveLength(3);
    expect(screen.getAllByText(/^TCAD 02018851/)).toHaveLength(3);
    expect(screen.getAllByText(/Address not published in this run/).length).toBeGreaterThan(0);
  });

  it("marks existing leads with Lead · {status} (E-52) and links to the lead", () => {
    mount();
    const mark = screen.getByText("Lead · Contacted");
    expect(mark.closest("a")?.getAttribute("href")).toBe("/leads/48453%3Atcad%3A0201885121");
  });

  it("Hide existing leads removes lead rows and says how many are hidden", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Hide existing leads/ }));
    expect(document.querySelectorAll("[data-candidate-row]")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Existing leads hidden \(1\)/ })).toBeTruthy();
    expect(screen.getByText("Matches").textContent).toContain("2");
  });

  it("opens the Why is this a lead? chips", () => {
    mount();
    fireEvent.click(must(screen.getAllByRole("button", { name: "Why is this a lead?" })[0]));
    expect(screen.getAllByText(/Roof \d+ yrs ≥ 15/).length).toBeGreaterThan(0);
  });

  it("selecting rows shows the bar, numbers the selection and clears", () => {
    mount();
    fireEvent.click(must(screen.getAllByRole("checkbox", { name: /Select TCAD/ })[1]));
    fireEvent.click(must(screen.getAllByRole("checkbox", { name: /Select TCAD/ })[2]));
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create 2 leads" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText(/selected$/)).toBeNull();
  });

  it("confirmation lists the main signal and skips rows that are already leads", () => {
    mount();
    for (const box of screen.getAllByRole("checkbox", { name: /Select TCAD/ }))
      fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Create 3 leads" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Create 2 leads?");
    expect(within(dialog).getByText("3 selected · 1 already a lead, skipped")).toBeTruthy();
    expect(within(dialog).getByText("Already a lead · Contacted · skipped")).toBeTruthy();
    expect(within(dialog).getAllByText(/Main signal: Permit/).length).toBe(3);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends only new properties, then reports created and already-a-lead with Open Leads", async () => {
    run.mockResolvedValue({
      created: [{ id: "x", result: { leadKey: "48453:tcad:0201885122", leadId: "L-9" } }],
      already: ["y"],
      failed: [],
    });
    mount();
    for (const box of screen.getAllByRole("checkbox", { name: /Select TCAD/ }))
      fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Create 3 leads" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Create 2 leads" }),
    );
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const sent = must(run.mock.calls[0])[0] as { input: { createdFrom: string } }[];
    expect(sent).toHaveLength(2);
    expect(sent.every((s) => s.input.createdFrom === "list")).toBe(true);
    // 1 created + (1 known lead + 1 refused by the server) already leads.
    expect(await screen.findByText("1 lead created · 2 already leads")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Leads" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("Undo removes only the leads that create made and reports what the server kept", async () => {
    run.mockResolvedValue({
      created: [
        { id: "a", result: { leadKey: "48453:tcad:0201885122", leadId: "L-9" } },
        { id: "b", result: { leadKey: "48453:tcad:0201885123", leadId: "L-10" } },
      ],
      already: [],
      failed: [],
    });
    undoCreated.mockResolvedValue({ undone: 1, refused: ["CHANGED"], failed: 0 });
    mount();
    for (const box of screen.getAllByRole("checkbox", { name: /Select TCAD/ }))
      fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Create 3 leads" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Create 2 leads" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(undoCreated).toHaveBeenCalledTimes(1));
    expect(must(undoCreated.mock.calls[0])[0]).toEqual([
      { leadKey: "48453:tcad:0201885122", leadId: "L-9" },
      { leadKey: "48453:tcad:0201885123", leadId: "L-10" },
    ]);
    expect(
      await screen.findByText("Undid 1 lead · 1 kept (it was updated after it was created)"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("keeps an inline Created n leads row with Undo after the snackbar is gone (15 min window)", async () => {
    run.mockResolvedValue({
      created: [{ id: "a", result: { leadKey: "48453:tcad:0201885122", leadId: "L-9" } }],
      already: [],
      failed: [],
    });
    mount();
    for (const box of screen.getAllByRole("checkbox", { name: /Select TCAD/ }))
      fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Create 3 leads" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Create 2 leads" }),
    );
    const row = await screen.findByText(/^Created 1 lead/);
    // The snackbar is short and has no Undo of its own; Open Leads stays on it.
    const snackbar = document.querySelector("[data-snackbar]") as HTMLElement;
    expect(within(snackbar).queryByRole("button", { name: "Undo" })).toBeNull();
    fireEvent.click(within(snackbar).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("1 lead created · 0 already leads")).toBeNull();
    expect(row.isConnected).toBe(true);
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide undo" }));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("offers no Undo when nothing was created", async () => {
    run.mockResolvedValue({ created: [], already: ["y"], failed: [] });
    mount();
    for (const box of screen.getAllByRole("checkbox", { name: /Select TCAD/ }))
      fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Create 3 leads" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Create 2 leads" }),
    );
    await screen.findByText(/0 leads created/);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("loading, error with Retry, empty with Widen / Roof chips, partial", () => {
    result = ready({ status: "loading", candidates: [] });
    const { unmount } = mount();
    expect(screen.getByText("Loading candidates from the lead index…")).toBeTruthy();
    unmount();

    const refetch = vi.fn();
    result = ready({ status: "error", candidates: [], refetch });
    const second = mount();
    expect(screen.getByText("Results unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
    second.unmount();

    result = ready({ candidates: [], totalInRing: 0 });
    const onRadiusChange = vi.fn();
    const onRoofChange = vi.fn();
    const third = mount({ onRadiusChange, onRoofChange });
    expect(screen.getByText("No roofs match within 5 mi.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Widen to 6 mi" }));
    fireEvent.click(screen.getByRole("button", { name: "Roof ≥ 13 yrs" }));
    expect(onRadiusChange).toHaveBeenCalledWith(6);
    expect(onRoofChange).toHaveBeenCalledWith(13);
    third.unmount();

    result = ready({
      permitsUnavailable: true,
      candidates: candidates([property(1), property(2), property(3)]),
    });
    mount();
    expect(screen.getByText(/Permit data couldn’t be read/)).toBeTruthy();
    expect(screen.getAllByText("Permits not loaded").length).toBe(3);
  });

  it("says so when the server clipped the permits, with the server's total", () => {
    result = ready({ permitTotal: 12345, permitsTruncated: true });
    mount();
    expect(
      screen.getByText(
        "Showing the 500 longest-open of 12,345 permits in range; narrow the radius or filters.",
      ),
    ).toBeTruthy();
  });

  it("says so when the nearest properties are clipped, with the server's total", () => {
    result = ready({ totalInRing: 340, propertiesTruncated: true, propertiesShown: 100 });
    mount();
    expect(screen.getByText(/Showing the nearest 100 of 340 properties/)).toBeTruthy();
  });

  it("says lead marks could not be checked when the presence read failed", () => {
    result = ready({ leadsUnavailable: true, leadsReason: "failed" });
    mount();
    const note = document.querySelector('[data-state="CrmCandidatesLeadsUnavailable"]');
    expect(note?.textContent).toContain(
      "Lead marks couldn't be checked for this ring, so some properties already in Leads may not show a Lead pill. Duplicates are still refused on create.",
    );
  });

  it("says why differently when the ring has more than 1,000 properties", () => {
    result = ready({ leadsUnavailable: true, leadsReason: "tooMany" });
    mount();
    expect(
      document.querySelector('[data-state="CrmCandidatesLeadsUnavailable"]')?.textContent,
    ).toContain(
      "More than 1,000 properties are in this ring, so lead marks are not shown; narrow the radius.",
    );
  });

  it("shows no lead-marks note when the marks are all there", () => {
    mount();
    expect(document.querySelector('[data-state="CrmCandidatesLeadsUnavailable"]')).toBeNull();
  });

  it("says nothing about clipping when everything came back", () => {
    mount();
    expect(screen.queryByText(/longest-open of/)).toBeNull();
    expect(screen.queryByText(/nearest/)).toBeNull();
  });

  describe("empty states and the header count", () => {
    const PERMIT_FILTERS = {
      ...FILTERS,
      roofAgeMinYears: undefined,
      permitStatus: "open" as const,
      permitOpenYrs: 5,
    };

    it("permit-only empty: names the permit filter, says why, and the header count is the server's 0", () => {
      result = ready({ candidates: [], totalInRing: 0 });
      mount({ filters: PERMIT_FILTERS });
      const empty = document.querySelector('[data-state="CrmCandidatesEmpty390"]') as HTMLElement;
      expect(empty.textContent).toContain(
        "No properties with an open permit (open 5+ yrs) within 5 mi.",
      );
      expect(empty.textContent).not.toMatch(/roofs match/);
      expect(empty.textContent).toContain("Open includes stalled permits");
      expect(
        document.querySelector(".num, [data-matches]")?.getAttribute("data-matches") ?? "0",
      ).toBe("0");
      expect(screen.queryByText(/23,?775/)).toBeNull();
      expect(document.body.textContent).toContain("0 within 5 mi");
    });

    it("permit-only empty offers a one-tap way to relax each permit filter", () => {
      const onPermitStatusChange = vi.fn();
      const onPermitOpenYrsChange = vi.fn();
      result = ready({ candidates: [] });
      mount({ filters: PERMIT_FILTERS, onPermitStatusChange, onPermitOpenYrsChange });
      fireEvent.click(screen.getByRole("button", { name: "Any permit status" }));
      expect(onPermitStatusChange).toHaveBeenCalledWith("any");
      fireEvent.click(screen.getByRole("button", { name: "Any open time" }));
      expect(onPermitOpenYrsChange).toHaveBeenCalledWith(undefined);
    });

    it("roof-only empty keeps the roof wording and no permit chips", () => {
      result = ready({ candidates: [], totalInRing: 0 });
      mount({ onPermitStatusChange: vi.fn(), onPermitOpenYrsChange: vi.fn() });
      expect(screen.getByText("No roofs match within 5 mi.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Any permit status" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Any open time" })).toBeNull();
    });

    it("both filters: names both and offers both ways out", () => {
      result = ready({ candidates: [] });
      mount({
        filters: { ...PERMIT_FILTERS, roofAgeMinYears: 20 },
        onRoofChange: vi.fn(),
        onPermitStatusChange: vi.fn(),
      });
      expect(
        screen.getByText("No roofs of 20+ yrs have an open permit (open 5+ yrs) within 5 mi."),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Any permit status" })).toBeTruthy();
      expect(screen.getByRole("button", { name: /^Roof ≥/ })).toBeTruthy();
    });

    it("the header count is the server's total with or without a permit filter (F-1)", () => {
      result = ready({ totalInRing: 340 });
      mount({ filters: PERMIT_FILTERS });
      expect(document.body.textContent).toContain("340 within 5 mi");
      cleanup();
      result = ready({ totalInRing: 340, propertiesTruncated: true, propertiesShown: 3 });
      mount();
      expect(document.body.textContent).toContain("340 within 5 mi");
    });
  });

  it("with no centre says why there are no candidates", () => {
    result = ready({ status: "idle", candidates: [] });
    mount();
    expect(screen.getByText(/No centre chosen yet/)).toBeTruthy();
  });

  it("with no centre and a permit filter, says to choose a centre and never prints a county count", () => {
    result = ready({ status: "idle", candidates: [] });
    mount({
      filters: { ...FILTERS, permitStatus: "open" },
      originLabel: "the county",
    });
    expect(screen.getByText(/Choose a centre or drop a pin to search permits/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("within 5 mi of the county");
    expect(document.body.textContent).not.toMatch(/\b0 within/);
    expect(document.body.textContent).toContain("No centre chosen");
    expect(document.body.textContent).toContain("open permit");
  });

  it("Open details and Show on map report the property", () => {
    const onSelect = vi.fn();
    const onShowOnMap = vi.fn();
    mount({ onSelect, onShowOnMap });
    fireEvent.click(must(screen.getAllByRole("button", { name: /Open details for TCAD/ })[0]));
    // Show on map is a 1240 px+ column (CSS hides it below), so it is not in the a11y tree here.
    fireEvent.click(must(document.querySelector<HTMLElement>('button[aria-label$="on the map"]')));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onShowOnMap).toHaveBeenCalledOnce();
  });
});
