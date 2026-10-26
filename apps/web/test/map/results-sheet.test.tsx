// ResultsSheet: below 840 px the results live in a bottom sheet over the map that peeks and can
// be expanded (tap or drag the handle); from 840 px it is the right-hand results pane (CSS only).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResultsSheet } from "../../src/routes/Map/ResultsSheet.js";

afterEach(cleanup);

function sheet(): HTMLElement {
  return screen.getByRole("region", { name: "Results" });
}

describe("ResultsSheet", () => {
  it("starts peeking, with an expand handle", () => {
    render(
      <ResultsSheet>
        <p>rows</p>
      </ResultsSheet>,
    );
    expect(sheet()?.getAttribute("data-sheet")).toBe("peek");
    const handle = screen.getByRole("button", { name: "Expand the results sheet" });
    expect(handle?.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("rows")).not.toBeNull();
  });

  it("tapping the handle toggles between peek and full", () => {
    render(<ResultsSheet>rows</ResultsSheet>);
    fireEvent.click(screen.getByRole("button", { name: "Expand the results sheet" }));
    expect(sheet()?.getAttribute("data-sheet")).toBe("full");
    const handle = screen.getByRole("button", { name: "Shrink the results sheet" });
    expect(handle?.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(handle);
    expect(sheet()?.getAttribute("data-sheet")).toBe("peek");
  });

  it("dragging the handle up expands and dragging down shrinks", () => {
    render(<ResultsSheet>rows</ResultsSheet>);
    const handle = screen.getByRole("button", { name: /results sheet/ });
    // jsdom has no PointerEvent; a MouseEvent of the same type carries clientY to React.
    const drag = (type: string, clientY: number): boolean =>
      fireEvent(handle, new MouseEvent(type, { clientY, bubbles: true }));
    drag("pointerdown", 500);
    drag("pointerup", 300);
    expect(sheet()?.getAttribute("data-sheet")).toBe("full");
    drag("pointerdown", 300);
    drag("pointerup", 520);
    expect(sheet()?.getAttribute("data-sheet")).toBe("peek");
  });

  it("keyboard: arrow keys on the handle expand and shrink", () => {
    render(<ResultsSheet>rows</ResultsSheet>);
    const handle = screen.getByRole("button", { name: /results sheet/ });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(sheet()?.getAttribute("data-sheet")).toBe("full");
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(sheet()?.getAttribute("data-sheet")).toBe("peek");
  });
});
