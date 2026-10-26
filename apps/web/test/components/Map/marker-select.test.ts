// A property marker opens its property: the click is handled on the marker and never reaches the
// map, whose own click drops a search pin and re-fits the view to its ring (the reported "map
// zooms out instead of opening the details").
import { describe, expect, it, vi } from "vitest";
import { dot } from "../../../src/components/Map/CrmMap";

describe("dot (property marker)", () => {
  it("click runs the callback and stops the event before it can reach the map", () => {
    const run = vi.fn();
    const el = dot("red", false, "round", false, {
      label: "Open this property · roof 20 yrs",
      run,
    });
    const mapClick = vi.fn();
    const parent = document.createElement("div");
    parent.addEventListener("click", mapClick);
    parent.appendChild(el);
    el.click();
    expect(run).toHaveBeenCalledTimes(1);
    expect(mapClick).not.toHaveBeenCalled();
  });

  it("is a labelled, focusable button that Enter and Space activate", () => {
    const run = vi.fn();
    const el = dot("red", false, "round", false, { label: "Open this property", run });
    expect(el.getAttribute("role")).toBe("button");
    expect(el.tabIndex).toBe(0);
    expect(el.getAttribute("aria-label")).toBe("Open this property");
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("without a handler it stays a plain dot (no role, not focusable)", () => {
    const el = dot("red", false);
    expect(el.getAttribute("role")).toBeNull();
    expect(el.tabIndex).toBe(-1);
  });
});
