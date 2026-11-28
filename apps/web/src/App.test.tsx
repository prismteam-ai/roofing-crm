import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderApp } from "../test/mock-api.tsx";

vi.mock("./features/map/webgl.ts", () => ({ webglAvailable: () => false }));

test("the shell shows the pinned run, the map page and the lead count", async () => {
  renderApp({ "leads.list": () => [{ id: "x" }] });
  expect(
    await screen.findByText(/run 20261127T223244Z-incremental · as of 2026-11-27 · 766,044 properties/),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
  const leads = screen.getByRole("link", { name: /Leads/ });
  await waitFor(() => expect(leads.querySelector(".count")).toHaveTextContent("1"));
});

test("an unreachable Oracle shows the degraded banner and leads keep working", async () => {
  const { snapshot } = await import("../test/mock-api.tsx");
  renderApp({ "meta.snapshot": () => snapshot({ oracleHealthy: false }) }, { hash: "#/leads" });
  expect(await screen.findByText(/Property data is unavailable/)).toBeInTheDocument();
  expect(await screen.findByText("No leads match these filters.")).toBeInTheDocument();
});
