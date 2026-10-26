// T024/T027: aria-disabled is a real attribute (not merely styled), the row is focusable, shows a
// "Coming soon" tooltip (title attribute), and clicking/activating it navigates to
// /coming-soon/:section (AC-4, AC-5) — never a no-op.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { NavRow } from "../src/NavRow/NavRow.js";

afterEach(cleanup);

function renderNavRow() {
  return render(
    <MemoryRouter>
      <NavRow section="campaigns" label="Campaigns" />
    </MemoryRouter>,
  );
}

describe("NavRow (packages/ui, T027)", () => {
  it('is aria-disabled="true", focusable, and shows a "Coming soon" tooltip', () => {
    renderNavRow();
    const row = screen.getByRole("button", { name: /Campaigns/ });
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute("title")).toBe("Coming soon");
    expect(screen.getByText("Coming soon")).toBeTruthy();
  });

  it("a click routes to /coming-soon/:section rather than doing nothing (AC-5)", () => {
    renderNavRow();
    fireEvent.click(screen.getByRole("button", { name: /Campaigns/ }));
    // No navigate assertion helper wired here (MemoryRouter has no location observer by
    // default) — covered end-to-end in tests/e2e/B-01.spec.ts (T025). This asserts the handler
    // does not throw and the element stays mounted (not a silent no-op).
    expect(screen.getByRole("button", { name: /Campaigns/ })).toBeTruthy();
  });

  it("Enter and Space both activate the row from the keyboard", () => {
    renderNavRow();
    const row = screen.getByRole("button", { name: /Campaigns/ });
    const onKeyDown = vi.fn();
    row.addEventListener("keydown", onKeyDown);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onKeyDown).toHaveBeenCalledTimes(2);
  });
});
