// T029 (B-01): adapted from A-13 T041 for the CRM's own 5 roadmap sections and the
// /coming-soon/:section route (AC-5). The route tests are rewritten for campaigns/estimates/jobs/invoices/
// outreach and a "Back to Map" action instead of Task A's county-explore logic.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { LIVE_SECTION_LABELS, ROADMAP_NAV } from "../src/components/AppShell/navigation";

afterEach(cleanup);

async function renderSection(section: string): Promise<HTMLElement> {
  const { Component } = await import("../src/routes/ComingSoon");
  render(
    <MemoryRouter initialEntries={[`/coming-soon/${section}`]}>
      <Routes>
        <Route path="/coming-soon/:section" element={<Component />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByRole("region");
}

// CrmComingSoon390/768/1440: a centred card with the section's purpose, "planned but not part of
// this release", a provenance line and a filled Back to Map button; no skeleton (the boards draw
// none). The purpose lines are the nav tooltips of design/docs/CRM-HANDOFF.md "Coming-soon items".
const routeCss = (): string =>
  readFileSync(join(__dirname, "../src/routes/ComingSoon.module.css"), "utf8");

describe("ComingSoon route (T029, AC-5; CrmComingSoon390/768/1440)", () => {
  for (const item of ROADMAP_NAV) {
    it(`${item.section}: "${item.label} is coming soon" card, planned-not-in-release body, provenance, filled Back to Map`, async () => {
      const page = await renderSection(item.section);
      expect(page.getAttribute("data-route")).toBe("coming-soon");
      expect(page.getAttribute("data-state")).toBe("ready");
      const card = page.querySelector("[data-coming-soon-item]");
      expect(card?.getAttribute("data-coming-soon-item")).toBe(item.section);
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
        `${item.label} is coming soon`,
      );
      expect(
        screen.getByText(
          `${item.line} It is planned for the Roofing CRM but not part of this release, so there is nothing to open yet.`,
        ),
      ).toBeTruthy();
      expect(screen.getByText(`Roofing CRM · ${LIVE_SECTION_LABELS.join(" and ")}`)).toBeTruthy();
      expect(page.querySelector("[data-skeleton]")).toBeNull();
      const backLink = screen.getByRole("link", { name: "Back to Map" });
      expect(backLink.getAttribute("href")).toBe("/");
      expect(backLink.getAttribute("data-variant")).toBe("filled");
    });
  }

  it("the live sections are read from the navigation table: Map and Leads", () => {
    expect(LIVE_SECTION_LABELS).toEqual(["Map", "Leads"]);
  });

  it("an unknown section says there is no section here, with a Back to Map link, never a 404 (AC-5)", async () => {
    const page = await renderSection("nope");
    expect(page.getAttribute("data-state")).toBe("not-found");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("There’s no section here");
    expect(
      screen.getByText(
        "This link doesn’t match a CRM section. The live sections are Map and Leads.",
      ),
    ).toBeTruthy();
    const backLink = screen.getByRole("link", { name: "Back to Map" });
    expect(backLink.getAttribute("href")).toBe("/");
    expect(backLink.getAttribute("data-variant")).toBe("filled");
  });

  it("the card is centred and Back to Map is a filled primary button (Atlas tokens only)", () => {
    const source = routeCss();
    expect(source).toMatch(/place-items: center/);
    expect(source).toMatch(/background: var\(--md-sys-color-primary\)/);
    expect(source).toMatch(/color: var\(--md-sys-color-on-primary\)/);
    expect(source).toMatch(/--md-sys-shape-corner-full/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
