// A path that matches no screen renders a proper not-found page inside the shell (Atlas card, a
// way back to the Map) instead of a blank body, and the favicon is a real file so the browser does
// not request a missing /favicon.ico on every load (a 404 in the console).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { Component as NotFound } from "../../src/routes/NotFound.js";

afterEach(cleanup);

describe("not-found route", () => {
  it("renders a named card with a link back to the Map for an unknown path", () => {
    render(
      <MemoryRouter initialEntries={["/nonexistent"]}>
        <Routes>
          <Route path="/" element={<p>map</p>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    );
    const page = screen.getByRole("region", { name: "Page not found" });
    expect(page.getAttribute("data-route")).toBe("not-found");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("There’s no page here");
    expect(page.textContent).toContain("/nonexistent");
    expect(screen.getByRole("link", { name: "Back to Map" }).getAttribute("href")).toBe("/");
  });

  it("is a catch-all route inside the shell in App.tsx", () => {
    const app = readFileSync(join(__dirname, "../../src/App.tsx"), "utf8");
    const shell = app.slice(app.indexOf("<RequireSession>"), app.indexOf("</Route>"));
    expect(shell).toMatch(/<Route path="\*" element=\{<NotFound \/>\} \/>/);
  });
});

describe("favicon", () => {
  it("index.html links an icon that exists in public/, so /favicon.ico is never requested", () => {
    const html = readFileSync(join(__dirname, "../../index.html"), "utf8");
    const href = /<link rel="icon"[^>]*href="([^"]+)"/.exec(html)?.[1];
    expect(href).toBeDefined();
    expect(existsSync(join(__dirname, "../../public", href ?? ""))).toBe(true);
  });
});
