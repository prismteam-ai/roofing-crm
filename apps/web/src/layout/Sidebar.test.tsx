import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FUTURE_SECTIONS, Sidebar } from "./Sidebar.tsx";

test("future sections are visible, aria-disabled, and not navigable", () => {
  render(<Sidebar route="map" />);
  expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("href", "#/map");
  expect(screen.getByRole("link", { name: /Leads/ })).toHaveAttribute("href", "#/leads");
  for (const s of FUTURE_SECTIONS) {
    const el = screen.getByText(s).closest("[aria-disabled]")!;
    expect(el).toBeVisible();
    expect(el).toHaveAttribute("aria-disabled", "true");
    expect(el).toHaveAttribute("title", "Coming soon");
    expect(el).not.toHaveAttribute("href");
    expect(el.querySelector("svg")).not.toBeNull();
  }
  expect(FUTURE_SECTIONS).toEqual([
    "Campaigns",
    "Estimates & Quotes",
    "Jobs & Scheduling",
    "Invoicing",
    "Storm Tracking",
    "Team & Territories",
  ]);
});
