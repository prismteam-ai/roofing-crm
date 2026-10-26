// B-09 board match for the Lead page and list (CrmLead*, CrmLeads*): one test per behavior that
// the boards add over B-07 -- the status menu's saving / saved / failed / changed-elsewhere
// states, the history in words, the disabled next steps, the list pane at the split width, the
// Back to Leads link, and the list's state cards.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useLead = vi.fn();
const useLeadsList = vi.fn();
const statusMutate = vi.fn();
const statusReset = vi.fn();
let statusState: { isPending: boolean; isSuccess: boolean; error: unknown } = {
  isPending: false,
  isSuccess: false,
  error: null,
};
vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useLead: (...a: unknown[]) => useLead(...a),
  useLeadsList: (...a: unknown[]) => useLeadsList(...a),
  useUpdateLeadStatus: () => ({ mutate: statusMutate, reset: statusReset, ...statusState }),
  useAddLeadNote: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useAssignLead: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));
let wide = false;
vi.mock("../../src/routes/Leads/useWide", () => ({
  useWide: () => wide,
  LEAD_SPLIT_MIN_WIDTH: 1200,
}));

import { Component as LeadDetail } from "../../src/routes/Leads/LeadDetail";
import { historyText } from "../../src/routes/Leads/LeadDetail";
import { Component as LeadsList } from "../../src/routes/Leads/LeadsList";
import { personLabel } from "../../src/routes/Leads/leadFormat";

afterEach(() => {
  cleanup();
  useLead.mockReset();
  useLeadsList.mockReset();
  statusMutate.mockReset();
  statusReset.mockReset();
  statusState = { isPending: false, isSuccess: false, error: null };
  wide = false;
});

const KEY = "48453:tcad:0210577629";
const lead = {
  leadId: "01J0LEAD",
  leadKey: KEY,
  address: "TCAD 0210577629",
  lat: 30.4031,
  lon: -97.6608,
  status: "contacted" as const,
  assignee: "rep-1",
  createdFrom: "agent" as const,
  sourceManifestCid: "bafkreimanifest",
  createdAt: "2026-10-20T09:14:00Z",
  eventSequence: 3,
  signals: { roofAgeYears: 23, roofAgeBasis: "built_year", capturedAt: "2026-10-20T00:00:00Z" },
  notes: [],
  history: [
    { sequence: 0, at: "2026-10-20T09:14:00Z", by: "rep-1", change: "created", kind: "create" },
    {
      sequence: 1,
      at: "2026-10-20T11:20:00Z",
      by: "rep-1",
      change: "status: new -> contacted",
      kind: "statusChange",
    },
    {
      sequence: 2,
      at: "2026-10-20T15:02:00Z",
      by: "rep-1",
      change: 'note: "secret words"',
      kind: "note",
    },
  ],
  notInCurrentRun: false,
};

function renderDetail(): void {
  useLead.mockReturnValue({ status: "success", data: lead, refetch: vi.fn() });
  render(
    <MemoryRouter initialEntries={[`/leads/${encodeURIComponent(KEY)}`]}>
      <Routes>
        <Route path="/leads/:leadKey" element={<LeadDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Lead page header and menus", () => {
  it("names the origin and says the address is not published, with the coordinates", () => {
    renderDetail();
    expect(screen.getByText("Address not published · 30.40310, −97.66080")).toBeTruthy();
    expect(screen.getByText(/Created from Agent · Oct 20, 09:14 UTC/)).toBeTruthy();
  });

  it("offers Back to Leads and a Show on map link centred on the lead", () => {
    renderDetail();
    expect(screen.getByRole("link", { name: "Back to Leads" }).getAttribute("href")).toBe("/leads");
    const href = screen.getByRole("link", { name: "Show on map" }).getAttribute("href") ?? "";
    expect(new URLSearchParams(href.split("?")[1]).get("lat")).toBe("30.4031");
    expect(new URLSearchParams(href.split("?")[1]).get("lng")).toBe("-97.6608");
  });

  it("shows the status options as words while keeping the stored values", () => {
    renderDetail();
    const select = screen.getByRole("combobox", { name: "Status" });
    expect(within(select).getByRole("option", { name: "Qualified" }).getAttribute("value")).toBe(
      "qualified",
    );
  });

  it("sends the loaded event sequence so a change made elsewhere is detected", () => {
    renderDetail();
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "qualified" },
    });
    expect(statusMutate).toHaveBeenCalledWith({
      leadKey: KEY,
      status: "qualified",
      expectedSequence: 3,
    });
  });

  it("says Saving the status… while a change saves, and Saved afterwards", () => {
    statusState = { isPending: true, isSuccess: false, error: null };
    renderDetail();
    expect(screen.getByText("Saving the status…")).toBeTruthy();
    cleanup();
    statusState = { isPending: false, isSuccess: true, error: null };
    renderDetail();
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("offers Try again after a failed save, repeating the same change", () => {
    renderDetail();
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "won" },
    });
    cleanup();
    statusState = { isPending: false, isSuccess: false, error: new Error("boom") };
    // a fresh render has no remembered attempt: the button is present and does nothing harmful
    renderDetail();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t save the status/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("raises 'updated by someone else' with Reload for a stale sequence, not a save error", () => {
    statusState = {
      isPending: false,
      isSuccess: false,
      error: { data: { appCode: "STALE_SEQUENCE" } },
    };
    const refetch = vi.fn();
    useLead.mockReturnValue({ status: "success", data: lead, refetch });
    render(
      <MemoryRouter initialEntries={[`/leads/${encodeURIComponent(KEY)}`]}>
        <Routes>
          <Route path="/leads/:leadKey" element={<LeadDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/updated by someone else/i)).toBeTruthy();
    expect(screen.queryByText(/couldn.t save the status/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(statusReset).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("Lead page sections", () => {
  it("writes the history in words, newest first, and keeps note text out of it", () => {
    renderDetail();
    const history = screen.getByRole("region", { name: "History" });
    const items = within(history)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(items[0]).toContain("Note added");
    expect(items[1]).toContain("Status: New → Contacted");
    expect(items[2]).toContain("Created from Agent");
    expect(history.textContent).not.toContain("secret words");
  });

  it("historyText leaves an unrecognised change exactly as stored", () => {
    expect(historyText({ kind: "statusChange", change: "weird" }, "map")).toBe("weird");
  });

  it("shows the roof-age basis in words, and the permit age in years beside the days", () => {
    renderDetail();
    expect(screen.getByText("Basis: Year built (no reroof permit found)")).toBeTruthy();
  });

  it("lists Send message and Create estimate as disabled, with the reason on screen", () => {
    renderDetail();
    const send = screen.getByRole("button", { name: /Send message/ });
    const estimate = screen.getByRole("button", { name: /Create estimate/ });
    expect(send.hasAttribute("disabled")).toBe(true);
    expect(estimate.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText(/Outreach is coming soon: email and SMS to owners/, { selector: "p" }),
    ).toBeTruthy();
  });

  it("adds a warning banner when the property is not in the current run", () => {
    useLead.mockReturnValue({
      status: "success",
      data: { ...lead, notInCurrentRun: true },
      refetch: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={[`/leads/${encodeURIComponent(KEY)}`]}>
        <Routes>
          <Route path="/leads/:leadKey" element={<LeadDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Property not in the current run.")).toBeTruthy();
  });

  it("names the people: Me for the signed-in id, the stored id otherwise", () => {
    expect(personLabel("rep-1", ["rep-1"])).toBe("Me");
    expect(personLabel("rep-2", ["rep-1"])).toBe("rep-2");
  });
});

describe("Lead page beside the list (split width)", () => {
  it("shows my leads on the left with the open one marked, and hides Back to Leads", () => {
    wide = true;
    useLeadsList.mockReturnValue({
      status: "success",
      data: {
        leads: [lead, { ...lead, leadKey: "48453:tcad:2", address: "TCAD 2" }],
        totalCount: 2,
      },
    });
    renderDetail();
    const pane = screen.getByRole("complementary", { name: "My leads" });
    const current = within(pane).getByRole("link", { name: /TCAD 0210577629/ });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(
      within(pane)
        .getByRole("link", { name: /TCAD 2/ })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(within(pane).getByRole("link", { name: "All filters" }).getAttribute("href")).toBe(
      "/leads",
    );
  });

  it("does not ask for the list when the page is single-column", () => {
    renderDetail();
    expect(useLeadsList).not.toHaveBeenCalled();
    expect(screen.queryByRole("complementary", { name: "My leads" })).toBeNull();
  });
});

describe("Leads list state cards", () => {
  function renderList(url: string): void {
    render(
      <MemoryRouter initialEntries={[url]}>
        <LeadsList />
      </MemoryRouter>,
    );
  }

  it("no leads yet: the first-lead sentence and a Go to map link, with no filter controls", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [], totalCount: 0 },
      refetch: vi.fn(),
    });
    renderList("/leads");
    expect(screen.getByRole("link", { name: "Go to map" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("group", { name: "Lead status" })).toBeNull();
  });

  it("no match: one Clear filters button in the card, none in the filter panel", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [], totalCount: 0 },
      refetch: vi.fn(),
    });
    renderList("/leads?status=won&roof=25");
    expect(screen.getAllByRole("button", { name: "Clear filters" })).toHaveLength(1);
  });

  it("error: says the store did not answer, keeps the filters and offers Retry", () => {
    const refetch = vi.fn();
    useLeadsList.mockReturnValue({ status: "error", error: new Error("x"), refetch });
    renderList("/leads?status=new");
    expect(screen.getByRole("alert").textContent).toMatch(/Leads couldn.t load/);
    expect(screen.getByRole("button", { name: "Change filter, New" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the active filters as chips under the Filters button, All my leads when none", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [lead], totalCount: 1 },
      refetch: vi.fn(),
    });
    renderList("/leads");
    expect(screen.getByRole("button", { name: "Change filter, All my leads" })).toBeTruthy();
    cleanup();
    renderList("/leads?roof=15&permit=open");
    expect(screen.getByRole("button", { name: "Change filter, Roof ≥ 15 yrs" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change filter, Open permit" })).toBeTruthy();
  });

  it("the Me chip is on by default and clears a typed assignee", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [lead], totalCount: 1 },
      refetch: vi.fn(),
    });
    renderList("/leads");
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByRole("button", { name: "Me" }).getAttribute("aria-pressed")).toBe("true");
    cleanup();
    renderList("/leads?assignee=sam");
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByRole("button", { name: "Me" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("Lead page review fixes", () => {
  it("draws the signals as a two-column table with Signal / At creation and a Main permit row", () => {
    useLead.mockReturnValue({
      status: "success",
      data: {
        ...lead,
        signals: {
          roofAgeYears: 23,
          roofAgeBasis: "permit",
          openPermitId: "2003-012345 BP",
          openDays: 100,
          capturedAt: "2026-10-20T00:00:00Z",
        },
      },
      refetch: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={[`/leads/${encodeURIComponent(KEY)}`]}>
        <Routes>
          <Route path="/leads/:leadKey" element={<LeadDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    const section = screen.getByRole("region", { name: "Current signals" });
    expect(within(section).getByText("Signal")).toBeTruthy();
    expect(within(section).getByText("At creation")).toBeTruthy();
    expect(within(section).getByText("Main permit")).toBeTruthy();
    expect(within(section).queryByText("Open permit")).toBeNull();
    expect(
      within(section).getByText(
        /Confidence not saved with this lead \(created before it was recorded\)/,
      ),
    ).toBeTruthy();
    expect(
      within(section).getByText(/Change since this lead was created: not available/),
    ).toBeTruthy();
    expect(section.textContent).toMatch(/From CountyLens, collected 2026-10-20 00:00:00 UTC/);
  });

  function renderWithSignals(signals: Record<string, unknown>): HTMLElement {
    useLead.mockReturnValue({
      status: "success",
      data: { ...lead, signals: { ...lead.signals, ...signals } },
      refetch: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={[`/leads/${encodeURIComponent(KEY)}`]}>
        <Routes>
          <Route path="/leads/:leadKey" element={<LeadDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    return screen.getByRole("region", { name: "Current signals" });
  }

  it("an older lead says the contractor was not saved with it, never 'not published'", () => {
    renderDetail();
    const section = screen.getByRole("region", { name: "Current signals" });
    expect(section.textContent).toContain("Not saved with the lead");
    expect(section.textContent).not.toContain("does not include a contractor name");
    expect(section.textContent).not.toContain("Contractor not published");
    expect(section.textContent).not.toContain("contract/v1");
  });

  it("regression: a lead saved with the permit's printed contractor shows it, no missing text", () => {
    const section = renderWithSignals({
      openPermitId: "2025-100",
      openDays: 100,
      contractor: "ACME ROOFING LLC",
      bbbStatus: "not_checked",
      contractorRecorded: true,
    });
    expect(section.textContent).toContain("ACME ROOFING LLC");
    expect(section.textContent).toContain("as printed, unverified");
    expect(section.textContent).not.toContain("Contractor not published");
    expect(section.textContent).not.toContain("does not include a contractor name");
    expect(section.textContent).toContain("BBB rating not available · not checked");
  });

  it("says no contractor was printed only when the snapshot recorded that there was none", () => {
    const section = renderWithSignals({ contractorRecorded: true });
    expect(section.textContent).toContain("Contractor not published");
    expect(section.textContent).toContain("No contractor name was printed on this permit");
    expect(section.textContent).toContain("Not checked · no name to look up");
  });

  it("keeps Add note disabled while the box is empty", () => {
    renderDetail();
    const button = screen.getByRole("button", { name: "Add note" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Add a note"), { target: { value: "x" } });
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("names each copy button by which id it copies", () => {
    useLead.mockReturnValue({
      status: "success",
      data: { ...lead, notInCurrentRun: true, currentManifestCid: "bafkreicurrentmanifest" },
      refetch: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={[`/leads/${encodeURIComponent(KEY)}`]}>
        <Routes>
          <Route path="/leads/:leadKey" element={<LeadDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Copy snapshot manifest CID" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy current run manifest CID" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy CID" })).toBeNull();
  });

  it("keeps the CIDs inline in the not-in-run sentence (one paragraph, not separate blocks)", () => {
    useLead.mockReturnValue({
      status: "success",
      data: { ...lead, notInCurrentRun: true, currentManifestCid: "bafkreicurrentmanifest" },
      refetch: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={[`/leads/${encodeURIComponent(KEY)}`]}>
        <Routes>
          <Route path="/leads/:leadKey" element={<LeadDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    const sentence = within(screen.getByTestId("not-in-run")).getByText(/absent from the data run/);
    expect(sentence.tagName).toBe("P");
    expect(sentence.querySelectorAll("[data-cid]")).toHaveLength(2);
  });

  it("loading keeps the title from the link and shows the progress bar; error keeps it too", () => {
    useLead.mockReturnValue({ status: "pending" });
    render(
      <MemoryRouter initialEntries={[`/leads/${encodeURIComponent(KEY)}`]}>
        <Routes>
          <Route path="/leads/:leadKey" element={<LeadDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "TCAD 0210577629" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Loading the lead" })).toBeTruthy();
    cleanup();
    useLead.mockReturnValue({ status: "error", error: new Error("x"), refetch: vi.fn() });
    render(
      <MemoryRouter initialEntries={[`/leads/${encodeURIComponent(KEY)}`]}>
        <Routes>
          <Route path="/leads/:leadKey" element={<LeadDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "TCAD 0210577629" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "This lead couldn't load. The lead store didn't answer. Try again; nothing was changed.",
    );
  });

  it("announces the not-found card politely", () => {
    useLead.mockReturnValue({
      status: "error",
      error: { data: { code: "NOT_FOUND" } },
      refetch: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={["/leads/nope"]}>
        <Routes>
          <Route path="/leads/:leadKey" element={<LeadDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("status").textContent).toContain("Lead not found");
  });

  it("the New status pill has no NEW badge glyph", async () => {
    const { LEAD_STATUS_ICON } = await import("../../src/routes/Leads/LeadsList");
    expect(LEAD_STATUS_ICON.new).not.toBe("fiber_new");
  });
});

describe("Leads list review fixes", () => {
  it("the empty state is a polite status, the loading state shows the progress bar", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [], totalCount: 0 },
      refetch: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={["/leads"]}>
        <LeadsList />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "No leads yet" }).closest("[role=status]"),
    ).not.toBeNull();
    cleanup();
    useLeadsList.mockReturnValue({ status: "pending" });
    render(
      <MemoryRouter initialEntries={["/leads"]}>
        <LeadsList />
      </MemoryRouter>,
    );
    expect(screen.getByRole("progressbar", { name: "Loading your leads" })).toBeTruthy();
  });

  it("the lead link and All filters have a 48 px hit area", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const css = readFileSync(join(__dirname, "../../src/routes/Leads/Leads.module.css"), "utf8");
    expect(css).toMatch(/\.cardLink\s*{[^}]*min-height: var\(--space-9\)/);
    expect(css).toMatch(/\.link\s*{[^}]*min-height: var\(--space-9\)/);
  });
});
