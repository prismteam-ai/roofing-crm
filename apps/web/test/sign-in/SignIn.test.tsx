// Sign-in screen against the CRM boards CrmSignIn390/768/1440 (design/docs/CRM-HANDOFF.md
// "Sign-in and session"): top app bar, card title "Sign in to Roofing CRM" with its purpose line,
// an Email field, a Show password toggle, a filled Sign in button and the plain "No account?"
// line (no link). The error and lockout text stays the classified message tests/e2e/B-01.spec.ts
// asserts exactly. auth/signIn and auth/session are mocked at the module boundary.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInMock = vi.fn();
const saveSessionMock = vi.fn();

vi.mock("../../src/auth/signIn.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/auth/signIn.js")>(
    "../../src/auth/signIn.js",
  );
  return { ...actual, signIn: (...args: unknown[]) => signInMock(...args) };
});
vi.mock("../../src/auth/session.js", () => ({
  saveSession: (...args: unknown[]) => saveSessionMock(...args),
}));

const css = (): string =>
  readFileSync(join(__dirname, "../../src/routes/SignIn/SignIn.module.css"), "utf8");

async function renderSignIn(): Promise<void> {
  const { Component } = await import("../../src/routes/SignIn/SignIn.js");
  render(
    <MemoryRouter initialEntries={["/sign-in"]}>
      <Routes>
        <Route path="/sign-in" element={<Component />} />
        <Route path="/" element={<p>map</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  signInMock.mockReset();
  saveSessionMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Sign-in screen (CrmSignIn390/768/1440)", () => {
  it("has the top app bar with the product title", async () => {
    await renderSignIn();
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("heading", { level: 1 }).textContent).toBe("Roofing CRM");
  });

  it('titles the card "Sign in to Roofing CRM" with the purpose line', async () => {
    await renderSignIn();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Sign in to Roofing CRM");
    expect(
      screen.getByText(
        "Find aged roofs and long-open permits in Travis County, and track the leads you pursue.",
      ),
    ).toBeTruthy();
  });

  it("labels the first field Email (never Username), an email input that autofills the username", async () => {
    await renderSignIn();
    const email = screen.getByLabelText("Email");
    expect(email.tagName).toBe("INPUT");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("username");
    expect(screen.queryByLabelText("Username")).toBeNull();
    expect(screen.queryByText("Username")).toBeNull();
  });

  it("the Password label still names exactly one input", async () => {
    await renderSignIn();
    const password = screen.getByLabelText("Password");
    expect(password.tagName).toBe("INPUT");
    expect(password.getAttribute("type")).toBe("password");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
  });

  it("Show password is a toggle button (aria-pressed) that reveals and hides the value without submitting", async () => {
    await renderSignIn();
    const password = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(password.getAttribute("type")).toBe("text");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(password.getAttribute("type")).toBe("password");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("toggling never writes the password to the console or into the toggle's name", async () => {
    const spies = (["log", "info", "debug", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    await renderSignIn();
    const secret = "s3cret-value-xyz";
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: secret } });
    const toggle = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
    }
    expect(toggle.outerHTML).not.toContain(secret);
  });

  it('says "No account? Access is shared privately with reviewers." as plain text, with no sign-up link', async () => {
    await renderSignIn();
    const line = screen.getByText("No account? Access is shared privately with reviewers.");
    expect(line.tagName).toBe("P");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("keeps the filled Sign in button, and submits the email and password", async () => {
    signInMock.mockResolvedValue({
      idToken: "i",
      accessToken: "a",
      refreshToken: "r",
      expiresAt: 1,
    });
    await renderSignIn();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "sample.rep@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "samplepass" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(saveSessionMock).toHaveBeenCalledTimes(1));
    expect(signInMock).toHaveBeenCalledWith("sample.rep@example.com", "samplepass");
  });

  it("a wrong password shows the classified message in the data-sign-in-error alert, text only", async () => {
    signInMock.mockRejectedValue(
      Object.assign(new Error("Incorrect username or password."), {
        code: "NotAuthorizedException",
      }),
    );
    await renderSignIn();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const alert = await screen.findByRole("alert");
    expect(alert.hasAttribute("data-sign-in-error")).toBe(true);
    expect(alert.textContent).toBe("Wrong email or password. Check the test login you were sent.");
  });

  it("the lockout keeps its typed message", async () => {
    signInMock.mockRejectedValue(new Error("Too many attempts — try again in 5 minutes."));
    await renderSignIn();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Too many attempts — try again in 5 minutes.");
  });

  it("styles use Atlas tokens: a 1px outline-variant bar edge, extra-large card corners, filled primary button", () => {
    const source = css();
    expect(source).toMatch(/--md-sys-color-outline-variant/);
    expect(source).toMatch(/--md-sys-shape-corner-extra-large/);
    expect(source).toMatch(/background: var\(--md-sys-color-primary\)/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("Sign-in loading (CrmSignInLoading390)", () => {
  it("shows a progress icon in the disabled button and announces Signing in… politely", async () => {
    signInMock.mockReturnValue(new Promise(() => undefined));
    await renderSignIn();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const button = await screen.findByRole("button", { name: "Signing in…" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.querySelector('[data-icon="progress_activity"]')).not.toBeNull();
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("Signing in…");
  });

  it("keeps the live region empty when nothing is happening", async () => {
    await renderSignIn();
    expect(document.querySelector("[role=status]")?.textContent).toBe("");
  });

  it("keeps the card at the top of the page from 600 px (no vertical centring)", () => {
    const sheet = css();
    expect(sheet).not.toMatch(/\.main\s*{\s*place-items: center;/);
  });
});
