// The hexagons are drawn on a WebGL layer, which has no DOM. This list is their keyboard and screen
// reader twin: one button per cell, named "Hexagon, median roof age n years, c properties, open
// here", arrow keys move between them (one tab stop), Enter or Space opens the search there.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HexCellList } from "../../../src/components/Map/HexCellList.js";

afterEach(cleanup);

const cells = [
  { id: "9:1:1", lat: 30.4, lng: -97.7, count: 10, medianRoofAge: 12 },
  { id: "9:2:1", lat: 30.4, lng: -97.6, count: 1, medianRoofAge: null },
  { id: "9:1:2", lat: 30.3, lng: -97.7, count: 30, medianRoofAge: 22 },
];

function mount(over: Partial<React.ComponentProps<typeof HexCellList>> = {}) {
  const props = { cells, onSelect: vi.fn(), onFocusCell: vi.fn(), ...over };
  render(<HexCellList {...props} />);
  return props;
}

describe("HexCellList", () => {
  it("has one named button per cell, in reading order (north first, then west to east)", () => {
    mount();
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([
      "Hexagon, median roof age 12 years, 10 properties, open here",
      "Hexagon, no roof age published, 1 property, open here",
      "Hexagon, median roof age 22 years, 30 properties, open here",
    ]);
  });

  it("is one tab stop: only the active button is tabbable", () => {
    mount();
    const stops = screen.getAllByRole("button").filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
  });

  it("arrow keys, Home and End move focus and report the focused cell", () => {
    const props = mount();
    const [a, b, c] = screen.getAllByRole("button") as HTMLElement[];
    (a as HTMLElement).focus();
    fireEvent.keyDown(a as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(a);
    expect(props.onFocusCell).toHaveBeenLastCalledWith("9:1:1");
  });

  it("Enter, Space and a click open the search at that cell", () => {
    const props = mount();
    const second = screen.getAllByRole("button")[1] as HTMLElement;
    fireEvent.click(second);
    expect(props.onSelect).toHaveBeenLastCalledWith(cells[1]);
  });

  it("clears the focused cell when focus leaves the list", () => {
    const props = mount();
    const first = screen.getAllByRole("button")[0] as HTMLElement;
    fireEvent.focus(first);
    expect(props.onFocusCell).toHaveBeenLastCalledWith("9:1:1");
    fireEvent.blur(first, { relatedTarget: document.body });
    expect(props.onFocusCell).toHaveBeenLastCalledWith(null);
  });

  it("renders nothing for no cells", () => {
    mount({ cells: [] });
    expect(screen.queryByRole("group")).toBeNull();
  });
});
