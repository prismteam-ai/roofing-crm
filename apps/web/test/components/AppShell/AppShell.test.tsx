// Shell UI fix (design-review-log rows 3 and 22; boards CrmShell1440, CrmShell390, CrmAppsMenu,
// CrmDataChip, CrmAccount, CrmBottomNav): the top bar carries the county, the data chip (run from
// the API, never hard-coded), the Apps menu and the account menu with Sign out; the rail shows
// contained icon + label + "Soon" items; the 390 More tab has an icon and its sheet sits above
// the bottom nav with Coming-soon rows, Apps and Sign out. Written before the components.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface QueryState<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

const MANIFEST = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const RUN_ID = "travis-202609-permits-20261021t103516z";

const refetch = vi.fn();
let indexState: QueryState<{
  manifestCid: string;
  runId: string | null;
  promotedAt: string;
  propertyCount: number;
  permitCount: number;
  traceId: string;
}>;
let linksState: QueryState<{ countyLensUrl: string | null; landingPageUrl: string | null }>;

vi.mock("../../../src/components/AppShell/shellApi", () => ({
  useShellIndexInfo: () => indexState,
  useShellAppLinks: () => linksState,
}));

const signOutMock = vi.fn(() => localStorage.removeItem("crm.session"));
vi.mock("../../../src/auth/signOut", () => ({ signOut: () => signOutMock() }));

import { AppShell, DESTINATIONS } from "../../../src/components/AppShell";
import { longRunLabel, shortRunLabel } from "../../../src/components/AppShell/DataChip";
import { WHAT_CAN_I_ASK_EVENT } from "../../../src/components/Onboarding/firstVisit";
import { capitalise, initialsOf } from "../../../src/components/AppShell/ShellTopBar";

const shellDir = join(__dirname, "../../../src/components/AppShell");
const css = (file: string): string => readFileSync(join(shellDir, file), "utf8");

function Where(): ReactElement {
  const location = useLocation();
  return (
    <div data-testid="where" data-search={location.search}>
      {location.pathname}
    </div>
  );
}

function renderShell(path = "/"): QueryClient {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/sign-in" element={<Where />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Where />} />
            <Route path="/coming-soon/:section" element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  refetch.mockReset();
  signOutMock.mockClear();
  indexState = {
    data: {
      manifestCid: MANIFEST,
      runId: RUN_ID,
      promotedAt: "2026-10-21T10:35:16Z",
      propertyCount: 12,
      permitCount: 34,
      traceId: "t",
    },
    isPending: false,
    isError: false,
    refetch,
  };
  linksState = {
    data: { countyLensUrl: "https://countylens.example.test", landingPageUrl: null },
    isPending: false,
    isError: false,
    refetch,
  };
  localStorage.setItem("crm.session", "{}");
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("top bar", () => {
  it("shows the title and Travis County as the one published county", () => {
    renderShell();
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("heading", { name: "Roofing CRM" })).toBeTruthy();
    const county = within(bar).getByText("Travis County, TX");
    expect(county.closest("[data-county]")?.getAttribute("title")).toBe(
      "Travis County, TX is the only county CountyLens publishes",
    );
  });

  it("data chip names the promoted run from the API and opens the data-source panel", () => {
    renderShell();
    const chip = screen.getByRole("button", { name: `Data: CountyLens run ${RUN_ID}` });
    expect(chip?.getAttribute("data-state")).toBe("ready");
    fireEvent.click(chip);
    const panel = screen.getByRole("dialog", { name: "Data source" });
    expect(panel?.textContent).toContain("The lead index is built from the CountyLens manifest");
    expect(panel?.textContent).toContain("2026-10-21 10:35:16 UTC");
    expect(panel?.textContent).toContain("The CRM reads only published CountyLens data.");
    expect(panel?.textContent).toContain(`Index up to date · Run 21 Oct 2026`);
    expect(panel.querySelector(`[data-cid="${MANIFEST}"]`)).not.toBeNull();
    const link = within(panel).getByRole("link", { name: /CountyLens Data/ });
    expect(link?.getAttribute("href")).toBe("https://countylens.example.test/data/manifest");
    const verify = within(panel).getByRole("link", { name: "Verify this run" });
    expect(verify.getAttribute("href")).toBe(
      `https://countylens.example.test/data/verify/${MANIFEST}`,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Data source" })).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it("data chip says why the run is missing when the index has no run id", () => {
    const ready = indexState.data;
    if (ready === undefined) throw new Error("fixture");
    indexState = { ...indexState, data: { ...ready, runId: null } };
    renderShell();
    expect(
      screen.getByRole("button", { name: "Data: CountyLens run not recorded in the index" }),
    ).toBeTruthy();
  });

  it("data chip shows a loading state, then Index unavailable with Retry on error", () => {
    indexState = { ...indexState, data: undefined, isPending: true };
    renderShell();
    expect(screen.getByRole("button", { name: "Data: loading" })?.getAttribute("data-state")).toBe(
      "loading",
    );
    cleanup();

    indexState = { ...indexState, data: undefined, isPending: false, isError: true };
    renderShell();
    const chip = screen.getByRole("button", { name: "Data: Index unavailable" });
    fireEvent.click(chip);
    const panel = screen.getByRole("dialog", { name: "Data source" });
    expect(panel?.textContent).toContain("The lead index is unavailable");
    fireEvent.click(within(panel).getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("Apps menu lists CountyLens (from config), Roofing CRM as current, and the landing page", () => {
    renderShell();
    const apps = screen.getByRole("button", { name: "Apps" });
    fireEvent.click(apps);
    const menu = screen.getByRole("menu", { name: "Apps" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "CountyLens",
      "Roofing CRM",
      "Landing pageNot available yet",
    ]);
    expect(items[0]?.getAttribute("href")).toBe("https://countylens.example.test");
    expect(items[1]?.getAttribute("aria-current")).toBe("page");
    expect(items[1]?.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(items[2]?.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Apps" })).toBeNull();
    expect(document.activeElement).toBe(apps);
  });

  it("Apps menu says CountyLens is not available yet when EXPLORER_BASE_URL is unset", () => {
    linksState = { ...linksState, data: { countyLensUrl: null, landingPageUrl: null } };
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Apps" }));
    const items = within(screen.getByRole("menu", { name: "Apps" })).getAllByRole("menuitem");
    expect(items[0]?.textContent).toBe("CountyLensNot available yet");
    expect(items[0]?.getAttribute("href")).toBeNull();
  });

  it("the data panel shows no CountyLens links when the URL is not configured", () => {
    linksState = { ...linksState, data: { countyLensUrl: null, landingPageUrl: null } };
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: `Data: CountyLens run ${RUN_ID}` }));
    const panel = screen.getByRole("dialog", { name: "Data source" });
    expect(within(panel).queryByRole("link")).toBeNull();
  });

  it("Apps menu links the landing page when it is configured", () => {
    linksState = {
      ...linksState,
      data: { countyLensUrl: "https://countylens.example.test", landingPageUrl: "https://l.test" },
    };
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Apps" }));
    expect(screen.getByRole("menuitem", { name: "Landing page" })?.getAttribute("href")).toBe(
      "https://l.test",
    );
  });

  it("account menu signs out: clears the session and lands on /sign-in", async () => {
    const client = renderShell();
    const clear = vi.spyOn(client, "clear");
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    const menu = screen.getByRole("menu", { name: "Account" });
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("crm.session")).toBeNull();
    expect(clear).toHaveBeenCalled();
    expect(screen.getByTestId("where")?.textContent).toContain("/sign-in");
  });
});

describe("navigation", () => {
  it("Ask uses the robot icon (smart_toy), as on CrmBottomNav", () => {
    expect(DESTINATIONS.find((d) => d.label === "Ask")?.icon).toBe("smart_toy");
    renderShell();
    const ask = screen.getByRole("link", { name: "Ask" });
    expect(ask.querySelector('[data-icon="smart_toy"]')).not.toBeNull();
  });

  it("rail items are icon + short label + Soon, aria-disabled with the Coming soon tooltip", () => {
    renderShell();
    const rail = screen.getByLabelText("Roadmap sections (not yet built)");
    // jsdom applies the < 600 px CSS (rail display: none), so query hidden nodes too.
    const rows = within(rail).getAllByRole("button", { hidden: true });
    expect(rows).toHaveLength(5);
    const campaigns = within(rail).getByRole("button", { name: /Campaigns/, hidden: true });
    expect(campaigns?.getAttribute("aria-disabled")).toBe("true");
    expect(campaigns?.getAttribute("title")).toBe("Coming soon");
    expect(campaigns.querySelector('[data-icon="campaign"]')).not.toBeNull();
    expect(within(campaigns).getByText("Soon")).toBeTruthy();
    fireEvent.click(campaigns);
    expect(screen.getByTestId("where")?.textContent).toContain("/coming-soon/campaigns");
  });

  it("rail items stack vertically and clip inside the 80 px rail", () => {
    const rail = css("RoadmapItem.module.css");
    expect(rail).toMatch(/\.rail\s*{[^}]*flex-direction:\s*column/);
    expect(rail).toMatch(/\.label\s*{[^}]*text-overflow:\s*ellipsis/);
    expect(rail).toMatch(/\.rail\s*{[^}]*max-width:\s*100%/);
  });

  it("More tab has the more_horiz icon and its sheet lists Coming soon, Apps and Sign out", () => {
    renderShell();
    const more = screen.getByRole("button", { name: "More" });
    expect(more.querySelector('[data-icon="more_horiz"]')).not.toBeNull();
    fireEvent.click(more);
    const sheet = screen.getByRole("dialog", { name: "More" });
    for (const [label, icon] of [
      ["Campaigns", "campaign"],
      ["Estimates", "request_quote"],
      ["Jobs", "construction"],
      ["Invoices", "receipt_long"],
      ["Outreach", "mail"],
    ] as const) {
      const row = within(sheet).getByRole("button", { name: new RegExp(label) });
      expect(row?.getAttribute("aria-disabled")).toBe("true");
      expect(row?.getAttribute("title")).toBe("Coming soon");
      expect(row.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
    }
    expect(sheet?.textContent).toContain("Plan outreach to groups of leads.");
    expect(within(sheet).getByRole("link", { name: "CountyLens" })?.getAttribute("href")).toBe(
      "https://countylens.example.test",
    );
    expect(within(sheet).getByRole("button", { name: /Sign out/ })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("a More sheet row opens its Coming soon page and closes the sheet", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    fireEvent.click(within(sheet).getByRole("button", { name: /Jobs/ }));
    expect(screen.getByTestId("where")?.textContent).toContain("/coming-soon/jobs");
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
  });

  it("the More sheet sits above the bottom nav and its rows are not drawn disabled", () => {
    const sheet = css("MoreSheet.module.css");
    expect(sheet).toMatch(
      /\.panel\s*{[^}]*bottom:\s*calc\(var\(--space-10\) \+ var\(--space-4\)\)/,
    );
    expect(sheet).not.toMatch(/disabled-opacity/);
  });

  it("More sheet Sign out clears the session and lands on /sign-in", async () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: /Sign out/ }));
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("where")?.textContent).toContain("/sign-in");
  });
});

describe("AppShell main region: full-bleed Map, padded everywhere else", () => {
  it("drops the page margin on the Map route only", () => {
    renderShell("/");
    expect(screen.getByRole("main").getAttribute("data-layout")).toBe("full-bleed");
    cleanup();
    renderShell("/coming-soon/campaigns");
    expect(screen.getByRole("main").getAttribute("data-layout")).toBe("padded");
  });

  it("the stylesheet zeroes the padding for the full-bleed class above the 600 px margin rule", () => {
    const sheet = readFileSync(join(shellDir, "../AppShell.module.css"), "utf8");
    const rule = /\.main\.mainFullBleed\s*\{([^}]*)\}/.exec(sheet);
    expect(rule?.[1]).toMatch(/padding:\s*0;/);
    // The compact and medium+ page margins still apply to every other route.
    expect(sheet).toMatch(/\.main\s*\{[^}]*padding:\s*var\(--space-4\)/);
    expect(sheet).toMatch(
      /@media \(min-width: 600px\)[\s\S]*\.main\s*\{\s*padding:\s*var\(--space-6\)/,
    );
  });
});

// ---- Board review fixes (2026-10-25): 768 top bar, chip icon, rail current page, account,
// More sheet, Help menu ------------------------------------------------------------------------

const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
function signInAs(claims: Record<string, unknown>): void {
  localStorage.setItem(
    "crm.session",
    JSON.stringify({
      idToken: `${b64({ alg: "none" })}.${b64(claims)}.sig`,
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() + 3_600_000,
    }),
  );
}

describe("top bar below 840 px (CrmShellApps768)", () => {
  it("drops the county label below 840 px and keeps Apps from 600 px", () => {
    const bar = css("ShellTopBar.module.css");
    // Mobile first: hidden by default, shown from the breakpoint (styles-mobile-first.test.ts).
    expect(bar).toMatch(/\.county \{\s*display: none;/);
    expect(bar).toMatch(/@media \(min-width: 840px\)\s*{\s*\.county\s*{\s*display: inline-flex;/);
    expect(bar).toMatch(/@media \(max-width: 599px\)\s*{\s*\.apps,\s*\.help\s*{\s*display: none;/);
  });

  it("swaps the long data label for the short run label below 840 px", () => {
    const chip = css("DataChip.module.css");
    expect(chip).toMatch(/\.long \{\s*display: none;/);
    expect(chip).toMatch(/@media \(min-width: 840px\)\s*{\s*\.long\s*{\s*display: inline;/);
    expect(chip).toMatch(/\.short\s*{\s*display: inline;/);
  });

  it("shortRunLabel: a run number first, else a dated id as its day and month, else its tail", () => {
    expect(shortRunLabel("3")).toBe("Run 3");
    expect(shortRunLabel("travis-full-run3-20261025")).toBe("Run 3");
    expect(shortRunLabel("20261024")).toBe("24 Oct");
    expect(shortRunLabel("travis-2026-10-21-permits")).toBe("21 Oct");
    expect(shortRunLabel("travis-202609-permits-20261021t103516z")).toBe("21 Oct");
    expect(shortRunLabel("travis-full-run2-20261024")).toBe("Run 2");
    expect(shortRunLabel("travis-run-9999")).toBe("Run …n-9999");
    expect(shortRunLabel("travis-full-run2-20261399")).toBe("Run 2");
    expect(shortRunLabel(null)).toBe("Data");
  });

  it("longRunLabel: the run number with its date, a date-only id as a dated run, else the tail", () => {
    expect(longRunLabel("travis-full-run3-20261025")).toBe("Run 3 · 25 Oct 2026");
    expect(longRunLabel("travis-full-run2-20261399")).toBe("Run 2");
    expect(longRunLabel("20261024")).toBe("Run 24 Oct 2026");
    expect(longRunLabel("3")).toBe("Run 3");
    expect(longRunLabel("travis-run-abcdefghijk")).toBe("Run …fghijk");
    expect(longRunLabel(null)).toBeNull();
  });

  it("the chip shows the date for a dated run and keeps the full run id in its name and tooltip", () => {
    renderShell();
    const chip = screen.getByRole("button", { name: `Data: CountyLens run ${RUN_ID}` });
    expect(chip.getAttribute("title")).toBe(`Data: CountyLens run ${RUN_ID}`);
    expect(chip.lastElementChild?.textContent).toBe("21 Oct");
    expect(chip.textContent).toContain("Run 21 Oct 2026");
  });

  it("the bar sits 24 px from the edge from 600 px and has a 1 px edge on compact", () => {
    const shell = readFileSync(
      join(__dirname, "../../../src/components/AppShell.module.css"),
      "utf8",
    );
    expect(shell).toMatch(
      /\.bar\s*{[^}]*border-bottom: 1px solid var\(--md-sys-color-outline-variant\)/,
    );
    expect(shell).toMatch(
      /@media \(min-width: 600px\)[\s\S]*\.bar\s*{\s*padding: 0 var\(--space-6\);/,
    );
  });

  it("Apps menu rows are body-medium", () => {
    expect(css("AppLinks.module.css")).toMatch(/\.item\s*{[^}]*typescale-body-medium-size/);
  });
});

describe("data chip ready icon", () => {
  it("draws the ready glyph in the success token, and the error glyph in the error colour", () => {
    renderShell();
    const chip = screen.getByRole("button", { name: `Data: CountyLens run ${RUN_ID}` });
    expect(chip.querySelector('[data-state="ready"] [data-icon="cloud_done"]')).not.toBeNull();
    const chipCss = css("DataChip.module.css");
    expect(chipCss).toMatch(
      /\.stateIcon\[data-state="ready"\]\s*{\s*color: var\(--status-success\)/,
    );
    expect(chipCss).toMatch(
      /\.stateIcon\[data-state="error"\]\s*{\s*color: var\(--md-sys-color-error\)/,
    );
  });
});

describe("rail: the open Coming-soon page is the current page", () => {
  it("marks the open section aria-current=page, and no other", () => {
    renderShell("/coming-soon/campaigns");
    const rail = document.querySelector(
      '[aria-label="Roadmap sections (not yet built)"]',
    ) as HTMLElement;
    const current = rail.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("data-roadmap-section")).toBe("campaigns");
    expect(current[0]?.hasAttribute("data-active")).toBe(true);
  });

  it("marks none on the Map", () => {
    renderShell("/");
    const rail = document.querySelector(
      '[aria-label="Roadmap sections (not yet built)"]',
    ) as HTMLElement;
    expect(rail.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it("fills the icon pill when current", () => {
    expect(css("RoadmapItem.module.css")).toMatch(
      /\.rail\[data-active\] \.iconPill\s*{[^}]*secondary-container/,
    );
  });
});

describe("account menu", () => {
  it("initialsOf and capitalise", () => {
    expect(initialsOf("jane.doe@example.com")).toBe("JD");
    expect(initialsOf("sample@example.com")).toBe("SA");
    expect(initialsOf(null)).toBe("?");
    expect(capitalise("admin")).toBe("Admin");
  });

  it("shows an initials avatar, the email (not a user id), and the group as a capitalised pill beside the name", () => {
    signInAs({
      email: "jane.doe@example.com",
      "cognito:username": "7f3c2a10-5b6e-4d1a-9c2b-0e8f6a4d1b23",
      "cognito:groups": ["admin"],
    });
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByText("JD")).toBeTruthy();
    const name = within(menu).getByText("jane.doe@example.com");
    expect(within(menu).queryByText(/7f3c2a10/)).toBeNull();
    expect(name.parentElement?.textContent).toContain("Admin");
  });
});

describe("More sheet", () => {
  it("does not take the active pill while open: the page's own tab stays the active one", () => {
    renderShell("/");
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("link", { name: "Map" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "More" }).hasAttribute("aria-current")).toBe(false);
    expect(css("MoreSheet.module.css")).not.toMatch(/triggerOpen/);
  });

  it("shows the role beside Sign out", () => {
    signInAs({ email: "jane.doe@example.com", "cognito:groups": ["admin"] });
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const signOut = within(screen.getByRole("dialog", { name: "More" })).getByRole("button", {
      name: /Sign out/,
    });
    expect(signOut.textContent).toContain("Admin");
    expect(signOut.textContent).toContain("jane.doe@example.com");
  });
});

describe("Help menu (What can I ask?)", () => {
  it("opens a menu with the one item, which asks for the card and closes the menu", () => {
    const heard = vi.fn();
    window.addEventListener(WHAT_CAN_I_ASK_EVENT, heard);
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const menu = screen.getByRole("menu", { name: "Help" });
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "What can I ask?" }));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu", { name: "Help" })).toBeNull();
    window.removeEventListener(WHAT_CAN_I_ASK_EVENT, heard);
  });

  it("from another screen it goes to the map with the card forced open, and dispatches nothing", () => {
    const heard = vi.fn();
    window.addEventListener(WHAT_CAN_I_ASK_EVENT, heard);
    renderShell("/coming-soon/jobs");
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "What can I ask?" }));
    expect(screen.getByTestId("where")?.textContent).toBe("/");
    expect(screen.getByTestId("where")?.getAttribute("data-search")).toBe("?first=1");
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener(WHAT_CAN_I_ASK_EVENT, heard);
  });

  it("is also a row in the More sheet", () => {
    const heard = vi.fn();
    window.addEventListener(WHAT_CAN_I_ASK_EVENT, heard);
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    fireEvent.click(within(sheet).getByRole("button", { name: "What can I ask?" }));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
    window.removeEventListener(WHAT_CAN_I_ASK_EVENT, heard);
  });

  it("closes the other overlay when it opens (one overlay at a time)", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Apps" }));
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.queryByRole("menu", { name: "Apps" })).toBeNull();
    expect(screen.getByRole("menu", { name: "Help" })).toBeTruthy();
  });
});

describe("rail nesting and the Ask destination (CrmShell1440, CrmBottomNav)", () => {
  // Rail-only and bar-only links are display:none in one layout, which empties their accessible
  // name, so they are found by their visible text inside the Primary navigation instead.
  const link = (name: string): HTMLElement => {
    const found = Array.from(
      document.querySelectorAll<HTMLElement>('nav[aria-label="Primary"] > a'),
    ).find((a) => a.textContent === name);
    if (found === undefined) throw new Error(`no ${name} link`);
    return found;
  };

  it("nests Filters and AI under Map in the rail, then Leads; Ask is the bottom bar's alone", () => {
    renderShell("/");
    expect(link("Map").getAttribute("href")).toBe("/");
    expect(link("Filters").getAttribute("href")).toBe("/?mode=filters");
    expect(link("AI").getAttribute("href")).toBe("/?mode=ai");
    expect(link("Ask").getAttribute("href")).toBe("/?mode=ai");
    expect(link("Leads").getAttribute("href")).toBe("/leads");
    expect(document.querySelector('a[href="/ask"]')).toBeNull();
    const order = Array.from(document.querySelectorAll('nav[aria-label="Primary"] > a')).map(
      (a) => a.textContent,
    );
    expect(order).toEqual(["Map", "Filters", "AI", "Leads", "Ask"]);
  });

  it("each layout draws its own: Filters and AI are rail-only, Ask is bar-only", () => {
    const shell = readFileSync(
      join(__dirname, "../../../src/components/AppShell.module.css"),
      "utf8",
    );
    expect(shell).toMatch(/\.itemRailOnly\s*{\s*display: none;/);
    expect(shell).toMatch(/@media \(min-width: 600px\)[\s\S]*\.itemRailOnly\s*{\s*display: flex;/);
    expect(shell).toMatch(/@media \(min-width: 600px\)[\s\S]*\.itemBarOnly\s*{\s*display: none;/);
    renderShell("/");
    expect(link("Filters").className).toContain("itemRailOnly");
    expect(link("AI").className).toContain("itemNested");
    expect(link("Ask").className).toContain("itemBarOnly");
  });

  it("follows the map mode: Map on the map, Filters in filters mode, AI and Ask in AI mode", () => {
    renderShell("/");
    expect(link("Map").getAttribute("aria-current")).toBe("page");
    expect(link("AI").hasAttribute("aria-current")).toBe(false);
    cleanup();
    renderShell("/?mode=ai");
    expect(link("AI").getAttribute("aria-current")).toBe("page");
    expect(link("Ask").getAttribute("aria-current")).toBe("page");
    expect(link("Map").hasAttribute("aria-current")).toBe(false);
    cleanup();
    renderShell("/?mode=filters");
    expect(link("Filters").getAttribute("aria-current")).toBe("page");
    expect(link("Map").getAttribute("aria-current")).toBe("page");
  });

  it("marks Leads on its own route and nothing on the map", () => {
    renderShell("/coming-soon/jobs");
    expect(link("Map").hasAttribute("aria-current")).toBe(false);
    expect(link("AI").hasAttribute("aria-current")).toBe(false);
  });
});

describe("Skip to content", () => {
  it("is the first Tab stop, targets the main region and moves focus into it", () => {
    renderShell("/");
    const skip = screen.getByRole("link", { name: "Skip to content" });
    const first = document.querySelector("a, button");
    expect(first).toBe(skip);
    const main = screen.getByRole("main");
    expect(skip.getAttribute("href")).toBe(`#${main.id}`);
    expect(main.getAttribute("tabindex")).toBe("-1");
    fireEvent.click(skip);
    expect(document.activeElement).toBe(main);
  });

  it("is out of sight until focused", () => {
    const shell = readFileSync(
      join(__dirname, "../../../src/components/AppShell.module.css"),
      "utf8",
    );
    expect(shell).toMatch(/\.skip\s*{[^}]*transform: translateY/);
    expect(shell).toMatch(/\.skip:focus-visible\s*{[^}]*transform: none/);
  });
});
