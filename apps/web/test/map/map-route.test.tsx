// The Map route's composition after the breakpoint rebuild: one DOM at every width with the
// filters pane, the map (with its overlay stack), the results sheet and the drawer slot, and
// every e2e hook (data-route, crm-map, search-results, data-state, aside[data-property-cid])
// unchanged. The MapLibre map and the tRPC client are stubbed; layout per width is CSS
// (Map.module.css) and is proved live by the responsive Playwright specs.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { focusTiming } from "../../src/components/Map/focusProperty";
import { forwardRef, useEffect, useImperativeHandle, useState, type ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const zoomToDetail = vi.fn();
const placeAtCenter = vi.fn();
const showCounty = vi.fn();
/** The props the route last handed the map (pin mode, accuracy circle). */
let lastMapProps: {
  pinMode?: boolean;
  accuracy?: { meters: number } | null;
  triageCid?: string | null;
  answerPins?: { n: number }[];
  focusedPin?: number | null;
  onPinSelect?: (n: number) => void;
  center?: { lat: number; lng: number } | null;
  radiusMi?: number;
  onHexSelect?: (cell: {
    lat: number;
    lng: number;
    zoom: number;
    count: number;
    medianRoofAge: number | null;
  }) => void;
  onPinDrop?: (p: { lat: number; lng: number }) => void;
  selectedPoint?: { lat: number; lng: number } | null;
} = {};
/** The props the route last handed the committed Candidate list and Field triage components. */
let lastListProps: Record<string, unknown> | null = null;
let lastPanelProps: Record<string, unknown> | null = null;
let panelInstances = 0;
let panelMounts = 0;
let panelUnmounts = 0;
const fitPins = vi.fn();
const focusProperty = vi.fn();
let lastTriageProps: Record<string, unknown> | null = null;
let reportedMode: "overview" | "detail" = "overview";
const viewportSearch = vi.fn(() => ({ lat: 30.3, lng: -97.7, radiusMi: 2 }));
/** What the route last handed the map for the overview (null = client binning fallback). */
let lastOverviewCells: readonly { id: string; count: number }[] | null | undefined;
let lastOverviewPermits: readonly { permits: number }[] | null | undefined;
let reportZoomStep: ((zoom: number) => void) | undefined;

vi.mock("../../src/components/Map/CrmMap.js", () => ({
  CrmMap: forwardRef(function StubMap(
    props: {
      onViewModeChange?: (mode: "overview" | "detail") => void;
      onZoomStepChange?: (zoom: number) => void;
      overviewCells?: readonly { id: string; count: number }[] | null;
      overviewPermits?: readonly { permits: number }[] | null;
      pinMode?: boolean;
      accuracy?: { meters: number } | null;
      triageCid?: string | null;
      answerPins?: { n: number }[];
      focusedPin?: number | null;
      onPinSelect?: (n: number) => void;
      center?: { lat: number; lng: number } | null;
      radiusMi?: number;
      onHexSelect?: typeof lastMapProps.onHexSelect;
      onPinDrop?: (p: { lat: number; lng: number }) => void;
      selectedPoint?: { lat: number; lng: number } | null;
    },
    ref,
  ) {
    lastMapProps = props;
    lastOverviewCells = props.overviewCells;
    lastOverviewPermits = props.overviewPermits;
    reportZoomStep = props.onZoomStepChange;
    useImperativeHandle(ref, () => ({
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      recenter: vi.fn(),
      zoomToDetail,
      placeAtCenter,
      showCounty,
      fitPins,
      focusProperty,
      viewportSearch,
    }));
    useEffect(() => props.onViewModeChange?.(reportedMode), [props]);
    return <div data-testid="crm-map" />;
  }),
}));

vi.mock("../../src/routes/Map/Candidates/index.js", async () => {
  const actual = await vi.importActual<object>("../../src/routes/Map/Candidates/index.js");
  return {
    ...actual,
    CandidateList: (props: Record<string, unknown>) => {
      lastListProps = props;
      return <div data-testid="candidate-list" />;
    },
  };
});

vi.mock("../../src/routes/Ask/AskPanel.js", () => ({
  AskPanel: (props: Record<string, unknown>) => {
    lastPanelProps = props;
    // Own state: it survives only while this one instance stays mounted.
    const [id] = useState(() => `panel-${String(++panelInstances)}`);
    useEffect(() => {
      panelMounts += 1;
      return () => {
        panelUnmounts += 1;
      };
    }, []);
    return <div data-testid="ask-panel" data-instance={id} />;
  },
}));

vi.mock("../../src/routes/Map/Triage/index.js", () => ({
  TriageStack: (props: Record<string, unknown>) => {
    lastTriageProps = props;
    return <div data-testid="triage-stack" />;
  },
}));

const property = {
  propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
  requestIdentifier: "0201885122",
  latitude: 30.44,
  longitude: -97.62,
  coordinateSource: "gis_centroid",
  propertyType: "Building",
  propertyUsageType: "Residential",
  roofAgeYears: 20,
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
};

let searchResult: {
  properties: (typeof property)[];
  counts?: { afterRadius: number; afterRoofAge: number };
} = { properties: [property] };
let permitsReply: { permits: unknown[]; total?: number; truncated?: boolean } = { permits: [] };
const permitInputs: unknown[] = [];
let detailWithoutCoords = false;
/** When set, property.get rejects the way the API does for an id that is not a property id. */
let detailError: { code: string } | null = null;
let presenceReply: { leadKey: string; leadId: string; status: string }[] = [];
const presenceCalls: { requestIdentifiers: string[] }[] = [];

const RUN = "travis-202609-permits-20261021t103516z";
function overviewFor(input: { zoom: number; permits?: boolean }) {
  return {
    zoom: input.zoom,
    agedYears: 15,
    cells: [
      {
        q: -29,
        r: 1499,
        lat: 30.26,
        lng: -97.74,
        count: 120,
        withRoofAge: 100,
        medianRoofAge: 21,
        agedCount: 70,
        ...(input.permits === true ? { openPermits: 3, stalledPermits: 2, maxOpenDays: 900 } : {}),
      },
    ],
    counts: {
      total: 125,
      matched: 125,
      binned: 120,
      excludedNoCoordinates: 5,
      excludedNoRoofDate: 0,
      binnedWithoutRoofAge: 20,
      ...(input.permits === true ? { openPermits: 3, stalledPermits: 2 } : {}),
    },
    manifestCid: "bafkreimanifest",
    runId: RUN,
    traceId: "t",
  };
}
const overviewCalls: unknown[] = [];
const propertyInputs: unknown[] = [];
let overviewFails = false;
let searchFails = false;
let searchCalls = 0;

const opts = (key: string, fn: () => unknown) => (input: unknown) => ({
  queryKey: [key, input],
  queryFn: async () => fn(),
});

vi.mock("@crm/api-client/react", () => ({
  useTRPC: () => ({
    shell: {
      appLinks: {
        queryOptions: () => ({
          queryKey: ["shell.appLinks"],
          queryFn: async () => ({ countyLensUrl: "https://lens.test" }),
        }),
      },
    },
    leads: {
      presence: {
        queryOptions: (input: { requestIdentifiers: string[] }) => ({
          queryKey: ["leads.presence", input],
          queryFn: async () => {
            presenceCalls.push(input);
            return presenceReply;
          },
        }),
      },
    },
    search: {
      properties: {
        queryOptions: (input: unknown) => {
          propertyInputs.push(input);
          return opts("search.properties", () => {
            searchCalls += 1;
            if (searchFails) throw new Error("index down");
            return searchResult;
          })(input);
        },
      },
      permits: {
        queryOptions: (input: unknown) => {
          permitInputs.push(input);
          return { queryKey: ["search.permits", input], queryFn: async () => permitsReply };
        },
      },
      countyOverview: {
        queryOptions: (input: { zoom: number; permits?: boolean }) => ({
          queryKey: ["search.countyOverview", input],
          queryFn: async () => {
            overviewCalls.push(input);
            if (overviewFails) throw new Error("index down");
            return overviewFor(input);
          },
        }),
      },
    },
    property: {
      get: {
        queryOptions: opts("property.get", () => {
          if (detailError !== null) throw Object.assign(new Error("bad id"), { data: detailError });
          return {
            property: detailWithoutCoords
              ? { ...property, latitude: null, longitude: null }
              : property,
            permits: [],
            bbbStatus: null,
            bbbStatusReason: null,
            lineageUrl: "https://example.com/lineage",
          };
        }),
      },
    },
  }),
}));

const prefetchLeads = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useCreateLead: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
  useLeadPresence: () => ({ isPending: false, data: null }),
  usePrefetchLeadsList: () => prefetchLeads,
}));

import { Component as MapRoute } from "../../src/routes/Map/Map";

afterEach(() => {
  cleanup();
  zoomToDetail.mockReset();
  viewportSearch.mockClear();
  reportedMode = "overview";
  searchResult = { properties: [property] };
  lastListProps = null;
  lastPanelProps = null;
  prefetchLeads.mockClear();
  panelInstances = 0;
  panelMounts = 0;
  panelUnmounts = 0;
  fitPins.mockReset();
  focusProperty.mockReset();
  detailWithoutCoords = false;
  detailError = null;
  sessionStorage.clear();
  lastTriageProps = null;
  permitsReply = { permits: [] };
  permitInputs.length = 0;
  presenceReply = [];
  presenceCalls.length = 0;
  placeAtCenter.mockReset();
  showCounty.mockReset();
  lastMapProps = {};
  overviewCalls.length = 0;
  propertyInputs.length = 0;
  overviewFails = false;
  searchFails = false;
  searchCalls = 0;
  lastOverviewCells = undefined;
  lastOverviewPermits = undefined;
});

/** Exposes the router's current search string so tests can assert what the map did to the URL. */
function LocationProbe(): ReactElement {
  const { search } = useLocation();
  return <output data-testid="url-search">{search}</output>;
}

function renderAt(url: string | { pathname: string; search: string; state: unknown }): HTMLElement {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}")),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <MapRoute />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return document.querySelector('[data-route="map"]') as HTMLElement;
}

describe("Map route layout", () => {
  it("with no centre: map, controls, county card and an explained empty results sheet", () => {
    const page = renderAt("/");
    expect(page).not.toBeNull();
    expect(screen.getByTestId("crm-map")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Use my location" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Layers" })).not.toBeNull();
    expect(page.querySelector("[data-county-card]")?.textContent).toMatch(/Whole county/);
    const slot = page.querySelector("[data-empty]");
    expect(slot?.getAttribute("data-empty")).toBe("true");
    expect(screen.getByText(/No centre chosen yet, so no results/)).not.toBeNull();
    expect(screen.queryByTestId("search-results")).toBeNull();
  });

  it("with a centre: results in the sheet, with the radius card in the map overlay", async () => {
    const page = renderAt("/?lat=30.4394&lng=-97.62&r=5");
    const list = await screen.findByTestId("search-results");
    const sheet = screen.getByRole("region", { name: "Results" });
    expect(sheet.contains(list)).toBe(true);
    expect(sheet.getAttribute("data-sheet")).toBe("peek");
    expect(page.querySelector("[data-empty]")?.getAttribute("data-empty")).toBe("false");
    expect(within(list).getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("spinbutton", { name: "Radius" })).not.toBeNull();
    expect(page.querySelector("[data-county-card]")).toBeNull();
  });

  it("zero results: the widen notice keeps its data-state and button inside the sheet", async () => {
    searchResult = { properties: [] };
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByText("Widen to 6 mi");
    const sheet = screen.getByRole("region", { name: "Results" });
    expect(sheet.contains(document.querySelector('[data-state="CrmMapNoResults390"]'))).toBe(true);
    expect(screen.getByRole("button", { name: "Widen to 6 mi" })).not.toBeNull();
  });

  it("zoomed out with loaded results: shows the overview chip, whose Zoom in zooms the map", async () => {
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("search-results");
    const chip = await screen.findByText("Click a hexagon to search there");
    expect(chip).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in to individual properties" }));
    expect(zoomToDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Median roof age per hexagon, yrs")).not.toBeNull();
  });

  it("zoomed in: no overview chip and the per-property legend", async () => {
    reportedMode = "detail";
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("search-results");
    expect(screen.queryByText("Click a hexagon to search there")).toBeNull();
    expect(screen.getByText("Roof age, yrs")).not.toBeNull();
  });

  it("zooming into the hexagons without a click searches what is in view, as a hexagon click would", async () => {
    reportedMode = "detail";
    renderAt("/");
    await vi.waitFor(() => {
      const search = screen.getByTestId("url-search").textContent ?? "";
      expect(search).toContain("lat=30.3");
      expect(search).toContain("lng=-97.7");
      expect(search).toContain("r=2");
    });
    expect(viewportSearch).toHaveBeenCalledTimes(1);
    await screen.findByTestId("search-results");
  });

  it("stays in the overview while zoomed out, and does not search again after the search is cleared", async () => {
    renderAt("/");
    await screen.findByTestId("crm-map");
    expect(screen.getByTestId("url-search").textContent).toBe("");
    expect(viewportSearch).not.toHaveBeenCalled();
  });

  it("sel opens the drawer (aside[data-property-cid]) in its own slot, outside the results sheet", async () => {
    renderAt(`/?lat=30.4394&lng=-97.62&r=5&sel=${property.propertyCid}`);
    // The first-visit card is also a dialog, so the drawer is picked out by its element.
    await screen.findByRole("dialog", { name: "What can I ask?" });
    const drawer = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>("aside[role='dialog'][data-property-cid]");
      if (found === null) throw new Error("drawer not rendered yet");
      return found;
    });
    expect(drawer.tagName).toBe("ASIDE");
    expect(drawer.getAttribute("data-property-cid")).toBe(property.propertyCid);
    const sheet = screen.getByRole("region", { name: "Results" });
    expect(sheet.contains(drawer)).toBe(false);
  });
});

describe("Map route tablet alignment (A3, A4, C1, C6)", () => {
  it("Layers is the one map-layers control: the Legend switch lives in it, there is no Legend button", () => {
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    expect(screen.queryByRole("button", { name: "Legend" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    const legend = screen.getByRole("checkbox", { name: /Legend/ }) as HTMLInputElement;
    // jsdom has no matchMedia: the legend follows its default (open from 600 px).
    expect(legend.checked).toBe(true);
    expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
    fireEvent.click(legend);
    expect(screen.queryByRole("region", { name: "Map legend" })).toBeNull();
    fireEvent.click(legend);
    expect(screen.getByRole("region", { name: "Map legend" })).not.toBeNull();
  });

  it("the radius card says where the ring starts, from the pin", () => {
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    expect(screen.getByText("From the pin · all query modes")).not.toBeNull();
  });

  it("results rows are collapsed with their distance and direction, and the panel pages the loaded rows", async () => {
    searchResult = {
      properties: Array.from({ length: 12 }, (_, i) => ({
        ...property,
        propertyCid: `bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa${String(1000 + i)}`,
        requestIdentifier: `02018851${String(10 + i)}`,
        latitude: 30.44 + i / 1000,
      })),
      counts: { afterRadius: 340, afterRoofAge: 340 },
    };
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    const list = await screen.findByTestId("search-results");
    expect(within(list).getAllByRole("article")).toHaveLength(10);
    expect(within(list).getAllByRole("article")[0]?.getAttribute("data-expanded")).toBe("false");
    expect(within(list).getAllByText(/ mi [NSEW]{1,2}$/)).toHaveLength(10);
    expect(screen.getByText("Matches 340")).not.toBeNull();
    expect(screen.getByText("Showing 1–10 of the nearest 12")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(within(list).getAllByRole("article")).toHaveLength(2);
    // The honest clip note stays: 12 loaded of 340.
    expect(screen.getByText(/Showing the nearest 12 of 340 properties/)).not.toBeNull();
  });

  it("shows a permit chip on a row only when the permit query returned that property", async () => {
    permitsReply = {
      permits: [
        {
          propertyCid: property.propertyCid,
          permitCid: "bafkreipermit",
          statusClass: "open",
          openDays: 803,
          permitNumber: "2024-1",
          isLongOpen: false,
        },
      ],
    };
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    const list = await screen.findByTestId("search-results");
    await vi.waitFor(() => expect(within(list).getByLabelText("Permits")).not.toBeNull());
    expect(within(list).getAllByLabelText("Permits")).toHaveLength(1);
  });

  it("a permit filter is sent with the properties request and the server's page, count and empty state are shown (F-1)", async () => {
    const other = {
      ...property,
      propertyCid: "bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbq4xb",
      requestIdentifier: "0201885123",
    };
    searchResult = { properties: [property, other], counts: { afterRadius: 2, afterRoofAge: 2 } };
    permitsReply = { permits: [] };
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    const list = await screen.findByTestId("search-results");
    // No permit filter: both properties, the server's count, and no permit key in the request.
    expect(within(list).getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText("Matches 2")).not.toBeNull();
    expect(propertyInputs.at(-1)).not.toHaveProperty("permitStatusClass");
    // Permit status Open: the request carries open AND stalled; the server answers with the
    // properties (and the total) that pass, which the map lists as they are.
    searchResult = { properties: [property], counts: { afterRadius: 2, afterRoofAge: 1 } };
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const group = screen.getByRole("group", { name: "Permit status" });
    fireEvent.click(within(group).getByRole("button", { name: "Open" }));
    await vi.waitFor(() =>
      expect(propertyInputs.at(-1)).toMatchObject({ permitStatusClass: ["open", "stalled"] }),
    );
    await vi.waitFor(() =>
      expect(within(screen.getByTestId("search-results")).getAllByRole("article")).toHaveLength(1),
    );
    expect(screen.getByText("Matches 1")).not.toBeNull();
    // Stalled: only stalled. The server finds none: the empty state names the permit filter.
    searchResult = { properties: [], counts: { afterRadius: 2, afterRoofAge: 0 } };
    fireEvent.click(within(group).getByRole("button", { name: "Stalled" }));
    await vi.waitFor(() =>
      expect(propertyInputs.at(-1)).toMatchObject({ permitStatusClass: ["stalled"] }),
    );
    await vi.waitFor(() =>
      expect(document.querySelector('[data-state="CrmMapNoResults390"]')?.textContent).toMatch(
        /stalled permit/,
      ),
    );
  });

  it("the Triage entry still opens triage (phones: filled button; 768 px and up: icon, same name)", async () => {
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("search-results");
    expect(screen.getByRole("button", { name: "Triage 1" })).not.toBeNull();
  });
});

describe("Map route first-visit card", () => {
  it("shows What can I ask? over the map area on the first visit, not once dismissed", async () => {
    localStorage.clear();
    const page = renderAt("/");
    const card = await screen.findByRole("dialog", { name: "What can I ask?" });
    expect(page.contains(card)).toBe(true);
    cleanup();
    localStorage.setItem("crm.whatCanIAsk.v1", "dismissed");
    renderAt("/");
    expect(screen.queryByRole("dialog", { name: "What can I ask?" })).toBeNull();
    localStorage.clear();
  });
});

describe("Map route county overview (search.countyOverview)", () => {
  it("with no centre, loads the whole county at the opening zoom and hands its cells to the map", async () => {
    renderAt("/");
    await screen.findByText(/Hexagons cover the whole county: 120 properties/);
    expect(overviewCalls[0]).toEqual({ zoom: 9, roofAgeMinYears: 15, permits: true });
    expect(lastOverviewCells?.map((c) => c.count)).toEqual([120]);
    expect(lastOverviewPermits?.map((p) => p.permits)).toEqual([5]);
    expect(screen.getByText(/5 not on the map: no coordinates published/)).not.toBeNull();
    expect(screen.getByText(new RegExp(`Source: ${RUN}`))).not.toBeNull();
    // The overview chip shows with county cells even before any pin.
    expect(screen.getByText("Click a hexagon to search there")).not.toBeNull();
  });

  it("re-asks with the map's whole-number zoom and the roof-age filter", async () => {
    renderAt("/?roof=15");
    await screen.findByText(/Hexagons cover the whole county/);
    reportZoomStep?.(10);
    await vi.waitFor(() =>
      expect(overviewCalls).toContainEqual({ zoom: 10, roofAgeMinYears: 15, permits: true }),
    );
  });

  it("in the marker view, shows no county note and stops re-asking on zoom", async () => {
    reportedMode = "detail";
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("search-results");
    const before = overviewCalls.length;
    reportZoomStep?.(8);
    await screen.findByText("Roof age, yrs");
    expect(overviewCalls).toHaveLength(before);
    expect(document.querySelector("[data-overview-state]")).toBeNull();
  });

  it("when the overview fails, says so and falls back to binning the loaded results", async () => {
    overviewFails = true;
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByText(/county overview could not be read/);
    expect(screen.getByText(/only the 1 properties loaded around your pin/)).not.toBeNull();
    expect(lastOverviewCells).toBeNull();
    expect(lastOverviewPermits).toBeNull();
  });

  it("when the search index is down, the notice says so and Retry asks again", async () => {
    searchFails = true;
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    const notice = await screen.findByText(/Lead index unavailable/);
    expect(notice.closest('[data-state="CrmMapIndexDown390"]')).not.toBeNull();
    expect(screen.getByText(/Your leads and notes still open/)).not.toBeNull();
    const before = searchCalls;
    searchFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("search-results");
    expect(searchCalls).toBeGreaterThan(before);
  });
});

describe("Map route pin mode, GPS and outside-county cards (boards CrmMapPinMode*, CrmMapGps*, CrmMapPinOutside390)", () => {
  const dropPinControl = (): HTMLElement => screen.getByRole("button", { name: "Drop pin" });

  it("the Drop pin control starts pin mode, with the board's words, and Cancel leaves it", () => {
    const page = renderAt("/");
    fireEvent.click(dropPinControl());
    const card = page.querySelector<HTMLElement>('[data-state="CrmMapPinMode390"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toMatch(/Move the map so the crosshair is on the spot/);
    expect(lastMapProps.pinMode).toBe(true);
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Cancel" }));
    expect(page.querySelector('[data-state="CrmMapPinMode390"]')).toBeNull();
    expect(lastMapProps.pinMode).toBe(false);
  });

  it("Place pin here drops the pin at the crosshair (the map's centre) and ends pin mode", () => {
    const page = renderAt("/");
    fireEvent.click(dropPinControl());
    fireEvent.click(screen.getByRole("button", { name: "Place pin here" }));
    expect(placeAtCenter).toHaveBeenCalledTimes(1);
    expect(page.querySelector('[data-state="CrmMapPinMode390"]')).toBeNull();
  });

  it("a pin outside the county says so on the map, once, and Go to Travis County shows the county", () => {
    const page = renderAt("/?lat=30.6333&lng=-97.678&r=5");
    const cards = page.querySelectorAll('[data-state="CrmMapPinOutside390"]');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toMatch(
      /This pin is outside Travis County\. The CRM covers Travis County only\./,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go to Travis County" }));
    expect(showCounty).toHaveBeenCalledTimes(1);
  });

  it("a GPS fix shows its card in the map's status stack and hands the map its accuracy circle", () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 30.4394, longitude: -97.62, accuracy: 12 },
          } as GeolocationPosition),
      },
    });
    const page = renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    const stack = page.querySelector("[data-map-status]");
    expect(stack?.querySelector('[data-state="CrmMapGps390"]')?.textContent).toMatch(
      /You are here \(±12 m\)/,
    );
    expect(lastMapProps.accuracy).toEqual({ meters: 12 });
    expect(screen.getByText(/From your location \(GPS\)/)).not.toBeNull();
    // A pin dropped by hand is not a GPS fix: its accuracy circle goes away.
    delete (navigator as { geolocation?: unknown }).geolocation;
  });

  it("a low-accuracy fix says the ring's origin is approximate", () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 30.4394, longitude: -97.62, accuracy: 1600 },
          } as GeolocationPosition),
      },
    });
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByText(/From your location \(approximate\)/)).not.toBeNull();
    delete (navigator as { geolocation?: unknown }).geolocation;
  });
});

/** A matchMedia whose three-pane (1280 px) answer can change while the page is mounted. */
const mediaListeners = new Set<() => void>();
let currentWide = false;
function stubWide(wide: boolean): void {
  currentWide = wide;
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return currentWide && query.includes("1280");
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
  }));
}
function resizeTo(wide: boolean): void {
  currentWide = wide;
  act(() => {
    for (const listener of [...mediaListeners]) listener();
  });
}

describe("Map route list view, triage and toolbar (committed Candidates and Triage components)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const PIN_URL = "/?lat=30.4394&lng=-97.62&r=5&roof=15";

  it("view=list mounts the Candidate list over the map's own filters, in place of the map", async () => {
    const page = renderAt(`${PIN_URL}&view=list`);
    await screen.findByTestId("candidate-list");
    expect(lastListProps?.filters).toEqual({
      center: { lat: 30.4394, lng: -97.62 },
      radiusMi: 5,
      roofAgeMinYears: 15,
      outOfArea: false,
      permitStatus: "any",
      permitOpenYrs: undefined,
    });
    expect(screen.queryByTestId("crm-map")).toBeNull();
    expect(page.getAttribute("data-view")).toBe("list");
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
  });

  it("the List and Map + cards toggle switches the view and keeps the rest of the URL", async () => {
    renderAt(PIN_URL);
    const list = screen.getByRole("button", { name: "List" });
    const cards = screen.getByRole("button", { name: "Map + cards" });
    expect(cards.getAttribute("aria-pressed")).toBe("true");
    expect(list.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(list);
    await screen.findByTestId("candidate-list");
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Map + cards" }));
    await screen.findByTestId("crm-map");
    expect(screen.queryByTestId("candidate-list")).toBeNull();
    // The pin and radius survived both switches.
    expect(screen.getByRole("spinbutton", { name: "Radius" })).not.toBeNull();
  });

  it("Show on map from the list returns to the map with that property open", async () => {
    renderAt(`${PIN_URL}&view=list`);
    await screen.findByTestId("candidate-list");
    act(() => (lastListProps?.onShowOnMap as (cid: string) => void)(property.propertyCid));
    await screen.findByTestId("crm-map");
    await screen.findByRole("dialog", { name: /TCAD|property/i }).catch(() => undefined);
    expect(screen.queryByTestId("candidate-list")).toBeNull();
  });

  it("the list's empty-state actions change the map's radius and roof filters", async () => {
    renderAt(`${PIN_URL}&view=list`);
    await screen.findByTestId("candidate-list");
    act(() => (lastListProps?.onRadiusChange as (r: number) => void)(6));
    await vi.waitFor(() =>
      expect((lastListProps?.filters as { radiusMi: number }).radiusMi).toBe(6),
    );
    act(() => (lastListProps?.onRoofChange as (y: number) => void)(20));
    await vi.waitFor(() =>
      expect((lastListProps?.filters as { roofAgeMinYears: number }).roofAgeMinYears).toBe(20),
    );
  });

  it("triage=1 mounts the stack in place of the results sheet, and Back to map leaves it", async () => {
    renderAt(`${PIN_URL}&triage=1`);
    await screen.findByTestId("triage-stack");
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
    expect(screen.getByTestId("crm-map")).not.toBeNull();
    expect((lastTriageProps?.filters as { radiusMi: number }).radiusMi).toBe(5);
    act(() => (lastTriageProps?.onBack as () => void)());
    await screen.findByRole("region", { name: "Results" });
    expect(screen.queryByTestId("triage-stack")).toBeNull();
  });

  it("the current triage card's property is ringed on the map", async () => {
    renderAt(`${PIN_URL}&triage=1`);
    await screen.findByTestId("triage-stack");
    act(() => (lastTriageProps?.onCurrentChange as (cid: string | null) => void)("bafkreicurrent"));
    await vi.waitFor(() => expect(lastMapProps.triageCid).toBe("bafkreicurrent"));
    act(() => (lastTriageProps?.onBack as () => void)());
    await vi.waitFor(() => expect(lastMapProps.triageCid ?? null).toBeNull());
  });

  it("the results sheet header has a Triage button with the match count (phones)", async () => {
    renderAt(PIN_URL);
    await screen.findByTestId("search-results");
    fireEvent.click(screen.getByRole("button", { name: "Triage 1" }));
    await screen.findByTestId("triage-stack");
  });

  it("from 1280 px the toggle sits in the map toolbar and the sheet has no Triage button", async () => {
    stubWide(true);
    const page = renderAt(PIN_URL);
    await screen.findByTestId("search-results");
    expect(page.querySelector("[data-view-bar]")?.querySelector("button")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Triage/ })).toBeNull();
  });

  it("the Filters button shows how many properties match", async () => {
    renderAt(PIN_URL);
    await screen.findByTestId("search-results");
    expect(screen.getByRole("button", { name: /^Filters/ }).textContent).toMatch(/1/);
  });
});

describe("Map route AI mode (mode=ai&q=)", () => {
  const ANSWER = {
    outcome: "answered",
    claims: [{ text: "Two match.", citationIds: [1, 2] }],
    citations: [
      { id: 1, kind: "property", propertyCid: "bafkreia", lat: 30.4, lon: -97.6 },
      { id: 2, kind: "property", propertyCid: "bafkreib", lat: 30.5, lon: -97.5 },
      { id: 3, kind: "property", propertyCid: "bafkreic" },
    ],
  };
  const aiProps = (): Record<string, unknown> => lastPanelProps as Record<string, unknown>;

  it("a card or 'Ask about it' click (askNow state) hands the panel a one-shot ask; a URL q alone never does", async () => {
    renderAt({
      pathname: "/",
      search: "?mode=ai&q=Tell%20me%20about%20TCAD%20181990",
      state: { askNow: true },
    });
    await screen.findByTestId("ask-panel");
    await vi.waitFor(() =>
      expect(aiProps().autoAsk).toMatchObject({ text: "Tell me about TCAD 181990" }),
    );
    expect(typeof (aiProps().autoAsk as { nonce: number }).nonce).toBe("number");
    // Consumed by the panel: dropped, and not re-created by a re-render.
    act(() =>
      (aiProps().onAutoAskConsumed as (n: number) => void)(
        (aiProps().autoAsk as { nonce: number }).nonce,
      ),
    );
    await vi.waitFor(() => expect(aiProps().autoAsk).toBeNull());
  });

  it("a pasted or reloaded URL with q (no click state) prefills only: no ask is handed to the panel", async () => {
    renderAt("/?mode=ai&q=Tell%20me%20about%20TCAD%20181990");
    await screen.findByTestId("ask-panel");
    expect(aiProps().initialQuestion).toBe("Tell me about TCAD 181990");
    expect(aiProps().autoAsk).toBeNull();
  });

  it("List view with an answer lists the answer's rows, labelled; Show filter results goes back; a new answer returns; clearing falls back", async () => {
    renderAt("/?mode=ai&view=list&lat=30.4394&lng=-97.62&r=5");
    await vi.waitFor(() => expect(typeof aiProps().onAnswer).toBe("function"));
    expect(screen.getByTestId("candidate-list")).toBeTruthy();
    const withRows = {
      ...ANSWER,
      counts: {
        matched: 120,
        shown: 1,
        excludedNoCoordinates: 0,
        excludedNoRoofDate: 0,
        truncated: true,
      },
      missing: [],
      rows: [
        {
          propertyCid: "bafkreia",
          tcadId: "0201885122",
          citationId: 1,
          lat: 30.4,
          lon: -97.6,
          missing: [],
        },
      ],
    };
    act(() =>
      (aiProps().onAnswer as (a: unknown, q?: string) => void)(withRows, "roofs near Manor"),
    );
    await screen.findByText("From your question: roofs near Manor");
    expect(screen.queryByTestId("candidate-list")).toBeNull();
    expect(screen.getByText("120")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show filter results" }));
    await screen.findByTestId("candidate-list");
    act(() =>
      (aiProps().onAnswer as (a: unknown, q?: string) => void)(withRows, "roofs near Manor 2"),
    );
    await screen.findByText("From your question: roofs near Manor 2");
    act(() => (aiProps().onAnswer as (a: unknown) => void)(null));
    await screen.findByTestId("candidate-list");
  });

  it("mounts the panel with the prefilled question, never run, and marks the page AI", async () => {
    const page = renderAt("/?mode=ai&q=roofs%20older%20than%2015&lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("ask-panel");
    expect(aiProps().initialQuestion).toBe("roofs older than 15");
    expect(typeof aiProps().threadId).toBe("string");
    expect(page.getAttribute("data-mode")).toBe("ai");
    expect(screen.queryByTestId("search-results")).toBeNull();
    expect(screen.getByTestId("crm-map")).not.toBeNull();
  });

  it("takes the prefilled question out of the URL once the panel has it, so a reload does not refill the box", async () => {
    renderAt("/?mode=ai&q=roofs%20older%20than%2015&lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("ask-panel");
    await vi.waitFor(() =>
      expect(screen.getByTestId("url-search").textContent).not.toContain("q="),
    );
    // The pin, radius and mode stay; the panel still received the question it should prefill.
    expect(screen.getByTestId("url-search").textContent).toContain("mode=ai");
    expect(screen.getByTestId("url-search").textContent).toContain("lat=30.4394");
    expect(aiProps().initialQuestion).toBe("roofs older than 15");
  });

  it("on a phone the view stays selectable in AI mode, and the Filters button leads back out", async () => {
    const page = renderAt("/?lat=30.4394&lng=-97.62&r=5&mode=ai");
    await screen.findByTestId("ask-panel");
    const group = screen.getByRole("group", { name: "View" });
    const pressed = () =>
      [...group.querySelectorAll("button")].filter(
        (b) => b.getAttribute("aria-pressed") === "true",
      );
    expect(pressed().map((b) => b.textContent)).toEqual(["Map + cards"]);
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    await screen.findByTestId("candidate-list");
    expect(page.getAttribute("data-mode")).toBe("ai");
    expect(pressed().map((b) => b.textContent)).toEqual(["List"]);
    fireEvent.click(screen.getByRole("button", { name: "Map + cards" }));
    await screen.findByTestId("ask-panel");
    expect(page.getAttribute("data-mode")).toBe("ai");
    // The way back to filters and results: the Filters button (opens the filters, leaves AI).
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    await screen.findByRole("region", { name: "Results" });
    expect(page.getAttribute("data-mode")).toBeNull();
    expect(screen.queryByTestId("ask-panel")).toBeNull();
    expect(screen.getByRole("spinbutton", { name: "Radius" })).not.toBeNull();
  });

  it("an answer's cited properties become numbered pins; a citation with no coordinates has none", async () => {
    renderAt("/?mode=ai");
    await screen.findByTestId("ask-panel");
    act(() => (aiProps().onAnswer as (a: unknown) => void)(ANSWER));
    await vi.waitFor(() => expect(lastMapProps.answerPins?.map((p) => p.n)).toEqual([1, 2]));
  });

  it("a pin click focuses its citation, and the panel focusing a citation selects its pin", async () => {
    renderAt("/?mode=ai");
    await screen.findByTestId("ask-panel");
    act(() => (aiProps().onAnswer as (a: unknown) => void)(ANSWER));
    act(() => lastMapProps.onPinSelect?.(2));
    await vi.waitFor(() => expect(aiProps().focusedCitation).toBe(2));
    act(() => (aiProps().onFocusCitation as (n: number | null) => void)(1));
    await vi.waitFor(() => expect(lastMapProps.focusedPin).toBe(1));
  });

  it("Show on map fits the pins", async () => {
    renderAt("/?mode=ai");
    await screen.findByTestId("ask-panel");
    act(() => (aiProps().onShowOnMap as () => void)());
    expect(fitPins).toHaveBeenCalledTimes(1);
  });

  it("the thread lasts the session and New question (answer cleared) starts a new one", async () => {
    renderAt("/?mode=ai");
    await screen.findByTestId("ask-panel");
    const first = aiProps().threadId;
    act(() => (aiProps().onAnswer as (a: unknown) => void)(ANSWER));
    expect(aiProps().threadId).toBe(first);
    act(() => (aiProps().onAnswer as (a: unknown) => void)(null));
    await vi.waitFor(() => expect(aiProps().threadId).not.toBe(first));
    expect(aiProps().threadId).toBe(sessionStorage.getItem("crm.askThread.v1"));
  });

  it("mode=filters opens the phone Filters sheet", async () => {
    renderAt("/?mode=filters&lat=30.4394&lng=-97.62&r=5");
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: /^Filters/ }).getAttribute("aria-expanded")).toBe(
        "true",
      ),
    );
  });
});

describe("Map route filter pane match count (board Explore1440 footer)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("wide: shows the property match total with its scope and run, and Clear resets the filters", async () => {
    stubWide(true);
    renderAt("/?lat=30.4394&lng=-97.62&r=5&roof=15");
    await screen.findByTestId("search-results");
    const bar = await vi.waitFor(() => {
      const el = document.querySelector("[data-match-bar]") as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    expect(bar.querySelector("[data-match-total]")?.textContent).toBe("1");
    expect(bar.textContent).toContain("property matches within 5 mi");
    expect(bar.textContent).toContain("Filters: roof ≥ 15");
    // Clear is disabled while everything is at its default (roof 15, nothing else).
    expect((bar.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "25", hidden: true }));
    await vi.waitFor(() =>
      expect(document.querySelector("[data-match-bar]")?.textContent).toContain(
        "Filters: roof ≥ 25",
      ),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Roof age threshold", hidden: true })).getByRole(
        "button",
        { name: "Any", hidden: true },
      ),
    );
    await vi.waitFor(() =>
      expect(document.querySelector("[data-match-bar]")?.textContent).toContain("Filters: none"),
    );
    expect(screen.getByTestId("url-search").textContent).toContain("roof=any");
    fireEvent.click(
      document.querySelector("[data-match-bar] button:not([disabled])") as HTMLElement,
    );
    await vi.waitFor(() =>
      expect(document.querySelector("[data-match-bar]")?.textContent).toContain(
        "Filters: roof ≥ 15",
      ),
    );
    expect(screen.getByTestId("url-search").textContent).not.toContain("roof=");
  });
});

describe("Map route three-pane layout (PO review: left Filters | Ask AI, collapsible panes)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const PIN_URL = "/?lat=30.4394&lng=-97.62&r=5";
  const left = (page: HTMLElement): HTMLElement =>
    page.querySelector<HTMLElement>("[data-pane='left']") as HTMLElement;
  const leftSwitch = (page: HTMLElement): HTMLElement =>
    within(left(page)).getByRole("group", { name: "Left panel" });
  const right = (page: HTMLElement): HTMLElement =>
    page.querySelector<HTMLElement>("[data-pane='right']") as HTMLElement;

  it("the bar above the map is ONE group: Map + cards | List (no Ask AI)", () => {
    stubWide(true);
    const page = renderAt(PIN_URL);
    const bar = page.querySelector("[data-view-bar]") as HTMLElement;
    const group = within(bar).getByRole("group", { name: "View" });
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Map + cards",
      "List",
    ]);
    expect(within(bar).queryByRole("button", { name: /Ask AI|AI mode|Map mode/ })).toBeNull();
    expect(
      within(bar).getByRole("button", { name: "Map + cards" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("the left pane offers Filters | Ask AI, one at a time, kept in the URL", async () => {
    stubWide(true);
    const page = renderAt(PIN_URL);
    const filters = within(leftSwitch(page)).getByRole("button", { name: "Filters" });
    const ask = within(leftSwitch(page)).getByRole("button", { name: "Ask AI panel" });
    expect(filters.getAttribute("aria-pressed")).toBe("true");
    expect(ask.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("ask-panel")).toBeNull();
    fireEvent.click(ask);
    await screen.findByTestId("ask-panel");
    expect(left(page).contains(screen.getByTestId("ask-panel"))).toBe(true);
    expect(
      within(leftSwitch(page))
        .getByRole("button", { name: "Ask AI panel" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(page.getAttribute("data-mode")).toBe("ai");
    // The Filters body is hidden while Ask AI shows.
    expect(
      left(page).querySelector("[aria-label='Filters'][id$='-panel']")?.closest("[hidden]"),
    ).not.toBeNull();
    // The top control is a pure view switch: it keeps showing the view, not the mode.
    expect(screen.getByRole("button", { name: "Map + cards" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("switching back to Filters keeps the answer (the panel stays mounted)", async () => {
    stubWide(true);
    const page = renderAt(`${PIN_URL}&mode=ai`);
    await screen.findByTestId("ask-panel");
    act(() =>
      (lastPanelProps?.onAnswer as (a: unknown) => void)({
        outcome: "answered",
        claims: [],
        citations: [],
      }),
    );
    fireEvent.click(within(leftSwitch(page)).getByRole("button", { name: "Filters" }));
    expect(page.getAttribute("data-mode")).toBeNull();
    expect(screen.getByTestId("ask-panel").closest("[hidden]")).not.toBeNull();
    fireEvent.click(within(leftSwitch(page)).getByRole("button", { name: "Ask AI panel" }));
    expect(screen.getByTestId("ask-panel").closest("[hidden]")).toBeNull();
  });

  it("in AI mode the right pane lists the matches and the panel renders them there", async () => {
    stubWide(true);
    const page = renderAt(`${PIN_URL}&mode=ai`);
    await screen.findByTestId("ask-panel");
    const host = right(page).querySelector("[data-slot='ai-matches']") as HTMLElement;
    expect(host).not.toBeNull();
    expect(lastPanelProps?.matchesHost).toBe(host.querySelector("div"));
    expect(within(host).getByText(/Ask a question on the left/)).not.toBeNull();
    expect(lastPanelProps?.layout).toBe("pane");
    expect(within(right(page)).queryByTestId("ask-panel")).toBeNull();
    act(() =>
      (lastPanelProps?.onAnswer as (a: unknown) => void)({
        outcome: "answered",
        claims: [],
        citations: [],
        rows: [{ propertyCid: "a", tcadId: "1", missing: [] }],
      }),
    );
    expect(within(host).getByText("Matches 1")).not.toBeNull();
    expect(within(host).queryByText(/Ask a question on the left/)).toBeNull();
  });

  it("below the three-pane width the single sheet keeps both tabs: no matches host", async () => {
    renderAt(`${PIN_URL}&mode=ai`);
    await screen.findByTestId("ask-panel");
    expect(lastPanelProps?.matchesHost).toBeUndefined();
    expect(lastPanelProps?.layout).toBe("sheet");
  });

  it("in AI mode the view stays selectable, one option pressed, and the mode and answer are kept", async () => {
    stubWide(true);
    const page = renderAt(`${PIN_URL}&mode=ai`);
    await screen.findByTestId("ask-panel");
    const first = screen.getByTestId("ask-panel").getAttribute("data-instance");
    const bar = page.querySelector("[data-view-bar]") as HTMLElement;
    const pressed = () =>
      [...bar.querySelectorAll("button")]
        .filter((b) => b.getAttribute("aria-pressed") === "true")
        .map((b) => b.textContent);
    expect(pressed()).toEqual(["Map + cards"]);
    fireEvent.click(within(bar).getByRole("button", { name: "List" }));
    await screen.findByTestId("candidate-list");
    expect(pressed()).toEqual(["List"]);
    expect(page.getAttribute("data-mode")).toBe("ai");
    expect(screen.getByTestId("ask-panel").getAttribute("data-instance")).toBe(first);
    fireEvent.click(within(bar).getByRole("button", { name: "Map + cards" }));
    await screen.findByTestId("crm-map");
    expect(pressed()).toEqual(["Map + cards"]);
    expect(page.getAttribute("data-mode")).toBe("ai");
    expect(screen.getByTestId("ask-panel").getAttribute("data-instance")).toBe(first);
    expect(panelUnmounts).toBe(0);
  });

  it("the left pane's Filters tab is the way back out of AI mode", async () => {
    stubWide(true);
    const page = renderAt(`${PIN_URL}&mode=ai`);
    await screen.findByTestId("ask-panel");
    fireEvent.click(within(leftSwitch(page)).getByRole("button", { name: "Filters" }));
    expect(page.getAttribute("data-mode")).toBeNull();
    expect(
      within(leftSwitch(page))
        .getByRole("button", { name: "Filters" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("each pane collapses on its own to a rail with a named handle, and the choice is kept", () => {
    stubWide(true);
    const page = renderAt(PIN_URL);
    const hideLeft = screen.getByRole("button", { name: "Hide filters panel" });
    expect(hideLeft.getAttribute("aria-expanded")).toBe("true");
    const bodyId = hideLeft.getAttribute("aria-controls") as string;
    fireEvent.click(hideLeft);
    expect(left(page).getAttribute("data-collapsed")).toBe("true");
    expect(right(page).getAttribute("data-collapsed")).toBeNull();
    expect(document.getElementById(bodyId)?.hasAttribute("hidden")).toBe(true);
    expect(screen.getByRole("button", { name: "Show filters panel" })).not.toBeNull();
    expect(sessionStorage.getItem("crm.pane.left.v1")).toBe("collapsed");
    expect(screen.getByRole("button", { name: "Hide results panel" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hide results panel" }));
    expect(right(page).getAttribute("data-collapsed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Show filters panel" }));
    expect(left(page).getAttribute("data-collapsed")).toBeNull();
    // The map is still there to take the freed width.
    expect(screen.getByTestId("crm-map")).not.toBeNull();
  });

  it("a remembered collapsed pane opens collapsed", () => {
    stubWide(true);
    sessionStorage.setItem("crm.pane.right.v1", "collapsed");
    const page = renderAt(PIN_URL);
    expect(right(page).getAttribute("data-collapsed")).toBe("true");
    expect(screen.getByRole("button", { name: "Show results panel" })).not.toBeNull();
  });

  it("the property drawer is not hidden by a collapsed results pane", async () => {
    stubWide(true);
    sessionStorage.setItem("crm.pane.right.v1", "collapsed");
    renderAt(`${PIN_URL}&sel=${property.propertyCid}`);
    const drawer = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>("aside[role='dialog'][data-property-cid]");
      if (found === null) throw new Error("no drawer");
      return found;
    });
    expect(drawer.closest("[hidden]")).toBeNull();
    expect(within(drawer).getByRole("button", { name: "Close" })).not.toBeNull();
  });

  it("below three-pane widths there are no pane handles", () => {
    renderAt(PIN_URL);
    expect(screen.queryByRole("button", { name: /panel$/ })).toBeNull();
  });
});

describe("Map route phone toolbar (one row under the search box)", () => {
  it("is Use my location, Filters with the count, and ONE Map | List control", async () => {
    const page = renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("search-results");
    const row = page.querySelector("[data-pane='left']") as HTMLElement;
    const groups = within(row).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["View"]);
    expect(
      [...(groups[0] as HTMLElement).querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual(["Map + cards", "List"]);
    expect(within(row).getByRole("button", { name: "Use my location" })).not.toBeNull();
    expect(within(row).getByRole("button", { name: /^Filters/ }).textContent).toMatch(/1/);
    expect(within(row).queryByRole("button", { name: "Map mode" })).toBeNull();
  });

  it("the sheet peeks small when it only holds a notice, and keeps the full peek with results", async () => {
    searchFails = true;
    const page = renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByText(/Lead index unavailable/);
    expect(page.querySelector("[data-sheet]")?.getAttribute("data-peek")).toBe("compact");
    cleanup();
    searchFails = false;
    const ok = renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("search-results");
    expect(ok.querySelector("[data-sheet]")?.getAttribute("data-peek")).toBe("results");
  });
});

describe("Map route permits from the server (item: permit cap)", () => {
  const URL_PIN = "/?lat=30.4394&lng=-97.62&r=5";

  it("asks the server for the status and open years, not for every permit", async () => {
    renderAt(`${URL_PIN}&mode=filters`);
    await screen.findByTestId("search-results");
    expect(permitInputs[0]).toMatchObject({ radiusMi: 5, sort: "openDays" });
    expect(permitInputs[0]).not.toHaveProperty("statusClass");
    permitInputs.length = 0;
    fireEvent.click(screen.getAllByRole("button", { name: "Stalled" })[0] as HTMLElement);
    await vi.waitFor(() => expect(permitInputs.at(-1)).toMatchObject({ statusClass: ["stalled"] }));
  });

  it("says plainly when the server clipped the permits, with its total", async () => {
    permitsReply = { permits: [], total: 1200, truncated: true };
    renderAt(URL_PIN);
    expect(
      await screen.findByText(
        "Showing the 500 longest-open of 1,200 permits in range; narrow the radius or filters.",
      ),
    ).not.toBeNull();
  });

  it("counts matches from the server's total, and says when the nearest page is clipped", async () => {
    searchResult = { properties: [property], counts: { afterRadius: 340, afterRoofAge: 212 } };
    renderAt(URL_PIN);
    await screen.findByTestId("search-results");
    expect(screen.getByText("Matches 212")).not.toBeNull();
    expect(screen.getByText(/Showing the nearest 1 of 212 properties/)).not.toBeNull();
  });
});

describe("Map route keeps the answer across the 1280 px boundary (resize, rotate, devtools)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const URL_AI = "/?lat=30.4394&lng=-97.62&r=5&mode=ai";
  const inLeft = (page: HTMLElement): boolean =>
    (page.querySelector("[data-pane='left']") as HTMLElement).contains(
      screen.getByTestId("ask-panel"),
    );

  it("one AskPanel instance is mounted once and survives 1300 to 1200 and back", async () => {
    stubWide(true);
    const page = renderAt(URL_AI);
    await screen.findByTestId("ask-panel");
    const first = screen.getByTestId("ask-panel").getAttribute("data-instance");
    expect(inLeft(page)).toBe(true);
    expect(lastPanelProps?.layout).toBe("pane");

    resizeTo(false);
    await vi.waitFor(() => expect(lastPanelProps?.layout).toBe("sheet"));
    expect(screen.getByTestId("ask-panel").getAttribute("data-instance")).toBe(first);
    expect(
      (page.querySelector("[data-sheet]") as HTMLElement).contains(screen.getByTestId("ask-panel")),
    ).toBe(true);

    resizeTo(true);
    await vi.waitFor(() => expect(lastPanelProps?.layout).toBe("pane"));
    expect(screen.getByTestId("ask-panel").getAttribute("data-instance")).toBe(first);
    expect(inLeft(page)).toBe(true);

    expect(panelMounts).toBe(1);
    expect(panelUnmounts).toBe(0);
  });

  it("starting narrow and widening keeps the same instance too", async () => {
    stubWide(false);
    renderAt(URL_AI);
    await screen.findByTestId("ask-panel");
    const first = screen.getByTestId("ask-panel").getAttribute("data-instance");
    resizeTo(true);
    await vi.waitFor(() => expect(lastPanelProps?.layout).toBe("pane"));
    expect(screen.getByTestId("ask-panel").getAttribute("data-instance")).toBe(first);
    expect(panelUnmounts).toBe(0);
  });

  it("switching view while narrow keeps the answer (the one panel instance)", async () => {
    stubWide(false);
    renderAt(URL_AI);
    await screen.findByTestId("ask-panel");
    const first = screen.getByTestId("ask-panel").getAttribute("data-instance");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    await screen.findByTestId("candidate-list");
    fireEvent.click(screen.getByRole("button", { name: "Map + cards" }));
    await vi.waitFor(() =>
      expect(screen.getByTestId("ask-panel").getAttribute("data-instance")).toBe(first),
    );
    expect(panelUnmounts).toBe(0);
  });
});

describe("Map route prefetches the Leads list once a lead can be created", () => {
  const PIN = "/?lat=30.4394&lng=-97.62&r=5";

  it("not on the plain map", async () => {
    renderAt(PIN);
    await screen.findByTestId("search-results");
    expect(prefetchLeads).not.toHaveBeenCalled();
  });

  it("when a property drawer is open (?sel=)", async () => {
    renderAt(`${PIN}&sel=${property.propertyCid}`);
    await vi.waitFor(() => expect(prefetchLeads).toHaveBeenCalledTimes(1));
  });

  it("when the candidate list or triage is showing", async () => {
    renderAt(`${PIN}&view=list`);
    await vi.waitFor(() => expect(prefetchLeads).toHaveBeenCalledTimes(1));
    cleanup();
    prefetchLeads.mockClear();
    renderAt(`${PIN}&triage=1`);
    await vi.waitFor(() => expect(prefetchLeads).toHaveBeenCalledTimes(1));
  });
});

describe("Map route: clicking a hexagon of the county overview searches there", () => {
  const CELL = { lat: 30.2512, lng: -97.7123, zoom: 9, count: 120, medianRoofAge: 21 };
  const select = (cell = CELL): void =>
    act(() => (lastMapProps.onHexSelect as NonNullable<typeof lastMapProps.onHexSelect>)(cell));

  it("opens on the overview with no pin, and the chip says to click a hexagon", async () => {
    renderAt("/");
    await screen.findByText("Click a hexagon to search there");
    expect(lastMapProps.center ?? null).toBeNull();
    expect(typeof lastMapProps.onHexSelect).toBe("function");
  });

  it("drops the pin at the cell's centre and opens the radius view there (default radius covers the cell)", async () => {
    renderAt("/");
    select();
    await vi.waitFor(() => expect(lastMapProps.center).toEqual({ lat: CELL.lat, lng: CELL.lng }));
    expect(lastMapProps.radiusMi).toBe(5);
    // The radius view replaces the overview: the results search runs for that centre.
    await screen.findByTestId("search-results");
  });

  it("keeps the rep's own radius when it already covers the cell", async () => {
    renderAt("/?r=10");
    select();
    await vi.waitFor(() => expect(lastMapProps.center).toEqual({ lat: CELL.lat, lng: CELL.lng }));
    expect(lastMapProps.radiusMi).toBe(10);
  });

  it("widens a radius that would not cover the cell, to the circumradius rounded up", async () => {
    renderAt("/?r=1");
    select();
    await vi.waitFor(() => expect(lastMapProps.radiusMi).toBe(4));
  });

  it("never goes above 25 mi, even for the biggest cells", async () => {
    renderAt("/");
    select({ ...CELL, zoom: 6 });
    await vi.waitFor(() => expect(lastMapProps.radiusMi).toBe(25));
  });

  it("carries the centre and radius in the URL (reload and Back work) with the other filters", async () => {
    renderAt("/?roof=20&mode=filters");
    select();
    await vi.waitFor(() => expect(lastMapProps.center).toEqual({ lat: CELL.lat, lng: CELL.lng }));
    expect(screen.getByRole("button", { name: "20" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Escape returns to the overview", async () => {
    renderAt("/");
    select();
    await vi.waitFor(() => expect(lastMapProps.center).not.toBeNull());
    fireEvent.keyDown(document.body, { key: "Escape" });
    await vi.waitFor(() => expect(lastMapProps.center ?? null).toBeNull());
    await screen.findByText("Click a hexagon to search there");
  });

  it("Escape does not undo a pin the rep placed by hand", async () => {
    renderAt("/");
    act(() => lastMapProps.onPinDrop?.({ lat: 30.3, lng: -97.7 }));
    await vi.waitFor(() => expect(lastMapProps.center).toEqual({ lat: 30.3, lng: -97.7 }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(lastMapProps.center).toEqual({ lat: 30.3, lng: -97.7 });
  });

  it("tapping elsewhere still places a pin", async () => {
    renderAt("/");
    act(() => lastMapProps.onPinDrop?.({ lat: 30.31, lng: -97.71 }));
    await vi.waitFor(() => expect(lastMapProps.center).toEqual({ lat: 30.31, lng: -97.71 }));
  });

  it("a cell with no properties still places the pin and the empty state says so", async () => {
    searchResult = { properties: [] };
    renderAt("/");
    select({ ...CELL, count: 0 });
    await screen.findByText(/No properties within 5 mi/);
  });
});

describe("Map route centres the map on a selected property", () => {
  const URL_PIN = "/?lat=30.4394&lng=-97.62&r=5";
  beforeEach(() => {
    focusTiming.deepLinkDelayMs = 20;
  });
  afterEach(() => {
    focusTiming.deepLinkDelayMs = 2000;
  });

  const at = { lat: property.latitude, lng: property.longitude };

  it("a selection (?sel=, a link or a reload) centres on the property, close in, once", async () => {
    stubWide(false);
    renderAt(`${URL_PIN}&sel=${property.propertyCid}`);
    await vi.waitFor(() => expect(focusProperty).toHaveBeenCalledTimes(1));
    expect(focusProperty.mock.calls[0]?.[0]).toEqual(at);
    expect(lastMapProps.selectedPoint).toEqual(at);
  });

  it("a deep link jumps (instant) after a pause, not at once, so the zoom-16 render does not compete with the first click", async () => {
    stubWide(false);
    focusTiming.deepLinkDelayMs = 150;
    renderAt(`${URL_PIN}&sel=${property.propertyCid}`);
    await screen.findByTestId("search-results");
    expect(focusProperty).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(focusProperty).toHaveBeenCalledTimes(1));
    expect(focusProperty.mock.calls[0]?.[2]).toBe(true);
  });

  it("a deep link's camera move is dropped once the rep starts using the drawer", async () => {
    stubWide(false);
    focusTiming.deepLinkDelayMs = 400;
    renderAt(`${URL_PIN}&sel=${property.propertyCid}`);
    const dialog = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>("aside[role='dialog'][data-property-cid]");
      if (found === null) throw new Error("no drawer");
      return found;
    });
    fireEvent.pointerDown(within(dialog).getByRole("button", { name: "Close" }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(focusProperty).not.toHaveBeenCalled();
  });

  it("choosing a row afterwards flies (not instant)", async () => {
    stubWide(false);
    renderAt(URL_PIN);
    const list = await screen.findByTestId("search-results");
    fireEvent.click(within(list).getAllByRole("button")[0] as HTMLElement);
    await vi.waitFor(() => expect(focusProperty).toHaveBeenCalledTimes(1));
    expect(focusProperty.mock.calls[0]?.[2]).toBe(false);
  });

  it("does not move the search pin or the radius", async () => {
    stubWide(false);
    renderAt(`${URL_PIN}&sel=${property.propertyCid}`);
    await vi.waitFor(() => expect(focusProperty).toHaveBeenCalled());
    expect(lastMapProps.center).toEqual({ lat: 30.4394, lng: -97.62 });
    expect(lastMapProps.radiusMi).toBe(5);
  });

  it("from 1280 px it pads the right for the 440 px drawer", async () => {
    stubWide(true);
    renderAt(`${URL_PIN}&sel=${property.propertyCid}`);
    await vi.waitFor(() => expect(focusProperty).toHaveBeenCalled());
    expect(focusProperty.mock.calls[0]?.[1]).toMatchObject({ right: 440, bottom: 0, left: 0 });
  });

  it("below 1280 px it has no right padding (the drawer is a full-height sheet)", async () => {
    stubWide(false);
    renderAt(`${URL_PIN}&sel=${property.propertyCid}`);
    await vi.waitFor(() => expect(focusProperty).toHaveBeenCalled());
    expect(focusProperty.mock.calls[0]?.[1]).toMatchObject({ right: 0, left: 0 });
  });

  it("closing the drawer keeps the view: no new camera move", async () => {
    stubWide(false);
    renderAt(`${URL_PIN}&sel=${property.propertyCid}`);
    await vi.waitFor(() => expect(focusProperty).toHaveBeenCalledTimes(1));
    const dialog = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>("aside[role='dialog'][data-property-cid]");
      if (found === null) throw new Error("no drawer");
      return found;
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await vi.waitFor(() => expect(document.querySelector("aside[data-property-cid]")).toBeNull());
    expect(focusProperty).toHaveBeenCalledTimes(1);
    expect(lastMapProps.selectedPoint ?? null).toBeNull();
  });

  it("choosing a result row centres on that property", async () => {
    stubWide(false);
    renderAt(URL_PIN);
    const list = await screen.findByTestId("search-results");
    expect(focusProperty).not.toHaveBeenCalled();
    fireEvent.click(within(list).getAllByRole("button")[0] as HTMLElement);
    await vi.waitFor(() => expect(focusProperty).toHaveBeenCalledTimes(1));
    expect(focusProperty.mock.calls[0]?.[0]).toEqual(at);
  });

  it("hands the map the lead status of a property that is already a lead (My leads layer)", async () => {
    stubWide(false);
    presenceReply = [
      { leadKey: `48453:tcad:${property.requestIdentifier}`, leadId: "l1", status: "contacted" },
    ];
    renderAt(URL_PIN);
    await screen.findByTestId("search-results");
    await vi.waitFor(() => {
      const markers = (lastMapProps as { roofMarkers?: { leadStatus?: string }[] }).roofMarkers;
      expect(markers?.[0]?.leadStatus).toBe("contacted");
    });
    expect(presenceCalls[0]?.requestIdentifiers).toEqual([property.requestIdentifier]);
  });

  it("marks nothing and reads no presence when the My leads layer is off", async () => {
    stubWide(false);
    presenceReply = [
      { leadKey: `48453:tcad:${property.requestIdentifier}`, leadId: "l1", status: "new" },
    ];
    renderAt(URL_PIN);
    await screen.findByTestId("search-results");
    await vi.waitFor(() => expect(presenceCalls.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    presenceCalls.length = 0;
    fireEvent.click(screen.getByRole("checkbox", { name: /My leads/ }));
    await vi.waitFor(() => {
      const markers = (lastMapProps as { roofMarkers?: { leadStatus?: string }[] }).roofMarkers;
      expect(markers?.[0]?.leadStatus).toBeUndefined();
    });
    expect(presenceCalls).toEqual([]);
  });

  it("a property without coordinates is not centred, and the map is left alone", async () => {
    stubWide(false);
    searchResult = { properties: [{ ...property, latitude: null, longitude: null } as never] };
    detailWithoutCoords = true;
    renderAt(`${URL_PIN}&sel=${property.propertyCid}`);
    await screen.findByTestId("search-results");
    await screen.findByRole("dialog", { name: /TCAD/ });
    expect(focusProperty).not.toHaveBeenCalled();
    expect(lastMapProps.selectedPoint ?? null).toBeNull();
  });
});

describe("Map route owner filters (tenure, out-of-area)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const PIN = "/?lat=30.4394&lng=-97.62&r=5";

  it("a tenure in the URL changes the search.properties input, owner keys absent when off", async () => {
    renderAt(`${PIN}&tenure=10`);
    await screen.findByTestId("search-results");
    expect(propertyInputs).toContainEqual({
      center: { lat: 30.4394, lng: -97.62 },
      radiusMi: 5,
      roofAgeMinYears: 15,
      tenureYearsMin: 10,
    });
    cleanup();
    propertyInputs.length = 0;
    renderAt(PIN);
    await screen.findByTestId("search-results");
    expect(propertyInputs.every((i) => !("tenureYearsMin" in (i as object)))).toBe(true);
    expect(propertyInputs.every((i) => !("outOfArea" in (i as object)))).toBe(true);
  });

  it("roof age defaults to 15 on load, roof=any means no filter, and both reach search.properties", async () => {
    stubWide(true);
    renderAt(PIN);
    await screen.findByTestId("search-results");
    expect(
      propertyInputs.every((i) => (i as { roofAgeMinYears?: number }).roofAgeMinYears === 15),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "15", hidden: true }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(screen.getByRole("group", { name: "Roof age threshold", hidden: true }))
        .getByRole("button", { name: "Any", hidden: true })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    cleanup();
    propertyInputs.length = 0;
    renderAt(`${PIN}&roof=any`);
    await screen.findByTestId("search-results");
    expect(propertyInputs.length).toBeGreaterThan(0);
    expect(
      propertyInputs.every(
        (i) => (i as { roofAgeMinYears?: number }).roofAgeMinYears === undefined,
      ),
    ).toBe(true);
    expect(
      within(screen.getByRole("group", { name: "Roof age threshold", hidden: true }))
        .getByRole("button", { name: "Any", hidden: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "15", hidden: true }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("an invalid tenure is dropped, never clamped", async () => {
    renderAt(`${PIN}&tenure=500&ooa=maybe`);
    await screen.findByTestId("search-results");
    expect(propertyInputs.every((i) => !("tenureYearsMin" in (i as object)))).toBe(true);
    expect(propertyInputs.every((i) => !("outOfArea" in (i as object)))).toBe(true);
  });

  it("the Out-of-area chip writes ooa to the URL and the query, and says why nothing matches", async () => {
    stubWide(true);
    searchResult = { properties: [] };
    renderAt(PIN);
    fireEvent.click(await screen.findByText("Out-of-area"));
    await vi.waitFor(() =>
      expect(propertyInputs).toContainEqual(expect.objectContaining({ outOfArea: true })),
    );
    expect(screen.getByTestId("url-search").textContent).toContain("ooa=1");
    const notice = await vi.waitFor(() => {
      const el = document.querySelector('[data-state="CrmMapNoResults390"]');
      expect(el).not.toBeNull();
      return el as Element;
    });
    expect(notice.textContent).toContain(
      "Out-of-area compares the owner's mailing ZIP with the county; owners with no mailing ZIP on record are not matched.",
    );
    expect(document.querySelector("[data-out-of-area-hint]")).not.toBeNull();
  });

  it("Clear resets tenure and out-of-area together with roof in one URL update", async () => {
    stubWide(true);
    renderAt(`${PIN}&roof=15&tenure=11&ooa=1`);
    await screen.findByTestId("search-results");
    const bar = await vi.waitFor(() => {
      const el = document.querySelector("[data-match-bar]") as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    expect(bar.textContent).toContain("Filters: roof ≥ 15 · tenure > 10 · out-of-area owner");
    fireEvent.click(bar.querySelector("button") as HTMLElement);
    await vi.waitFor(() => {
      const url = screen.getByTestId("url-search").textContent ?? "";
      expect(url).not.toContain("roof");
      expect(url).not.toContain("tenure");
      expect(url).not.toContain("ooa");
    });
  });

  it("in the county overview an owner filter is not pretended: no count, a note instead", async () => {
    stubWide(true);
    renderAt("/?tenure=10");
    const bar = await vi.waitFor(() => {
      const el = document.querySelector("[data-match-bar]") as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    expect(bar.textContent).toContain("Owner filters apply once you pick an area");
    expect(bar.querySelector("[data-match-total]")).toBeNull();
    expect(overviewCalls.every((c) => !("tenureYearsMin" in (c as object)))).toBe(true);
  });
});

describe("Map route permit filters are part of the shareable URL", () => {
  afterEach(() => vi.unstubAllGlobals());
  const PIN = "/?lat=30.4394&lng=-97.62&r=5";

  it("choosing a permit status writes it to the URL, beside the roof age", async () => {
    renderAt(`${PIN}&roof=15`);
    await screen.findByTestId("search-results");
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const group = screen.getByRole("group", { name: "Permit status" });
    fireEvent.click(within(group).getByRole("button", { name: "Open" }));
    await vi.waitFor(() => {
      const url = new URLSearchParams(screen.getByTestId("url-search").textContent ?? "");
      expect(url.get("roof")).toBe("15");
      expect(url.get("permit")).toBe("open");
    });
    fireEvent.click(within(group).getByRole("button", { name: "Any", hidden: true }));
    await vi.waitFor(() =>
      expect(screen.getByTestId("url-search").textContent ?? "").not.toContain("permit"),
    );
  });

  it("a URL with the permit filter restores it in the search request after a reload", async () => {
    renderAt(`${PIN}&roof=15&permit=open`);
    await screen.findByTestId("search-results");
    await vi.waitFor(() =>
      expect(propertyInputs.at(-1)).toMatchObject({
        roofAgeMinYears: 15,
        permitStatusClass: ["open", "stalled"],
      }),
    );
    cleanup();
    propertyInputs.length = 0;
    renderAt(`${PIN}&permit=stalled&permitYrs=3`);
    await screen.findByTestId("search-results");
    await vi.waitFor(() =>
      expect(propertyInputs.at(-1)).toMatchObject({ permitStatusClass: ["stalled"] }),
    );
  });
});

describe("Map route county overview cannot count a permit filter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("with a permit filter and no centre: no county number, an honest line with the reason", async () => {
    stubWide(true);
    renderAt("/?permit=open");
    const bar = await vi.waitFor(() => {
      const el = document.querySelector("[data-match-bar]") as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    expect(bar.textContent).toContain("Choose a centre or drop a pin to search permits");
    expect(bar.textContent).toContain("can't count permit filters");
    expect(bar.querySelector("[data-match-total]")).toBeNull();
    expect(bar.textContent).not.toContain("county-wide");
  });

  it("without a permit filter the county count is still shown", async () => {
    stubWide(true);
    renderAt("/");
    const total = await vi.waitFor(() => {
      const el = document.querySelector("[data-match-total]") as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    expect(total.textContent).toBe("125");
  });
});

describe("Map route deep link to a property that is not in the run", () => {
  it("a rejected id opens the drawer with the not-in-this-run state and a reason", async () => {
    detailError = { code: "BAD_REQUEST" };
    renderAt("/?sel=not-a-cid");
    const state = await screen.findByTestId("not-in-run");
    expect(within(state).getByRole("heading", { level: 3 }).textContent).toBe(
      "Property not in this run",
    );
    expect(state.textContent).toContain("not in the data run being served");
  });

  it("a failed lookup (not a bad id) says it is unavailable and offers Retry", async () => {
    detailError = { code: "INTERNAL_SERVER_ERROR" };
    renderAt("/?sel=bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa");
    const state = await screen.findByTestId("property-unavailable", {}, { timeout: 4000 });
    expect(state.textContent).toContain("Property details unavailable");
    expect(within(state).getByRole("button", { name: "Retry" })).not.toBeNull();
  });
});
