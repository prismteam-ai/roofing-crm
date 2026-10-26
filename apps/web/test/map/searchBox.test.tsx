// Map search box: combobox semantics, keyboard, selection, samples, exact lookups and the
// disabled address path.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSearchMemory } from "../../src/routes/Map/recentSearches";
import {
  SearchBox,
  type AddressLookupResult,
  type ExactLookupResult,
} from "../../src/routes/Map/SearchBox";

beforeEach(() => {
  localStorage.clear();
  resetSearchMemory();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NO_ADDRESS: AddressLookupResult = { found: false, runId: "travis-full-run3-20261025" };

function setup(
  result: ExactLookupResult = { found: false, runId: "run-3" },
  address: AddressLookupResult = NO_ADDRESS,
) {
  const onCentre = vi.fn();
  const onOpenProperty = vi.fn();
  const lookup = vi.fn(async () => result);
  const lookupAddress = vi.fn(async (_value: string) => address);
  render(
    <SearchBox
      onCentre={onCentre}
      onOpenProperty={onOpenProperty}
      lookup={lookup}
      lookupAddress={lookupAddress}
    />,
  );
  const input = screen.getByRole("combobox");
  return { input, onCentre, onOpenProperty, lookup, lookupAddress };
}

describe("SearchBox", () => {
  it("is a combobox with the placeholder and a collapsed listbox", () => {
    const { input } = setup();
    expect(input.getAttribute("placeholder")).toBe("Search an address, place, ZIP or permit");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBe(
      screen.getByRole("listbox", { hidden: true }).id,
    );
  });

  it("shows six working samples and the provenance when focused and empty", () => {
    const { input } = setup();
    fireEvent.focus(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Try")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.getByText(/travis-places@1\.0\.0/)).toBeTruthy();
  });

  it("clicking a place sample centres the map there", () => {
    const { input, onCentre } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /^Pflugerville/ }));
    expect(onCentre).toHaveBeenCalledTimes(1);
    expect(onCentre.mock.calls[0]?.[0].lat).toBeGreaterThan(30);
    expect((input as HTMLInputElement).value).toBe("Pflugerville");
  });

  it("suggests Pflugerville city for 'pflu' with the gazetteer source", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "pflu" } });
    expect(screen.getByRole("option", { name: /Pflugerville city/ })).toBeTruthy();
    expect(screen.getByText("Census 2024 Gazetteer · travis-places@1.0.0")).toBeTruthy();
  });

  it("walks options with Up/Down, sets aria-activedescendant, Enter chooses, Escape closes", () => {
    const { input, onCentre } = setup();
    fireEvent.change(input, { target: { value: "787" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const first = screen.getAllByRole("option")[0] as HTMLElement;
    expect(input.getAttribute("aria-activedescendant")).toBe(first.id);
    expect(first.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).not.toBe(first.id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(first.id);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCentre).toHaveBeenCalledTimes(1);
  });

  it("Enter without an active option picks the first enabled one", () => {
    const { input, onCentre } = setup();
    fireEvent.change(input, { target: { value: "78660" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCentre).toHaveBeenCalledTimes(1);
  });

  it("Escape on a closed box clears it; the clear button clears and refocuses", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "pflu" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
    fireEvent.change(input, { target: { value: "round" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("says plainly when no place or ZIP matches", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "zzzzqq" } });
    expect(screen.getByText(/No place or ZIP in Travis County matches/)).toBeTruthy();
  });

  it("looks a permit up only when chosen, then opens its property", async () => {
    const found: ExactLookupResult = { found: true, propertyCid: "cid-1", lat: 30.3, lng: -97.7 };
    const { input, lookup, onOpenProperty } = setup(found);
    fireEvent.change(input, { target: { value: "2026-121002" } });
    expect(lookup).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(onOpenProperty).toHaveBeenCalledWith("cid-1", { lat: 30.3, lng: -97.7 }),
    );
    expect(lookup).toHaveBeenCalledWith("permit", "2026-121002 BP");
  });

  it("resolves a TCAD account", async () => {
    const { input, lookup, onOpenProperty } = setup({
      found: true,
      propertyCid: "cid-2",
      lat: 30.1,
      lng: -97.5,
    });
    fireEvent.change(input, { target: { value: "138273" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onOpenProperty).toHaveBeenCalled());
    expect(lookup).toHaveBeenCalledWith("tcad", "138273");
  });

  it("reports a missing permit with the run searched", async () => {
    const { input, onOpenProperty } = setup({ found: false, runId: "travis-full-run3-20261025" });
    fireEvent.change(input, { target: { value: "2026-999999 BP" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("No permit 2026-999999 BP in travis-full-run3-20261025");
    expect(onOpenProperty).not.toHaveBeenCalled();
  });

  it("reports a failed lookup instead of hanging", async () => {
    const onCentre = vi.fn();
    const lookup = vi.fn(async () => {
      throw new Error("down");
    });
    render(
      <SearchBox
        onCentre={onCentre}
        onOpenProperty={vi.fn()}
        lookup={lookup}
        lookupAddress={vi.fn()}
      />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "138273" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText(/The lookup failed/);
  });

  const FOUND: AddressLookupResult = {
    found: true,
    total: 2,
    runId: "travis-full-run31-20261026",
    matches: [
      {
        propertyCid: "cid-a",
        requestIdentifier: "R-1",
        address: "2725 WOODALL DR 1401, AUSTIN, TX 78744",
        lat: 30.2,
        lng: -97.7,
      },
      {
        propertyCid: "cid-b",
        requestIdentifier: "R-2",
        address: "2725 WOODALL DR 1401, CEDAR PARK, TX 78613",
        lat: 30.5,
        lng: -97.8,
      },
    ],
  };

  it("debounces: one address lookup after typing stops, nothing before", async () => {
    const { input, lookupAddress } = setup({ found: false, runId: null }, FOUND);
    fireEvent.change(input, { target: { value: "2725 WOODALL" } });
    fireEvent.change(input, { target: { value: "2725  WOODALL DR 1401" } });
    expect(lookupAddress).not.toHaveBeenCalled();
    await screen.findAllByRole("option", { name: /WOODALL DR 1401/ });
    expect(lookupAddress).toHaveBeenCalledTimes(1);
    expect(lookupAddress).toHaveBeenCalledWith("2725 WOODALL DR 1401");
  });

  it("lists matches with the TCAD account and opens the chosen property like a permit does", async () => {
    const { input, onOpenProperty, lookup } = setup({ found: false, runId: null }, FOUND);
    fireEvent.change(input, { target: { value: "2725 WOODALL DR 1401" } });
    const options = await screen.findAllByRole("option", { name: /WOODALL/ });
    expect(options).toHaveLength(2);
    expect(options[1]?.textContent).toMatch(/CEDAR PARK.*TCAD R-2/);
    expect(screen.getByText("Exact match against the current run index")).toBeTruthy();
    fireEvent.click(options[1] as HTMLElement);
    expect(onOpenProperty).toHaveBeenCalledWith("cid-b", { lat: 30.5, lng: -97.8 });
    expect(lookup).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("2725 WOODALL DR 1401, CEDAR PARK, TX 78613");
    expect(JSON.parse(localStorage.getItem("crm.search.recent.v1") ?? "{}").items[0]).toMatchObject(
      {
        kind: "address",
        lookup: "cid-b",
        point: { lat: 30.5, lng: -97.8 },
      },
    );
  });

  it("keyboard: Down then Enter chooses the first address", async () => {
    const { input, onOpenProperty } = setup({ found: false, runId: null }, FOUND);
    fireEvent.change(input, { target: { value: "2725 WOODALL DR 1401" } });
    await screen.findAllByRole("option", { name: /WOODALL/ });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).not.toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onOpenProperty).toHaveBeenCalledWith("cid-a", { lat: 30.2, lng: -97.7 });
  });

  it("with no match shows a plain disabled line naming the run, never choosable", async () => {
    const { input, onOpenProperty } = setup();
    fireEvent.change(input, { target: { value: "1200 Main St" } });
    const note = await screen.findByRole("option", {
      name: "No property at that address in Run 3",
    });
    expect(note.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(note);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onOpenProperty).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("says addresses are not in this index when the index has none", async () => {
    const { input } = setup(undefined, {
      found: false,
      runId: "run-3",
      reason: "address_not_in_index",
    });
    fireEvent.change(input, { target: { value: "1200 Main St" } });
    await screen.findByText("Street addresses are not in this index yet");
  });

  it("says so when the address lookup fails", async () => {
    const lookupAddress = vi.fn(async (): Promise<AddressLookupResult> => {
      throw new Error("down");
    });
    render(
      <SearchBox
        onCentre={vi.fn()}
        onOpenProperty={vi.fn()}
        lookup={vi.fn()}
        lookupAddress={lookupAddress}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1200 Main St" } });
    await screen.findByText(/The address lookup failed/);
  });

  it("the address sample types its text into the box and looks it up", async () => {
    const { input, lookupAddress } = setup({ found: false, runId: null }, FOUND);
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /^2725 WOODALL DR 1401/ }));
    expect((input as HTMLInputElement).value).toBe("2725 WOODALL DR 1401, CEDAR PARK, TX 78613");
    await waitFor(() =>
      expect(lookupAddress).toHaveBeenCalledWith("2725 WOODALL DR 1401, CEDAR PARK, TX 78613"),
    );
  });
});
