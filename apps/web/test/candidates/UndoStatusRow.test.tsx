// The inline "Created n leads · Undo" row: it outlives the 10 s snackbar and stays until the
// server's 15-minute undo window (client clock from the create time) ends, or it is dismissed.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UNDO_WINDOW_MS } from "@crm/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UndoStatusRow } from "../../src/routes/Map/Candidates/UndoStatusRow";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = new Date("2026-10-25T12:00:00Z").getTime();

function mount(over: Partial<React.ComponentProps<typeof UndoStatusRow>> = {}) {
  const props = {
    count: 3,
    createdAt: NOW,
    undoing: false,
    onUndo: vi.fn(),
    onDismiss: vi.fn(),
    ...over,
  };
  render(<UndoStatusRow {...props} />);
  return props;
}

describe("UndoStatusRow", () => {
  it("says what was created and offers Undo", () => {
    vi.setSystemTime(NOW);
    mount();
    expect(screen.getByRole("status").textContent).toContain("Created 3 leads");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  });

  it("says lead, not leads, for one", () => {
    vi.setSystemTime(NOW);
    mount({ count: 1 });
    expect(screen.getByRole("status").textContent).toContain("Created 1 lead");
  });

  it("is still there long after the 10 s snackbar would be gone, until the window ends", () => {
    vi.setSystemTime(NOW);
    const props = mount();
    act(() => {
      vi.advanceTimersByTime(14 * 60 * 1000);
    });
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(props.onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(60 * 1000 + 1);
    });
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("counts the window from the create time, not from when the row mounted", () => {
    vi.setSystemTime(NOW + 10 * 60 * 1000);
    const props = mount();
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    });
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("is already over when mounted past the window", () => {
    vi.setSystemTime(NOW + UNDO_WINDOW_MS + 1000);
    const props = mount();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(props.onDismiss).toHaveBeenCalled();
  });

  it("shows Undoing… while the server works, and the outcome once there is one", () => {
    vi.setSystemTime(NOW);
    mount({ undoing: true });
    expect(screen.getByRole("button", { name: "Undoing…" }).hasAttribute("disabled")).toBe(true);
    cleanup();
    mount({ summary: "Undid 1 lead · 1 kept (it was updated after it was created)" });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(
      screen.getByText("Undid 1 lead · 1 kept (it was updated after it was created)"),
    ).toBeTruthy();
  });

  it("can be dismissed", () => {
    vi.setSystemTime(NOW);
    const props = mount();
    fireEvent.click(screen.getByRole("button", { name: "Hide undo" }));
    expect(props.onDismiss).toHaveBeenCalled();
  });

  it("mirrors the server's undo window (the two constants must not drift)", () => {
    const api = readFileSync(join(__dirname, "../../../api/src/services/leads.ts"), "utf8");
    const match = /export const UNDO_WINDOW_MS = (\d+) \* (\d+) \* (\d+);/.exec(api);
    expect(match).not.toBeNull();
    const ms = Number(match?.[1]) * Number(match?.[2]) * Number(match?.[3]);
    expect(UNDO_WINDOW_MS).toBe(ms);
  });
});
