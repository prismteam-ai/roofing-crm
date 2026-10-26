// B-07 TC-017: an unknown lead id shows a "Lead not found" page with a way back to the list, not
// the generic load-error banner; any other failure still shows the banner with Retry.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useLead = vi.fn();
vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useLead: (...args: unknown[]) => useLead(...args),
  useUpdateLeadStatus: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
  useAddLeadNote: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
  useAssignLead: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));

import { Component as LeadDetail } from "../../src/routes/Leads/LeadDetail";
import { isNotFoundError, retryUnlessNotFound } from "../../src/routes/Leads/leadErrors";

afterEach(() => {
  cleanup();
  useLead.mockReset();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/leads/:leadKey" element={<LeadDetail />} />
        <Route path="/leads" element={<p>the leads list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LeadDetail for an unknown lead", () => {
  it("shows 'Lead not found' with a link back to /leads", () => {
    useLead.mockReturnValue({
      status: "error",
      error: { data: { code: "NOT_FOUND" }, message: "No lead exists" },
      refetch: vi.fn(),
    });
    renderAt("/leads/does-not-exist");
    expect(screen.getByRole("heading", { name: /lead not found/i })).toBeTruthy();
    const back = screen.getByRole("link", { name: /back to leads/i });
    expect(back.getAttribute("href")).toBe("/leads");
    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
    fireEvent.click(back);
    expect(screen.getByText("the leads list")).toBeTruthy();
  });

  it("still shows the load-error banner with Retry for any other failure", () => {
    const refetch = vi.fn();
    useLead.mockReturnValue({
      status: "error",
      error: { data: { code: "INTERNAL_SERVER_ERROR" }, message: "boom" },
      refetch,
    });
    renderAt("/leads/48453%3Atcad%3A1");
    expect(screen.getByText(/this lead couldn.t load/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /lead not found/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("leadErrors", () => {
  it("recognises a tRPC NOT_FOUND and nothing else", () => {
    expect(isNotFoundError({ data: { code: "NOT_FOUND" } })).toBe(true);
    expect(isNotFoundError({ data: { code: "CONFLICT" } })).toBe(false);
    expect(isNotFoundError(new Error("x"))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });

  it("never retries a NOT_FOUND, and retries any other failure once", () => {
    const notFound = { data: { code: "NOT_FOUND" } };
    expect(retryUnlessNotFound(0, notFound)).toBe(false);
    expect(retryUnlessNotFound(0, new Error("network"))).toBe(true);
    expect(retryUnlessNotFound(1, new Error("network"))).toBe(false);
  });
});
