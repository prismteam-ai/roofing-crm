// After a reload with ?sel= for a property that is already a lead, the drawer must not flash an
// enabled "Create lead" before it learns the lead exists: it shows a neutral disabled state until
// the lead-presence lookup for that property has resolved. Real QueryClient and the real hooks;
// only the tRPC option factories are faked, and the presence answer is controlled by the test.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";

const presenceFn = vi.fn();
const createFn = vi.fn();
const fakeTrpc = {
  leads: {
    presence: {
      queryOptions: (input: unknown) => ({
        queryKey: ["leads", "presence", input],
        queryFn: () => presenceFn(input),
      }),
      queryKey: () => ["leads", "presence"],
    },
    list: {
      queryKey: () => ["leads", "list"],
      queryOptions: () => ({ queryKey: ["x"], queryFn: () => ({}) }),
    },
    create: { mutationOptions: () => ({ mutationFn: (v: unknown) => createFn(v) }) },
    addNote: { mutationOptions: () => ({ mutationFn: () => ({}) }) },
  },
};
vi.mock("@crm/api-client/react", () => ({ useTRPC: () => fakeTrpc, useTRPCClient: () => ({}) }));
vi.mock("../../src/routes/Map/Candidates/candidatesApi", () => ({
  useUndoCreateLead: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { LeadCreateAction } from "../../src/routes/Leads/LeadCreateAction";

const property = {
  propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
  requestIdentifier: "0201885122",
  latitude: 30.27,
  longitude: -97.74,
  coordinateSource: "gis_centroid",
  propertyType: "Residential",
  propertyUsageType: null,
  roofAgeYears: 23,
  roofAgeBasis: "permit",
  roofAgeConfidence: "high",
  isLongTenure: null,
  ownerKind: null,
  ownerAreaClass: null,
  ownerIsOutOfArea: null,
  sourceManifestCid: "bafkreimanifest",
  missingReasons: [],
  capturedAt: "2026-10-20T00:00:00Z",
  cid: "bafkreitablecid",
  runId: "run-3",
} as unknown as Provenanced<CrmProperty>;

const permit = { permitNumber: "2024-1", permitCid: "p1" } as unknown as Provenanced<CrmPermit>;

let queryClient: QueryClient;
function mount(permitRow = false) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LeadCreateAction property={property} {...(permitRow ? { permit } : {})} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** A presence lookup that answers when the test says so. */
function lateAnswer(): { resolve: (rows: unknown[]) => void; reject: () => void } {
  let resolve!: (rows: unknown[]) => void;
  let reject!: () => void;
  presenceFn.mockReturnValue(
    new Promise((res, rej) => {
      resolve = res;
      reject = () => rej(new Error("down"));
    }),
  );
  return { resolve, reject };
}

const createButton = () => screen.queryByRole("button", { name: "Create lead" });

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LeadCreateAction waits for the lead-presence lookup", () => {
  it("asks about this property only, in the Travis county", () => {
    lateAnswer();
    mount();
    expect(presenceFn).toHaveBeenCalledWith({ requestIdentifiers: ["0201885122"], fips: "48453" });
  });

  it("shows a neutral disabled state, never an enabled Create lead, until the lookup resolves", async () => {
    const answer = lateAnswer();
    mount();
    expect(createButton()).toBeNull();
    const waiting = screen.getByRole("button", { name: "Checking Leads…" });
    expect(waiting.hasAttribute("disabled")).toBe(true);
    expect(waiting.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      answer.resolve([
        {
          requestIdentifier: "0201885122",
          leadKey: "48453:tcad:0201885122",
          leadId: "L-1",
          status: "contacted",
        },
      ]);
    });
    // The lead exists: Already a lead with its status, and Open lead. Create lead never appeared.
    await screen.findByText("Already a lead · Contacted");
    expect(createButton()).toBeNull();
    expect(screen.getByRole("link", { name: "Open lead" }).getAttribute("href")).toBe(
      "/leads/48453%3Atcad%3A0201885122",
    );
  });

  it("offers Create lead once the lookup says there is none", async () => {
    const answer = lateAnswer();
    mount();
    expect(createButton()).toBeNull();
    await act(async () => {
      answer.resolve([]);
    });
    const button = await screen.findByRole("button", { name: "Create lead" });
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("falls back to Create lead when the lookup fails (a duplicate is still refused on create)", async () => {
    const answer = lateAnswer();
    mount();
    expect(createButton()).toBeNull();
    await act(async () => {
      answer.reject();
    });
    const button = await screen.findByRole("button", { name: "Create lead" });
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("a permit row's button waits too, and goes away when the lead exists", async () => {
    const answer = lateAnswer();
    mount(true);
    expect(screen.queryByRole("button", { name: /^Create lead from permit/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Checking Leads…" })).toBeTruthy();
    await act(async () => {
      answer.resolve([
        {
          requestIdentifier: "0201885122",
          leadKey: "48453:tcad:0201885122",
          leadId: "L-1",
          status: "new",
        },
      ]);
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Checking Leads…" })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: /^Create lead from permit/ })).toBeNull();
  });
});
