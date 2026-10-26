// The one segmented control above the map: Map + cards | List, a pure view switch.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapViewToggle } from "../../src/routes/Map/MapViewToggle.js";

afterEach(cleanup);

describe("MapViewToggle", () => {
  it("is one group of two aria-pressed buttons, exactly one pressed, and no Ask AI option", () => {
    render(<MapViewToggle selected="cards" onSelect={vi.fn()} />);
    const group = screen.getByRole("group", { name: "View" });
    const buttons = group.querySelectorAll("button");
    expect([...buttons].map((b) => b.textContent)).toEqual(["Map + cards", "List"]);
    expect([...buttons].filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Map + cards" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.queryByRole("button", { name: /Ask AI|AI mode/ })).toBeNull();
  });

  it("shows List as the pressed one", () => {
    render(<MapViewToggle selected="list" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Map + cards" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("reports the choice", () => {
    const onSelect = vi.fn();
    render(<MapViewToggle selected="cards" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "Map + cards" }));
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["list", "cards"]);
  });
});
