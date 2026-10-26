// The Filters sheet below 1280 px (phones and tablets): focus goes in and comes back, Escape and
// the backdrop close it, a Show n results button closes it with the count, and its CSS keeps clear
// of the safe areas and stays a sensible width on a 600 to 1279 px screen.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterSheet } from "../src/routes/Map/FilterSheet";

afterEach(cleanup);

function renderSheet(over: Partial<Parameters<typeof FilterSheet>[0]> = {}) {
  return render(
    <FilterSheet
      roofAgeMinYears={15}
      onRoofAgeMinYearsChange={vi.fn()}
      permitStatus="any"
      onPermitStatusChange={vi.fn()}
      permitOpenYrs={undefined}
      onPermitOpenYrsChange={vi.fn()}
      matchCount={128}
      {...over}
    />,
  );
}

const toggle = (): HTMLElement => screen.getByRole("button", { name: /^Filters/ });

describe("FilterSheet on phones and tablets", () => {
  it("moves focus into the sheet when it opens and back to the Filters button when it closes", () => {
    renderSheet();
    toggle().focus();
    fireEvent.click(toggle());
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle());
  });

  it("closes with its Close button, the backdrop and Escape, each returning focus", () => {
    renderSheet();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(document.activeElement).toBe(toggle());
    fireEvent.click(toggle());
    fireEvent.click(
      document.querySelector("[aria-hidden='true'][class*='backdrop']") as HTMLElement,
    );
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle());
  });

  it("has a Show n results button with the count, which closes the sheet", () => {
    renderSheet({ matchCount: 128 });
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Show 128 results" }));
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("says Show 1 result for one, and plain Show results with no count", () => {
    renderSheet({ matchCount: 1 });
    fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: "Show 1 result" })).toBeTruthy();
    cleanup();
    renderSheet({ matchCount: undefined });
    fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: "Show results" })).toBeTruthy();
  });

  it("traps Tab inside the open sheet: it wraps from the last control to the first and back", () => {
    renderSheet();
    fireEvent.click(toggle());
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input, select"),
    ];
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("does not trap Tab for the always-visible panel (three-pane widths)", () => {
    renderSheet({ inline: true, open: true });
    const region = screen.getByRole("region", { name: "Filters" });
    const buttons = region.querySelectorAll<HTMLElement>("button");
    const last = buttons[buttons.length - 1] as HTMLElement;
    last.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    last.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not take focus when it is the always-visible panel (three-pane widths)", () => {
    renderSheet({ inline: true, open: true });
    expect(document.activeElement).toBe(document.body);
  });
});

describe("FilterSheet sheet CSS", () => {
  const css = readFileSync(join(__dirname, "../src/routes/Map/FilterSheet.module.css"), "utf8");
  const open = (css.match(/\.open \{[^}]*\}/) ?? [""])[0];

  it("keeps clear of the bottom safe area and scrolls inside the viewport", () => {
    expect(open).toMatch(/env\(safe-area-inset-bottom/);
    expect(open).toMatch(/max-height:\s*min\(80vh/);
  });

  it("is a centred card of a sensible width on a 600 to 1279 px screen, full width on phones", () => {
    expect(open).toMatch(/width:\s*min\(100%/);
    expect(open).toMatch(/margin-inline:\s*auto/);
  });

  it("hides the Show results footer where the panel is always visible", () => {
    expect(css).toMatch(/@media \(min-width: 1280px\) \{[^@]*\.footer \{\s*display:\s*none/);
  });
});

describe("FilterSheet counts", () => {
  it("groups thousands in the toggle chip and in Show n results", () => {
    renderSheet({ matchCount: 441961 });
    expect(document.querySelector("[data-filter-count]")?.textContent).toBe("441,961");
    fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: "Show 441,961 results" })).toBeTruthy();
  });
});
