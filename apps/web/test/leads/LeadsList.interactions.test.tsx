// B-07: LeadsList filter and pager interactions. Each control must write the URL (so a filter
// combination is shareable, AC-4) and the list query must be re-issued from the new URL.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
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

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{`${loc.pathname}${loc.search}`}</output>;
}

function renderAt(url: string): void {
  render(
    <MemoryRouter initialEntries={[url]}>
      <LeadsList />
      <Where />
    </MemoryRouter>,
  );
}

/** The filter controls sit in the compact sheet in jsdom (its CSS has no viewport width, so the
 *  600 px media query never applies): open it the way a 390 px user does. */
function renderOpen(url: string): void {
  renderAt(url);
  fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
}

const url = (): string => screen.getByTestId("where").textContent ?? "";
const params = (): URLSearchParams => new URLSearchParams(url().split("?")[1] ?? "");

const lead = {
  leadId: "01J0LEAD",
  leadKey: "48453:tcad:0201885122",
  address: "TCAD 0201885122",
  lat: 30.27,
  lon: -97.74,
  status: "contacted" as const,
  assignee: "rep@example.com",
  createdFrom: "map" as const,
  sourceManifestCid: "bafkreimanifest",
  createdAt: "2026-10-20T09:14:00Z",
  eventSequence: 0,
  notInCurrentRun: false,
};

function withLeads(extra: Record<string, unknown> = {}, totalCount = 1): void {
  useLeadsList.mockReturnValue({
    status: "success",
    data: { leads: [lead], totalCount, ...extra },
    refetch: vi.fn(),
  });
}

describe("LeadsList loading and retry", () => {
  it("shows a skeleton, not an error or empty state, while loading", () => {
    useLeadsList.mockReturnValue({ status: "pending" });
    renderAt("/leads");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/no leads/i)).toBeNull();
    expect(screen.getByRole("heading", { name: "Leads" })).toBeTruthy();
  });

  it("Retry refetches the list", () => {
    const refetch = vi.fn();
    useLeadsList.mockReturnValue({ status: "error", error: new Error("x"), refetch });
    renderAt("/leads");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("LeadsList rows", () => {
  it("renders the status pill with the assignee under it, the coordinates and the source, and a singular count", () => {
    withLeads();
    renderAt("/leads");
    expect(screen.getByText("1 lead")).toBeTruthy();
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Contacted")).toBeTruthy();
    expect(within(row).getByText("rep@example.com")).toBeTruthy();
    expect(within(row).getByText("From Map")).toBeTruthy();
    expect(screen.getByText("Address not published · 30.27000, −97.74000")).toBeTruthy();
    expect(screen.getByRole("link", { name: "TCAD 0201885122" }).getAttribute("href")).toBe(
      `/leads/${encodeURIComponent(lead.leadKey)}`,
    );
  });
});

describe("LeadsList filters write the URL", () => {
  it("selecting a roof-age chip sets roof, and pressing it again clears it", () => {
    withLeads();
    renderOpen("/leads");
    const chip = screen.getByRole("button", { name: "20", pressed: false });
    fireEvent.click(chip);
    expect(params().get("roof")).toBe("20");
    expect(screen.getByRole("button", { name: "20" }).getAttribute("aria-pressed")).toBe("true");
    expect(useLeadsList).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ roofAgeMinYears: 20 }) }),
    );
    fireEvent.click(screen.getByRole("button", { name: "20" }));
    expect(params().has("roof")).toBe(false);
  });

  it("selecting a permit status chip sets permit, and pressing it again clears it", () => {
    withLeads();
    renderOpen("/leads");
    fireEvent.click(screen.getByRole("button", { name: "Stalled" }));
    expect(params().get("permit")).toBe("stalled");
    fireEvent.click(screen.getByRole("button", { name: "Stalled" }));
    expect(params().has("permit")).toBe(false);
  });

  it("Permit status offers Open, Stalled and Any only (no Closed: design-review-log row 6)", () => {
    withLeads();
    renderOpen("/leads?permit=open");
    const group = screen.getByRole("group", { name: "Permit status" });
    const names = within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["Open", "Stalled", "Any"]);
    expect(within(group).getByRole("button", { name: "Open" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(within(group).getByRole("button", { name: "Any" }));
    expect(params().has("permit")).toBe(false);
    expect(within(group).getByRole("button", { name: "Any" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("Permit open >= offers Any, 1 yr, 3 yrs, 5 yrs, 10 yrs, writes permitOpen and sends days", () => {
    withLeads();
    renderOpen("/leads");
    const group = screen.getByRole("group", { name: "Permit open at least" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Any", "1 yr", "3 yrs", "5 yrs", "10 yrs"]);
    expect(within(group).getByRole("button", { name: "Any" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(within(group).getByRole("button", { name: "5 yrs" }));
    expect(params().get("permitOpen")).toBe("5");
    expect(useLeadsList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ permitOpenDaysMin: 1827 }),
      }),
    );
    expect(within(group).getByRole("button", { name: "5 yrs" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(within(group).getByRole("button", { name: "5 yrs" }));
    expect(params().has("permitOpen")).toBe(false);
    fireEvent.click(within(group).getByRole("button", { name: "10 yrs" }));
    fireEvent.click(within(group).getByRole("button", { name: "Any" }));
    expect(params().has("permitOpen")).toBe(false);
  });

  it("the footer hint says Filters combine and makes no any-mix claim", () => {
    withLeads();
    renderOpen("/leads");
    const hint = screen.getByText(/^Filters combine\./);
    expect(hint.textContent).not.toMatch(/any mix|all reps/i);
  });

  it("Status chips list every lead status; one is chosen at a time and pressing it again clears it", () => {
    withLeads();
    renderOpen("/leads");
    const group = screen.getByRole("group", { name: "Lead status" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["New", "Contacted", "Qualified", "Won", "Lost"]);
    fireEvent.click(within(group).getByRole("button", { name: "Won" }));
    expect(params().get("status")).toBe("won");
    expect(useLeadsList).toHaveBeenLastCalledWith(expect.objectContaining({ status: "won" }));
    fireEvent.click(within(group).getByRole("button", { name: "Contacted" }));
    expect(params().get("status")).toBe("contacted");
    fireEvent.click(within(group).getByRole("button", { name: "Contacted" }));
    expect(params().has("status")).toBe(false);
  });

  it("Assignee commits on Enter or leaving the box, not on every keystroke", () => {
    withLeads();
    renderOpen("/leads");
    const box = screen.getByLabelText("Assignee");
    fireEvent.change(box, { target: { value: "rep@exa" } });
    expect(params().has("assignee")).toBe(false);
    fireEvent.change(box, { target: { value: "rep@example.com" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(params().get("assignee")).toBe("rep@example.com");
    expect(useLeadsList).toHaveBeenLastCalledWith(
      expect.objectContaining({ assignee: "rep@example.com" }),
    );
    const committed = screen.getByLabelText("Assignee");
    expect((committed as HTMLInputElement).value).toBe("rep@example.com");
    fireEvent.change(committed, { target: { value: "" } });
    fireEvent.blur(committed);
    expect(params().has("assignee")).toBe(false);
  });

  it("Within: Anywhere by default, the radius waits for an area, and choosing a point reveals its coordinates", () => {
    withLeads();
    renderOpen("/leads");
    const area = screen.getByLabelText("Area") as HTMLSelectElement;
    expect(area.value).toBe("anywhere");
    expect(screen.queryByLabelText("Center latitude")).toBeNull();
    const radius = screen.getByLabelText("Radius, mi") as HTMLSelectElement;
    expect(radius.disabled).toBe(true);
    expect(radius.tagName).toBe("SELECT");
    expect(Array.from(radius.options).map((o) => o.value)).toEqual([
      "0.5",
      "1",
      "2",
      "5",
      "10",
      "25",
    ]);
    fireEvent.change(area, { target: { value: "point" } });
    fireEvent.change(screen.getByLabelText("Center latitude"), { target: { value: "30.27" } });
    fireEvent.change(screen.getByLabelText("Center longitude"), { target: { value: "-97.74" } });
    expect((screen.getByLabelText("Radius, mi") as HTMLSelectElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Radius, mi"), { target: { value: "10" } });
    expect(params().get("lat")).toBe("30.27");
    expect(params().get("lng")).toBe("-97.74");
    expect(params().get("r")).toBe("10");
    expect(useLeadsList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ centerLat: 30.27, centerLon: -97.74, radiusMi: 10 }),
      }),
    );
    fireEvent.change(screen.getByLabelText("Center latitude"), { target: { value: "" } });
    expect(params().has("lat")).toBe(false);
    expect(params().get("lng")).toBe("-97.74");
    // Back to Anywhere removes the whole area.
    fireEvent.change(screen.getByLabelText("Area"), { target: { value: "anywhere" } });
    expect(params().has("lng")).toBe(false);
    expect(params().has("r")).toBe(false);
    expect(screen.queryByLabelText("Center latitude")).toBeNull();
  });

  it("a center in the URL opens the point area with its values, and an off-preset radius is kept and shown", () => {
    withLeads();
    renderOpen("/leads?lat=30.5&lng=-97.6&r=7.5");
    expect((screen.getByLabelText("Area") as HTMLSelectElement).value).toBe("point");
    expect((screen.getByLabelText("Center latitude") as HTMLInputElement).value).toBe("30.5");
    expect((screen.getByLabelText("Radius, mi") as HTMLSelectElement).value).toBe("7.5");
  });

  it("Use my location fills the center from the device, and says why when it cannot", () => {
    withLeads();
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 30.25, longitude: -97.75 } } as GeolocationPosition),
    );
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
    renderOpen("/leads");
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(params().get("lat")).toBe("30.25");
    expect(params().get("lng")).toBe("-97.75");
    getCurrentPosition.mockImplementationOnce(((
      _ok: PositionCallback,
      fail: PositionErrorCallback,
    ) => fail({ code: 1, message: "denied" } as GeolocationPositionError)) as never);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByText(/location permission was denied/i)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("Clear filters removes every filter and is hidden when none is active", () => {
    withLeads();
    renderOpen("/leads?roof=20&permit=open&status=new&lat=30&lng=-97&r=8&assignee=a%40b.c");
    // Below 600 px the sheet's footer says "Reset"; from 600 px the panel's says "Clear filters"
    // (both are rendered, the stylesheet shows one per width: LeadFilters.module.css).
    expect(screen.getByText("Clear filters")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(url()).toBe("/leads");
    expect(screen.queryByText("Clear filters")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("a filter change returns to page 1", () => {
    withLeads();
    renderOpen("/leads?page=3");
    fireEvent.click(screen.getByRole("button", { name: "25" }));
    expect(params().get("roof")).toBe("25");
    expect(params().has("page")).toBe(false);
    expect(params().has("cursor")).toBe(false);
  });
});

describe("LeadsList pagination", () => {
  it("shows Showing 1-25 of N, numbered pages and Next; page n asks for offset (n - 1) x 25", () => {
    withLeads({}, 60);
    renderAt("/leads");
    expect(screen.getByText(/^Showing 1–1 of 60/)).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Lead pages" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Previous page", "1", "2", "3", "Next page"]);
    expect(within(nav).getByRole("button", { name: "Previous page" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(within(nav).getByRole("button", { name: "1" }).getAttribute("aria-current")).toBe(
      "page",
    );
    fireEvent.click(within(nav).getByRole("button", { name: "3" }));
    expect(params().get("page")).toBe("3");
    expect(useLeadsList).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "50" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(params().get("page")).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(params().get("page")).toBe("3");
    expect(screen.getByRole("button", { name: "Next page" })).toHaveProperty("disabled", true);
  });

  it("page 1 leaves the URL clean, and the range follows the page", () => {
    withLeads({}, 60);
    renderAt("/leads?page=2");
    expect(screen.getByText(/^Showing 26–26 of 60/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(params().has("page")).toBe(false);
  });

  it("no pager buttons for a single page, and the text still says Showing", () => {
    withLeads({}, 1);
    renderAt("/leads");
    expect(screen.getByText(/^Showing 1–1 of 1/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  });

  it("is honest when the total is the 1,000 the list can reach", () => {
    withLeads({}, 1000);
    renderAt("/leads");
    expect(screen.getByText(/of 1,000 · first 1,000 shown/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "40" })).toBeTruthy();
  });

  it("a page past the end says so and links back to page 1 (never No leads yet)", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [], totalCount: 30 },
      refetch: vi.fn(),
    });
    renderAt("/leads?page=9");
    expect(screen.queryByRole("heading", { name: "No leads yet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go to page 1" }));
    expect(params().has("page")).toBe(false);
  });
});

describe("LeadsList list actions and the compact Filters sheet", () => {
  it("Copy link copies the current URL, filters included, and confirms it", async () => {
    withLeads();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderAt("/leads?roof=20&status=new");
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = new URL(String((writeText.mock.calls[0] as unknown[])[0]));
    expect(copied.pathname).toBe("/leads");
    expect(copied.searchParams.get("roof")).toBe("20");
    expect(copied.searchParams.get("status")).toBe("new");
    expect(await screen.findByText("Link copied")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("Copy link says where the link is when the clipboard refuses", async () => {
    withLeads();
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: () => Promise.reject(new Error("blocked")) },
    });
    renderAt("/leads");
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByText(/couldn.t copy/i)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("Show on map opens the map on the same area and roof age", () => {
    withLeads();
    renderAt("/leads?roof=20&lat=30.2&lng=-97.7&r=10");
    const href = screen.getByRole("link", { name: "Show on map" }).getAttribute("href") ?? "";
    expect(href.startsWith("/map?")).toBe(true);
    expect(new URLSearchParams(href.split("?")[1]).get("r")).toBe("10");
  });

  it("the Filters button shows the active count and opens a dismissible sheet", () => {
    withLeads();
    renderAt("/leads?roof=20&status=new");
    const toggle = screen.getByRole("button", { name: "Filters, 2 active" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /^Show \d+ leads?$/ }));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("with no filter on, the Filters button carries no count", () => {
    withLeads();
    renderAt("/leads");
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  });

  it("summarises the active filters in one sentence", () => {
    withLeads();
    renderAt("/leads?status=new&roof=20&permit=stalled&lat=30.2&lng=-97.7&r=10&assignee=sam");
    expect(
      screen.getByText(
        "New · assigned to sam · roof ≥ 20 yrs · stalled permit · within 10 mi of 30.2000, -97.7000",
      ),
    ).toBeTruthy();
  });

  it("names Permit open >= in the sentence and in its own chip", () => {
    withLeads();
    renderAt("/leads?permitOpen=3");
    expect(screen.getByText("permit open ≥ 3 yrs")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change filter, Permit open ≥ 3 yrs" })).toBeTruthy();
  });
});
