/**
 * Design tests: plat sheet notices read as clerk annotations, not inputs.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { PlatSheetNotice } from "../../src/chrome/PlatSheetNotice";

afterEach(() => {
  cleanup();
});

describe("PlatSheetNotice", () => {
  it("exposes a note role and title-block class without field chrome", () => {
    render(
      createElement(PlatSheetNotice, {
        testId: "plat-sheet-notice-sample",
        children: "Your leads list lasts until the local API restarts.",
      }),
    );

    const note = screen.getByRole("note");
    expect(note.getAttribute("data-testid")).toBe("plat-sheet-notice-sample");
    expect(note.className).toContain("plat-sheet-notice");
    expect(note.className).not.toMatch(/\bborder\b/);
    expect(note.className).not.toMatch(/\brounded/);
    expect(note.textContent).toMatch(/local API restarts/i);
  });
});
