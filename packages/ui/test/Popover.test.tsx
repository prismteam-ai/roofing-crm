import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Popover } from "../src/Popover/Popover.js";
import { computePlacement } from "../src/Popover/placement.js";

afterEach(cleanup);

describe("computePlacement", () => {
  const bounds = { left: 1000, right: 1400 };
  it("aligns the right edge to the anchor when it fits (end)", () => {
    const p = computePlacement({ left: 1300, right: 1330 }, 200, bounds, "end", 8);
    expect(p.left).toBe(1330 - 200 - 1300);
  });
  it("never extends past the pane's left edge (the clipped info-icon case)", () => {
    const p = computePlacement({ left: 1010, right: 1040 }, 320, bounds, "end", 8);
    expect(1010 + p.left).toBe(1008);
  });
  it("never extends past the pane's right edge (start)", () => {
    const p = computePlacement({ left: 1390, right: 1400 }, 200, bounds, "start", 8);
    expect(1390 + p.left + 200).toBe(1392);
  });
  it("caps the width to the available space in a 390px viewport", () => {
    const p = computePlacement({ left: 350, right: 380 }, 320, { left: 0, right: 390 }, "end", 8);
    expect(p.maxWidth).toBe(374);
    expect(350 + p.left).toBeGreaterThanOrEqual(8);
    expect(350 + p.left + 320).toBeLessThanOrEqual(382);
  });
});

describe("Popover", () => {
  it("clamps inside the anchor pane using measured rects", () => {
    const rect = (l: number, r: number) =>
      ({
        left: l,
        right: r,
        top: 0,
        bottom: 0,
        width: r - l,
        height: 0,
        x: l,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute("role") === "dialog" ? rect(0, 320) : rect(20, 50);
    });
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.parentElement;
    });
    render(
      <div style={{ position: "relative" }}>
        <Popover open onClose={() => {}} label="Note" align="end">
          text
        </Popover>
      </div>,
    );
    const dlg = screen.getByRole("dialog");
    expect(dlg.style.left).toBe("-12px");
    vi.restoreAllMocks();
  });

  it("closes on Escape and outside click", () => {
    const onClose = vi.fn();
    render(
      <Popover open onClose={onClose} label="Note">
        text
      </Popover>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
