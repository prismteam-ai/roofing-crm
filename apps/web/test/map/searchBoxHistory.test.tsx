// Map search box: the Recent and Saved groups, kept in this browser only.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadRecent,
  loadSaved,
  pushRecent,
  pushSaved,
  resetSearchMemory,
  type MapView,
} from "../../src/routes/Map/recentSearches";
import { SearchBox, type ExactLookupResult } from "../../src/routes/Map/SearchBox";

beforeEach(() => {
  localStorage.clear();
  resetSearchMemory();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(
  options: {
    current?: MapView | null;
    result?: ExactLookupResult;
  } = {},
) {
  const onCentre = vi.fn();
  const onOpenProperty = vi.fn();
  const onApplySaved = vi.fn();
  const lookup = vi.fn(
    async (): Promise<ExactLookupResult> =>
      options.result ?? { found: true, propertyCid: "cid-1", lat: 30.3, lng: -97.7 },
  );
  const view = render(
    <SearchBox
      onCentre={onCentre}
      onOpenProperty={onOpenProperty}
      onApplySaved={onApplySaved}
      lookup={lookup}
      lookupAddress={vi.fn()}
      current={options.current ?? null}
    />,
  );
  const input = screen.getByRole("combobox");
  return { input, onCentre, onOpenProperty, onApplySaved, lookup, ...view };
}

const labels = (): string[] =>
  screen.getAllByRole("option").map((o) => o.querySelector("span")?.textContent ?? "");

const PIN: MapView = { lat: 30.4, lng: -97.45, radiusMi: 3, roofAgeMinYears: 15 };

describe("SearchBox recent searches", () => {
  it("records a chosen place and shows it first, under Recent, on the next open", () => {
    const { input, onCentre } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /^Pflugerville/ }));
    expect(onCentre).toHaveBeenCalledTimes(1);
    expect(loadRecent().map((r) => r.label)).toEqual(["Pflugerville"]);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.focus(input);
    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText("Try")).toBeTruthy();
    expect(labels()[0]).toBe("Pflugerville");
    expect(screen.getAllByRole("option")).toHaveLength(7);
  });

  it("orders the groups Recent, Saved, Try", () => {
    pushRecent({
      id: "place-x",
      kind: "place",
      label: "Recent X",
      point: { lat: 30.3, lng: -97.7 },
    });
    pushSaved(PIN, "Saved Y");
    setup();
    fireEvent.focus(screen.getByRole("combobox"));
    const text = screen.getByRole("listbox").textContent ?? "";
    expect(text.indexOf("Recent")).toBeLessThan(text.indexOf("Saved"));
    expect(text.indexOf("Saved")).toBeLessThan(text.indexOf("Try"));
    expect(labels().slice(0, 2)).toEqual(["Recent X", "Saved YSaved"]);
  });

  it("shows the local-storage note and keeps the provenance footer", () => {
    const { input } = setup();
    fireEvent.focus(input);
    expect(screen.getByText("Recent and saved stay in this browser.")).toBeTruthy();
    expect(screen.getByText(/travis-places@1\.0\.0/)).toBeTruthy();
  });

  it("choosing a recent place re-runs the live action and moves it to the top", () => {
    pushRecent({ id: "place-a", kind: "place", label: "Alpha", point: { lat: 30.1, lng: -97.1 } });
    pushRecent({ id: "place-b", kind: "place", label: "Beta", point: { lat: 30.2, lng: -97.2 } });
    const { input, onCentre } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /^Alpha/ }));
    expect(onCentre).toHaveBeenCalledWith({ lat: 30.1, lng: -97.1 });
    expect(loadRecent().map((r) => r.label)).toEqual(["Alpha", "Beta"]);
  });

  it("records a permit only when the lookup finds it, and a recent permit re-runs the lookup", async () => {
    const { input, lookup, onOpenProperty } = setup();
    fireEvent.change(input, { target: { value: "2026-121002" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onOpenProperty).toHaveBeenCalledTimes(1));
    expect(loadRecent().map((r) => r.label)).toEqual(["Permit 2026-121002 BP"]);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.focus(input);
    fireEvent.click(
      screen.getAllByRole("option", { name: /^Permit 2026-121002 BP/ })[0] as HTMLElement,
    );
    await waitFor(() => expect(onOpenProperty).toHaveBeenCalledTimes(2));
    expect(lookup).toHaveBeenLastCalledWith("permit", "2026-121002 BP");
  });

  it("does not record a lookup that found nothing", async () => {
    const { input } = setup({ result: { found: false, runId: "run-3" } });
    fireEvent.change(input, { target: { value: "138273" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText(/No TCAD account 138273/);
    expect(loadRecent()).toEqual([]);
  });

  it("a recent address reopens its property without asking the API again", () => {
    pushRecent({
      id: "address-cid-9",
      kind: "address",
      label: "9 OAK ST, AUSTIN, TX 78701",
      detail: "TCAD R-9",
      lookup: "cid-9",
      point: { lat: 30.27, lng: -97.7 },
    });
    const { input, onOpenProperty, lookup } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /9 OAK ST/ }));
    expect(onOpenProperty).toHaveBeenCalledWith("cid-9", { lat: 30.27, lng: -97.7 });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("drops a stored address entry that lacks its coordinates", () => {
    localStorage.setItem(
      "crm.search.recent.v1",
      JSON.stringify({ v: 1, items: [{ id: "a", kind: "address", label: "x", lookup: "c" }] }),
    );
    resetSearchMemory();
    expect(loadRecent()).toEqual([]);
  });

  it("removes one recent with its X button", () => {
    pushRecent({ id: "place-a", kind: "place", label: "Alpha", point: { lat: 30.1, lng: -97.1 } });
    pushRecent({ id: "place-b", kind: "place", label: "Beta", point: { lat: 30.2, lng: -97.2 } });
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("button", { name: "Remove Beta from recent" }));
    expect(loadRecent().map((r) => r.label)).toEqual(["Alpha"]);
    expect(screen.queryByRole("option", { name: /^Beta/ })).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("clears all recent but keeps Saved and Try", () => {
    pushRecent({ id: "place-a", kind: "place", label: "Alpha", point: { lat: 30.1, lng: -97.1 } });
    pushSaved(PIN, "Saved Y");
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("button", { name: "Clear recent" }));
    expect(loadRecent()).toEqual([]);
    expect(screen.queryByText("Recent")).toBeNull();
    expect(screen.getByText("Saved", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("Try")).toBeTruthy();
  });

  it("Delete on the active recent item removes it from the keyboard", () => {
    pushRecent({ id: "place-a", kind: "place", label: "Alpha", point: { lat: 30.1, lng: -97.1 } });
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Delete" });
    expect(loadRecent()).toEqual([]);
    // A sample ("Try") item is never removable.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Delete" });
    expect(screen.getAllByRole("option")).toHaveLength(6);
  });

  it("keeps arrow-key navigation, Enter and Escape working across the new groups", () => {
    pushRecent({ id: "place-a", kind: "place", label: "Alpha", point: { lat: 30.1, lng: -97.1 } });
    pushSaved(PIN, "Saved Y");
    const { input, onCentre, onApplySaved } = setup();
    fireEvent.focus(input);
    const options = screen.getAllByRole("option");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1]?.id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onApplySaved).toHaveBeenCalledTimes(1);
    expect(onCentre).not.toHaveBeenCalled();

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("works with storage blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { input, onCentre } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /^Pflugerville/ }));
    expect(onCentre).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.focus(input);
    expect(labels()[0]).toBe("Pflugerville");
  });
});

describe("SearchBox saved searches", () => {
  it("disables Save this search until the Map has a centre", () => {
    setup({ current: null });
    const save = screen.getByRole("button", { name: "Save this search" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves the current view under a pin name and lists it with a Saved badge", () => {
    const { input } = setup({ current: PIN });
    const save = screen.getByRole("button", { name: "Save this search" });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    expect(loadSaved().map((s) => s.name)).toEqual(["Pin 30.40, -97.45 · 3 mi · roof ≥ 15"]);
    expect(save.getAttribute("aria-pressed")).toBe("true");

    fireEvent.focus(input);
    const option = screen.getByRole("option", { name: /Pin 30\.40/ });
    expect(within(option).getByText("Saved")).toBeTruthy();
    expect(option.textContent).toContain("3 mi · roof ≥ 15");
  });

  it("names the save after the place while the centre is still that place", () => {
    const { input, rerender, onCentre } = setup({ current: null });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /^Pflugerville/ }));
    const point = onCentre.mock.calls[0]?.[0] as { lat: number; lng: number };
    rerender(
      <SearchBox
        onCentre={onCentre}
        onOpenProperty={vi.fn()}
        lookup={vi.fn()}
        lookupAddress={vi.fn()}
        current={{ ...point, radiusMi: 5 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save this search" }));
    expect(loadSaved().map((s) => s.name)).toEqual(["Pflugerville"]);
  });

  it("toggles off when the same view is already saved", () => {
    setup({ current: PIN });
    const save = screen.getByRole("button", { name: "Save this search" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(loadSaved()).toEqual([]);
    expect(save.getAttribute("aria-pressed")).toBe("false");
  });

  it("choosing a saved search hands back centre, radius and roof filter", () => {
    pushSaved(PIN, "Saved Y");
    const { input, onApplySaved, onCentre } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /^Saved Y/ }));
    expect(onApplySaved).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 30.4, lng: -97.45, radiusMi: 3, roofAgeMinYears: 15 }),
    );
    expect(onCentre).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("removes a saved search with its X button", () => {
    pushSaved(PIN, "Saved Y");
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("button", { name: "Remove Saved Y from saved" }));
    expect(loadSaved()).toEqual([]);
  });

  it("stops at 10 saved: the 11th view cannot be saved until one is removed", () => {
    for (let i = 0; i < 10; i += 1) pushSaved({ ...PIN, lat: 31 + i / 10 }, `S${String(i)}`);
    setup({ current: PIN });
    expect(
      (screen.getByRole("button", { name: "Save this search" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("gives every new button a 48 px target class and a label", () => {
    pushRecent({ id: "place-a", kind: "place", label: "Alpha", point: { lat: 30.1, lng: -97.1 } });
    const { input } = setup({ current: PIN });
    fireEvent.focus(input);
    for (const name of ["Save this search", "Clear recent", "Remove Alpha from recent"]) {
      expect(screen.getByRole("button", { name }).tagName).toBe("BUTTON");
    }
  });
});
