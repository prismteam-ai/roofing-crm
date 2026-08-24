/**
 * Design tests for deferred CRM sheets (Campaigns / Inbox / Reports).
 *
 * Asserts future sections open as honest Coming-soon stamps from the floating
 * bar, never as working Campaigns, Inbox, or Reports apps.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";

afterEach(() => {
  cleanup();
});

function StubMapLibreMapCanvas(_props: MapLibreMapCanvasProps): ReactElement {
  return createElement("div", { "data-testid": "map-stub" });
}

function renderMapSearchShell() {
  return render(
    createElement(MapSearchShell, {
      defaultCountyKey: "lee",
      MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
    }),
  );
}

describe("Deferred CRM sheets", () => {
  it("Campaigns is a floating-bar control that opens a disabled placeholder", () => {
    renderMapSearchShell();

    fireEvent.click(screen.getByTestId("plat-floating-bar-campaigns"));

    expect(screen.getByRole("heading", { name: /^campaigns$/i })).toBeTruthy();
    expect(screen.getByTestId("plat-deferred-sheet-campaigns").textContent).toMatch(
      /one pass on the block/i,
    );
    expect(
      screen.getByTestId("plat-deferred-sheet-campaigns-action").getAttribute("alt"),
    ).toMatch(/campaigns is coming soon/i);
    expect(
      screen.getByTestId("plat-deferred-sheet-campaigns-action").getAttribute("src"),
    ).toBe("/plat/stamp-coming.png");
    expect(
      screen.getByTestId("plat-deferred-sheet-campaigns").querySelector("button"),
    ).toBeNull();
    expect(screen.queryByTestId("disabled-crm-nav")).toBeNull();
    expect(screen.queryByTestId("crm-campaigns-workspace")).toBeNull();
  });

  it("Inbox is a floating-bar control that opens a disabled placeholder", () => {
    renderMapSearchShell();

    fireEvent.click(screen.getByTestId("plat-floating-bar-inbox"));

    expect(screen.getByRole("heading", { name: /^inbox$/i })).toBeTruthy();
    expect(screen.getByTestId("plat-deferred-sheet-inbox").textContent).toMatch(
      /does not message owners yet/i,
    );
    expect(
      screen.getByTestId("plat-deferred-sheet-inbox-action").getAttribute("alt"),
    ).toMatch(/inbox is coming soon/i);
    expect(
      screen.getByTestId("plat-deferred-sheet-inbox-action").getAttribute("src"),
    ).toBe("/plat/stamp-coming.png");
    expect(
      screen.getByTestId("plat-deferred-sheet-inbox").querySelector("button"),
    ).toBeNull();
    expect(screen.queryByTestId("crm-inbox-workspace")).toBeNull();
    expect(screen.queryByRole("list", { name: /messages/i })).toBeNull();
  });

  it("Reports is a floating-bar control that opens a disabled placeholder", () => {
    renderMapSearchShell();

    fireEvent.click(screen.getByTestId("plat-floating-bar-reports"));

    expect(screen.getByRole("heading", { name: /^reports$/i })).toBeTruthy();
    expect(screen.getByTestId("plat-deferred-sheet-reports").textContent).toMatch(
      /see the results of your walks/i,
    );
    expect(
      screen.getByTestId("plat-deferred-sheet-reports-action").getAttribute("alt"),
    ).toMatch(/reports is coming soon/i);
    expect(
      screen.getByTestId("plat-deferred-sheet-reports-action").getAttribute("src"),
    ).toBe("/plat/stamp-coming.png");
    expect(
      screen.getByTestId("plat-deferred-sheet-reports").querySelector("button"),
    ).toBeNull();
    expect(screen.queryByTestId("crm-reports-workspace")).toBeNull();
  });

  it("clicking Inbox does not open a fake working inbox", () => {
    renderMapSearchShell();
    fireEvent.click(screen.getByTestId("plat-floating-bar-inbox"));

    expect(screen.queryByTestId("crm-inbox-workspace")).toBeNull();
    expect(screen.getByTestId("plat-deferred-sheet-inbox").textContent).toMatch(
      /write owners from your leads list/i,
    );
    expect(
      screen
        .getByTestId("plat-deferred-sheet-inbox")
        .querySelector("button:not([disabled])"),
    ).toBeNull();
  });

  it("does not keep Campaigns Inbox Reports as a doors-sheet legend", () => {
    renderMapSearchShell();

    expect(screen.queryByTestId("disabled-crm-nav")).toBeNull();
    expect(screen.getByTestId("plat-floating-bar-inbox")).toBeTruthy();
    expect(screen.getByTestId("plat-floating-bar-reports")).toBeTruthy();
    expect(screen.getByTestId("plat-floating-bar-campaigns")).toBeTruthy();
  });
});
