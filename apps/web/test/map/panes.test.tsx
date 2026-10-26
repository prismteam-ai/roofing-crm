// The map's two collapsible panes (PO review, three-pane widths): a chevron handle on each pane's
// inner edge, a slim rail when collapsed, state kept for the browser session and independent per
// pane. Every storage access is in try/catch and the page works without storage.
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaneHandle } from "../../src/routes/Map/PaneHandle.js";
import { usePaneCollapsed } from "../../src/routes/Map/paneState.js";

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PaneHandle", () => {
  it.each([
    ["left", "filters", false, "Hide filters panel"],
    ["left", "filters", true, "Show filters panel"],
    ["right", "results", false, "Hide results panel"],
    ["right", "results", true, "Show results panel"],
  ] as const)("%s pane, collapsed=%s: named %s", (side, label, collapsed, name) => {
    render(
      <PaneHandle
        side={side}
        label={label}
        collapsed={collapsed}
        controls="body"
        onToggle={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name });
    expect(button.getAttribute("aria-expanded")).toBe(String(!collapsed));
    expect(button.getAttribute("aria-controls")).toBe("body");
  });

  it("toggles on click, and shows a vertical label only when collapsed", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <PaneHandle side="left" label="filters" collapsed={false} controls="b" onToggle={onToggle} />,
    );
    expect(document.querySelector("[data-pane-label]")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<PaneHandle side="left" label="filters" collapsed controls="b" onToggle={onToggle} />);
    expect(document.querySelector("[data-pane-label]")?.textContent).toBe("Filters");
  });
});

describe("usePaneCollapsed", () => {
  it("defaults to expanded and toggles", () => {
    const { result } = renderHook(() => usePaneCollapsed("left"));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });

  it("keeps each pane independently for the session", () => {
    const left = renderHook(() => usePaneCollapsed("left"));
    act(() => left.result.current[1]());
    expect(renderHook(() => usePaneCollapsed("left")).result.current[0]).toBe(true);
    expect(renderHook(() => usePaneCollapsed("right")).result.current[0]).toBe(false);
  });

  it("works without storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => usePaneCollapsed("right"));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
  });

  it("starts collapsed while `auto` says the pane is empty, follows `auto` until the user toggles, then keeps their choice", async () => {
    vi.resetModules();
    const fresh = await import("../../src/routes/Map/paneState.js");
    const { result, rerender } = renderHook(({ auto }) => fresh.usePaneCollapsed("right", auto), {
      initialProps: { auto: true },
    });
    expect(result.current[0]).toBe(true);
    rerender({ auto: false });
    expect(result.current[0]).toBe(false);
    rerender({ auto: true });
    expect(result.current[0]).toBe(true);
    // The user expands it: that choice stands even though the pane is still empty.
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    rerender({ auto: true });
    expect(result.current[0]).toBe(false);
  });
});
