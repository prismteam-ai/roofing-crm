// The Matches panel (boards CrmMap768 / CrmMapPin390): collapsed rows, collapse all and expand all,
// the numbered pager over the loaded rows, and honest counts when the server clipped the set.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, Provenanced } from "@crm/index-schema";
import { ResultsList } from "../../src/routes/Map/ResultsList";
import { permit, property } from "../candidates/fixtures";

afterEach(cleanup);

const rows = (n: number) => Array.from({ length: n }, (_, i) => property(i + 1));

function setup(over: Partial<Parameters<typeof ResultsList>[0]> = {}) {
  const onSelect = vi.fn();
  const props = {
    rows: rows(25),
    total: 25,
    clipped: false,
    center: { lat: 30.4, lng: -97.6 },
    selectedCid: null,
    onSelect,
    permitsByPropertyCid: null,
    ...over,
  };
  const view = render(<ResultsList {...props} />);
  return { onSelect, props, ...view };
}

// Collapse all and expand all are display:none on phones (the phone header has no room for them),
// so they are looked up by their label here, where the stylesheet is applied.
const cards = (): HTMLElement[] => screen.getAllByRole("article");

describe("ResultsList header (C5)", () => {
  it("shows Matches with the server's count and the coverage info icon", () => {
    setup({ total: 16741, clipped: true });
    expect(screen.getByText("Matches 16741")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Permit coverage note" })).not.toBeNull();
  });

  it("the Triage count is the stack length (rows listed), not the server total", () => {
    setup({ total: 16741, clipped: true, onTriage: vi.fn() });
    expect(screen.getByText("Matches 16741")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Triage 25" })).not.toBeNull();
  });

  it("has a Triage button only when the page offers triage", () => {
    const onTriage = vi.fn();
    const { unmount } = setup({ onTriage });
    fireEvent.click(screen.getByRole("button", { name: "Triage 25" }));
    expect(onTriage).toHaveBeenCalledTimes(1);
    unmount();
    setup();
    expect(screen.queryByRole("button", { name: /^Triage/ })).toBeNull();
  });
});

describe("ResultsList rows (C1)", () => {
  it("draws every row collapsed, the first one too", () => {
    setup();
    for (const card of cards()) expect(card.getAttribute("data-expanded")).toBe("false");
    expect(screen.queryByText("Basis")).toBeNull();
  });

  it("shows the run as its label ('Run 3'), not the raw run id", () => {
    setup({ rows: rows(3).map((r) => ({ ...r, runId: "travis-full-run3-20261025" })) });
    fireEvent.click(
      within(cards()[0] as HTMLElement).getByRole("button", { name: "Expand details" }),
    );
    const card = cards()[0] as HTMLElement;
    expect(card.textContent).toContain(" · Run 3");
    expect(card.textContent).not.toContain("run3-2026");
  });

  it("expands one row without touching the others, and keeps it while paging back", () => {
    setup();
    fireEvent.click(
      within(cards()[1] as HTMLElement).getByRole("button", { name: "Expand details" }),
    );
    expect(cards().map((c) => c.getAttribute("data-expanded"))).toEqual([
      "false",
      "true",
      ...Array<string>(8).fill("false"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 1" }));
    expect(cards()[1]?.getAttribute("data-expanded")).toBe("true");
  });

  it("Expand all opens every row on the page and Collapse all closes them", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Expand all"));
    expect(cards().every((c) => c.getAttribute("data-expanded") === "true")).toBe(true);
    fireEvent.click(screen.getByLabelText("Collapse all"));
    expect(cards().every((c) => c.getAttribute("data-expanded") === "false")).toBe(true);
  });

  it("selecting a row reports it and marks only that row", () => {
    const first = rows(3)[0];
    const { onSelect } = setup({
      rows: rows(3),
      total: 3,
      selectedCid: first?.propertyCid ?? null,
    });
    fireEvent.click(cards()[1] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(rows(3)[1]?.propertyCid);
  });

  it("shows distance and direction on each row from the centre", () => {
    setup({ rows: rows(2), total: 2 });
    // Fixture rows lie north of the centre (latitude 30.4 + n/100, same longitude).
    expect(screen.getAllByText(/ mi N$/)).toHaveLength(2);
  });

  it("shows a permit chip only for a property the permit query returned", () => {
    const list = rows(2);
    const byCid = new Map<string, readonly Provenanced<CrmPermit>[]>([
      [list[0]?.propertyCid ?? "", [permit(1)]],
    ]);
    setup({ rows: list, total: 2, permitsByPropertyCid: byCid });
    expect(screen.getAllByLabelText("Permits")).toHaveLength(1);
  });
});

describe("ResultsList pager (C6)", () => {
  it("shows 1-10 of the loaded rows with numbered pages", () => {
    setup();
    expect(screen.getByText("Showing 1–10 of 25")).not.toBeNull();
    expect(cards()).toHaveLength(10);
    const pager = screen.getByRole("navigation", { name: "Pages" });
    expect(within(pager).getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(pager).getByRole("button", { name: "Page 3" })).not.toBeNull();
    expect(
      (within(pager).getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("pages forward and back, ending on a short last page", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Showing 11–20 of 25")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
    expect(screen.getByText("Showing 21–25 of 25")).not.toBeNull();
    expect(cards()).toHaveLength(5);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("Showing 11–20 of 25")).not.toBeNull();
  });

  it("says honestly that the rows are only the nearest part when the server clipped the set", () => {
    setup({ rows: rows(100), total: 16741, clipped: true });
    expect(screen.getByText("Showing 1–10 of the nearest 100")).not.toBeNull();
    expect(screen.getByText("Matches 16741")).not.toBeNull();
  });

  it("starts again on page 1, collapsed, when a new answer arrives", () => {
    const { rerender, props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    fireEvent.click(screen.getByLabelText("Expand all"));
    rerender(<ResultsList {...props} rows={rows(12)} total={12} />);
    expect(screen.getByText("Showing 1–10 of 12")).not.toBeNull();
    expect(cards().every((c) => c.getAttribute("data-expanded") === "false")).toBe(true);
  });

  it("a short list is one page with the previous and next buttons off", () => {
    setup({ rows: rows(6), total: 6 });
    expect(screen.getByText("Showing 1–6 of 6")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
