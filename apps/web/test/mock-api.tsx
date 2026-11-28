import type { AppRouter } from "@crm/api/router";
import type { Lead, LeadWithHistory } from "@crm/leads-db/schema";
import type { LeadCandidate, SearchResult } from "@crm/shared";
import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { App } from "../src/App.tsx";
import { createApiClient } from "../src/lib/trpc.ts";
import type { SearchState } from "../src/state.tsx";

export const CID = "bafkreiaw4jf6xzwtgpcfadnu7vbwpwpshbv7qz2hflapksf5m4rzl4dsby";
export const FTL = { lat: 26.1224, lon: -80.1373 };

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type Handlers = Record<string, (input: any) => unknown>;
export type Call = { path: string; input: any };

/** A tRPC link answering from handlers by procedure path (no network, no server). */
export function mockLink(handlers: Handlers, calls: Call[]): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((obs) => {
        calls.push({ path: op.path, input: op.input });
        Promise.resolve()
          .then(() => {
            const h = handlers[op.path];
            if (!h) throw new ApiError("NOT_FOUND", `no mock for ${op.path}`);
            return h(op.input);
          })
          .then((data) => {
            obs.next({ result: { type: "data", data } } as never);
            obs.complete();
          })
          .catch((e: Error) => {
            const code = e instanceof ApiError ? e.code : "INTERNAL_SERVER_ERROR";
            obs.error(
              new TRPCClientError(e.message, {
                result: {
                  error: { message: e.message, code: -32000, data: { code, httpStatus: 400, path: op.path } },
                },
              } as never),
            );
          });
        return () => {};
      });
}

export const candidate = (over: Partial<LeadCandidate> = {}): LeadCandidate => ({
  propertyId: "504202150320",
  propertyCid: "bafyproperty1",
  address: "1515 NE 2 ST",
  city: "FORT LAUDERDALE",
  lat: 26.1236,
  lon: -80.1268,
  roofAgeYears: 85,
  roofAgeBasis: "year_built",
  openRoofPermits: [],
  score: 120,
  reasons: ["Roof 85 years old"],
  ...over,
});

export const permitOf = (
  id: string,
  years: number,
  over: Partial<LeadCandidate["openRoofPermits"][number]> = {},
) => ({
  permitId: id,
  openDays: Math.round(years * 365.25),
  status: "open" as const,
  contractorName: "ACME ROOFING LLC",
  contractorLicenseStatus: "C",
  bbbGrade: null,
  ...over,
});

export const searchResult = (cs: LeadCandidate[], over: Partial<SearchResult> = {}): SearchResult => ({
  candidates: cs,
  outsideCoverage: false,
  permitGaps: [],
  capped: [],
  totals: {},
  rowLimit: 2000,
  manifestCid: CID,
  ...over,
});

export const snapshot = (over: Record<string, unknown> = {}) => ({
  manifestCid: CID,
  viewsVersion: "roofing-views.v1",
  counts: { v_property: 766044 },
  oracleHealthy: true,
  manifestMismatch: false,
  servedManifestCid: CID,
  asOf: "2026-11-27",
  runId: "20261127T223244Z-incremental",
  ...over,
});

export const lead = (over: Partial<Lead> = {}): Lead => ({
  id: "L1",
  propertyId: "504202150320",
  permitId: "ftl:R-1",
  status: "new",
  priority: "high",
  assignee: null,
  sourceManifestCid: CID,
  signals: {
    roofAgeYears: 85,
    roofAgeBasis: "year_built",
    maxOpenDays: 2958,
    bbbGrade: null,
    ownerLocationClass: "in_county",
    permitStatuses: ["open"],
    lat: 26.1236,
    lon: -80.1268,
    address: "1515 NE 2 ST",
    city: "FORT LAUDERDALE",
  },
  stale: false,
  staleReason: null,
  createdAt: "2026-11-27T10:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
  ...over,
});

export const withHistory = (l: Lead, notes: LeadWithHistory["notes"] = []): LeadWithHistory => ({
  ...l,
  notes,
  events: [{ at: l.createdAt, type: "created" }],
});

export const baseHandlers = (over: Handlers = {}): Handlers => ({
  "meta.snapshot": () => snapshot(),
  "map.search": () => searchResult([candidate()]),
  "leads.list": () => [],
  ...over,
});

/** Renders the whole app on a mock API; returns the recorded calls. */
export function renderApp(
  handlers: Handlers,
  opts: { initialSearch?: Partial<SearchState>; hash?: string } = {},
) {
  window.location.hash = opts.hash ?? "#/map";
  const calls: Call[] = [];
  const client = createApiClient([mockLink(baseHandlers(handlers), calls)]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <App client={client} queryClient={queryClient} initialSearch={opts.initialSearch} debounceMs={0} />,
  );
  return { ...view, calls, queryClient };
}

export const callsTo = (calls: Call[], path: string) => calls.filter((c) => c.path === path);
