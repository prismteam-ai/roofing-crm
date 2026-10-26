// Field triage over mocked data hooks: one card per candidate in sort order, swipe (pointer
// events) and buttons and arrow keys, Skip with Undo, create success / failed (Try again) /
// offline, an existing lead offering only Skip and Open lead, the end state and the empty ring.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidatesResult } from "../../src/routes/Map/Candidates/candidatesApi";
import { candidates, FILTERS, must, permit, property } from "../candidates/fixtures";

let result: CandidatesResult;
const mutateAsync = vi.fn();
const undoMutate = vi.fn();
vi.mock("../../src/routes/Map/Candidates/candidatesApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/routes/Map/Candidates/candidatesApi")>()),
  useCandidates: () => result,
  useCreateCandidateLead: () => ({ mutateAsync }),
  useUndoCreateLead: () => ({ mutateAsync: undoMutate }),
  usePropertyDetail: () => ({
    isError: false,
    data: {
      bbbStatus: "not_checked",
      bbbStatusReason: "not_attempted",
      nearPlace: { name: "Pflugerville" },
    },
  }),
}));

import { SWIPE_COMMIT_PX } from "../../src/routes/Map/Triage/TriageCard";
import { TriageStack } from "../../src/routes/Map/Triage/TriageStack";

const FRESH = () =>
  candidates(
    [property(1, { roofAgeYears: 30 }), property(2, { roofAgeYears: 20 }), property(3)],
    [permit(1), permit(2)],
  );
const ready = (over: Partial<CandidatesResult> = {}): CandidatesResult => ({
  status: "ready",
  candidates: FRESH(),
  totalInRing: 3,
  permitsUnavailable: false,
  leadsReason: null,
  permitTotal: 3,
  permitsTruncated: false,
  propertiesTruncated: false,
  propertiesShown: 3,
  leadsUnavailable: false,
  refetch: vi.fn(),
  ...over,
});

const onBack = vi.fn();
const onOpenDetails = vi.fn();
const mount = (props = {}) =>
  render(
    <MemoryRouter>
      <TriageStack filters={FILTERS} onBack={onBack} onOpenDetails={onOpenDetails} {...props} />
    </MemoryRouter>,
  );
const card = (): HTMLElement => must(document.querySelector<HTMLElement>("[data-triage-card]"));
const title = (): string => must(card().querySelector("h3")).textContent ?? "";

beforeEach(() => {
  result = ready();
  mutateAsync.mockReset();
  undoMutate.mockReset();
  onBack.mockReset();
  onOpenDetails.mockReset();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(cleanup);

describe("TriageStack", () => {
  it("starts on the first card in sort order with the progress header", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Triage · 1 of 3" })).toBeTruthy();
    expect(title()).toBe("TCAD 0201885121"); // oldest roof first
    expect(card().textContent).toContain("near Pflugerville");
    expect(card().textContent).toContain(
      "Contractor not published · no lexicon carrier in contract/v1",
    );
    expect(card().textContent).toContain("BBB: Not checked");
    expect(card().textContent).toContain("Open > 5 yrs");
    expect(card().textContent).toContain("Why is this a lead?");
  });

  it("Skip advances and offers Undo, which brings the card back", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: "Triage · 2 of 3" })).toBeTruthy();
    expect(screen.getByText("Skipped TCAD 0201885121")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(title()).toBe("TCAD 0201885121");
  });

  it("Create lead calls leads.create with origin map and moves on, offering Undo", async () => {
    mutateAsync.mockResolvedValue({ leadKey: "48453:tcad:0201885121", leadId: "L-7" });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    await screen.findByText("Lead created · L-7");
    const input = must(mutateAsync.mock.calls[0])[0] as {
      createdFrom: string;
      requestIdentifier: string;
    };
    expect(input.createdFrom).toBe("map");
    expect(input.requestIdentifier).toBe("0201885121");
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open lead" }).getAttribute("href")).toBe(
      "/leads/48453%3Atcad%3A0201885121",
    );
    expect(screen.getByRole("heading", { name: "Triage · 2 of 3" })).toBeTruthy();
  });

  it("Undo after Create calls undoCreate for that lead and brings the card back", async () => {
    mutateAsync.mockResolvedValue({ leadKey: "48453:tcad:0201885121", leadId: "L-7" });
    undoMutate.mockResolvedValue({ deleted: true });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    await screen.findByText("Lead created · L-7");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Lead removed")).toBeTruthy();
    expect(must(undoMutate.mock.calls[0])[0]).toEqual({
      leadKey: "48453:tcad:0201885121",
      leadId: "L-7",
    });
    expect(screen.getByRole("heading", { name: "Triage · 1 of 3" })).toBeTruthy();
    expect(title()).toBe("TCAD 0201885121");
  });

  it("when the server keeps the lead, says why and does not bring the card back", async () => {
    mutateAsync.mockResolvedValue({ leadKey: "48453:tcad:0201885121", leadId: "L-7" });
    undoMutate.mockResolvedValue({ deleted: false, reason: "CHANGED" });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    await screen.findByText("Lead created · L-7");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Lead kept: it was updated after it was created.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Triage · 2 of 3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("a failed undo call says the lead is still saved and keeps Undo available", async () => {
    mutateAsync.mockResolvedValue({ leadKey: "48453:tcad:0201885121", leadId: "L-7" });
    undoMutate.mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce({ deleted: true });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    await screen.findByText("Lead created · L-7");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Couldn’t undo. The lead is still saved.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Triage · 2 of 3" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByText("Lead removed");
    expect(screen.getByRole("heading", { name: "Triage · 1 of 3" })).toBeTruthy();
  });

  it("a failed create returns the card with Try again, and retry succeeds", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("500")).mockResolvedValueOnce({
      leadKey: "k",
      leadId: "L-8",
    });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    expect(await screen.findByText("Couldn’t create the lead. Nothing was saved.")).toBeTruthy();
    expect(title()).toBe("TCAD 0201885121");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Lead created · L-8");
  });

  it("offline: banner, Skip still works, Create keeps the card and says it was not saved", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    mount();
    expect(screen.getByText(/Skip still works; new leads can’t be saved/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    expect(await screen.findByText("You’re offline. The lead was not saved.")).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: "Triage · 2 of 3" })).toBeTruthy();
  });

  it("an existing lead offers only Skip and Open lead, with the Already a lead pill", () => {
    result = ready({
      candidates: candidates(
        [property(1)],
        [permit(1)],
        [{ leadKey: "48453:tcad:0201885121", leadId: "L-1041", status: "new" }],
      ),
    });
    mount();
    expect(card().textContent).toContain("Already a lead · New · L-1041");
    expect(screen.queryByRole("button", { name: "Create lead" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open lead" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
  });

  it("a server ALREADY_EXISTS counts as skipped, not as a failure", async () => {
    mutateAsync.mockRejectedValue({ data: { appCode: "ALREADY_EXISTS" } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    expect(await screen.findByText("Already a lead · skipped")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Triage · 2 of 3" })).toBeTruthy();
  });

  it("arrow keys skip and create, Enter opens details", async () => {
    mutateAsync.mockResolvedValue({ leadKey: "k", leadId: "L-2" });
    mount();
    fireEvent.keyDown(card(), { key: "Enter" });
    expect(onOpenDetails).toHaveBeenCalledWith(card().getAttribute("data-triage-card"));
    fireEvent.keyDown(card(), { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { name: "Triage · 2 of 3" })).toBeTruthy();
    fireEvent.keyDown(card(), { key: "ArrowRight" });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("swipe right past the threshold creates, left skips, short drag snaps back", async () => {
    mutateAsync.mockResolvedValue({ leadKey: "k", leadId: "L-3" });
    mount();
    // jsdom has no PointerEvent: a MouseEvent with the pointer event's type carries clientX.
    const fire = (type: string, x: number): void => {
      fireEvent(card(), new MouseEvent(type, { clientX: x, bubbles: true }));
    };
    const drag = (dx: number): void => {
      fire("pointerdown", 200);
      fire("pointermove", 200 + dx);
      expect(card().getAttribute("data-dragging")).toBe("true");
      fire("pointerup", 200 + dx);
    };
    drag(SWIPE_COMMIT_PX - 10);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Triage · 1 of 3" })).toBeTruthy();
    drag(-SWIPE_COMMIT_PX);
    expect(screen.getByRole("heading", { name: "Triage · 2 of 3" })).toBeTruthy();
    drag(SWIPE_COMMIT_PX);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("end of stack reports created and skipped with Open Leads and Back to map", async () => {
    result = ready({ candidates: candidates([property(1)], [permit(1)]) });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("0 leads created, 1 skipped")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Leads" }).getAttribute("href")).toBe("/leads");
    fireEvent.click(must(screen.getAllByRole("button", { name: "Back to map" })[1]));
    expect(onBack).toHaveBeenCalled();
  });

  it("says lead marks could not be checked, with the reason", () => {
    result = ready({ leadsUnavailable: true, leadsReason: "failed" });
    mount();
    expect(
      document.querySelector('[data-state="CrmCandidatesLeadsUnavailable"]')?.textContent,
    ).toContain("Lead marks couldn't be checked for this ring");
    cleanup();
    result = ready({ leadsUnavailable: true, leadsReason: "tooMany" });
    mount();
    expect(
      document.querySelector('[data-state="CrmCandidatesLeadsUnavailable"]')?.textContent,
    ).toContain("More than 1,000 properties are in this ring");
  });

  it("empty ring offers Widen and lower roof; loading and no-centre are honest", () => {
    result = ready({ candidates: [], totalInRing: 0 });
    const onRadiusChange = vi.fn();
    const onRoofChange = vi.fn();
    const empty = mount({ onRadiusChange, onRoofChange });
    expect(screen.getByText("No candidates in this ring")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Widen to 6 mi" }));
    fireEvent.click(screen.getByRole("button", { name: "Roof ≥ 13 yrs" }));
    expect(onRadiusChange).toHaveBeenCalledWith(6);
    expect(onRoofChange).toHaveBeenCalledWith(13);
    empty.unmount();

    result = ready({ status: "loading", candidates: [] });
    const loading = mount();
    expect(screen.getByText("Loading the next card…")).toBeTruthy();
    loading.unmount();

    result = ready({ status: "idle", candidates: [] });
    mount();
    expect(screen.getByText(/No centre chosen yet/)).toBeTruthy();
  });

  it("a property without a location cannot be created and says so", async () => {
    result = ready({ candidates: candidates([property(1, { latitude: null, longitude: null })]) });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    expect(await screen.findByText(/no published location/)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("tells the map which property is current so its marker can be ringed", () => {
    const onCurrentChange = vi.fn();
    mount({ onCurrentChange });
    expect(onCurrentChange).toHaveBeenLastCalledWith(card().getAttribute("data-triage-card"));
  });
});
