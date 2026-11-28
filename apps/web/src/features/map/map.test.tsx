import { BROWARD_CENTER } from "@crm/shared";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { FakeMap } from "../../../test/fake-maplibre.ts";
import {
  ApiError,
  callsTo,
  candidate,
  FTL,
  permitOf,
  renderApp,
  searchResult,
  snapshot,
} from "../../../test/mock-api.tsx";
import { candidateFeatures, LAYER_SPECS } from "./layers.ts";

const webgl = vi.hoisted(() => ({ ok: true }));
vi.mock("./webgl.ts", () => ({ webglAvailable: () => webgl.ok }));
vi.mock("maplibre-gl", async () => (await import("../../../test/fake-maplibre.ts")).maplibreMock());

beforeEach(() => {
  FakeMap.instances = [];
  webgl.ok = true;
});

const lastSearch = (calls: ReturnType<typeof renderApp>["calls"]) =>
  callsTo(calls, "map.search").at(-1)?.input;

describe("map", () => {
  test("map initializes at Broward center, zoom 10", async () => {
    renderApp({});
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    expect(FakeMap.instances[0].opts).toMatchObject({
      center: [BROWARD_CENTER.lon, BROWARD_CENTER.lat],
      zoom: 10,
    });
  });

  test("city search 'Fort Lauderdale' re-centers the search without touching the map", async () => {
    const { calls } = renderApp({
      "place.resolve": ({ name }) => (/fort/i.test(name) ? { name: "Fort Lauderdale", ...FTL } : null),
    });
    fireEvent.change(screen.getByLabelText("City or place"), { target: { value: "Fort Lauderdale" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    await waitFor(() => expect(lastSearch(calls)?.center).toEqual(FTL));
    expect(screen.getByTestId("center-label")).toHaveTextContent("Center: Fort Lauderdale");
    await waitFor(() => expect(FakeMap.instances[0].fitBounds).not.toHaveBeenCalledTimes(0));

    fireEvent.change(screen.getByLabelText("City or place"), { target: { value: "Springfield" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(await screen.findByText(/No Broward County place named “Springfield”/)).toBeInTheDocument();
  });

  test("without WebGL the notice shows and candidates still list", async () => {
    webgl.ok = false;
    renderApp({});
    expect(await screen.findByTestId("map-unavailable")).toHaveTextContent("Map unavailable in this browser");
    expect(await screen.findByTestId("candidate-504202150320")).toBeInTheDocument();
    expect(FakeMap.instances).toHaveLength(0);
    // The center can still be set without the map.
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "26.2" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-80.2" } });
    fireEvent.click(screen.getByRole("button", { name: "Set center" }));
    expect(screen.getByTestId("center-label")).toHaveTextContent("(26.2000, -80.2000)");
  });

  test("clicking the map drops a pin and re-centers the search", async () => {
    const { calls } = renderApp({});
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    const map = FakeMap.instances[0];
    act(() => map.emit("load"));
    act(() => map.emit("click", { point: { x: 1, y: 1 }, lngLat: { lat: 26.2, lng: -80.2 } }));
    await waitFor(() => expect(lastSearch(calls)?.center).toEqual({ lat: 26.2, lon: -80.2 }));
    expect(screen.getByTestId("center-label")).toHaveTextContent("dropped pin");
  });

  test("clicking a marker opens its detail instead of moving the pin", async () => {
    renderApp({ "property.get": () => new Promise(() => {}) });
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    const map = FakeMap.instances[0];
    act(() => map.emit("load"));
    map.hits = [{ properties: { id: "504202150320" } }];
    act(() => map.emit("click", { point: { x: 1, y: 1 }, lngLat: { lat: 26.2, lng: -80.2 } }));
    expect(await screen.findByRole("dialog", { name: "Property detail" })).toBeInTheDocument();
  });

  test("GPS denied shows a message and keeps the county center", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (_ok: unknown, err: (e: { code: number }) => void) => err({ code: 1 }),
      },
    });
    const { calls } = renderApp({});
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText(/Location permission was denied/)).toBeInTheDocument();
    expect(lastSearch(calls)?.center).toEqual(BROWARD_CENTER);
    vi.unstubAllGlobals();
  });

  test("GPS success re-centers the search on the device position", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) =>
          ok({ coords: { latitude: FTL.lat, longitude: FTL.lon } }),
      },
    });
    const { calls } = renderApp({});
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    await waitFor(() => expect(lastSearch(calls)?.center).toEqual(FTL));
    vi.unstubAllGlobals();
  });

  test("radius slider clamps to 0.25–25 and updates the query", async () => {
    const { calls } = renderApp({});
    const input = screen.getByLabelText("Radius in miles");
    fireEvent.change(input, { target: { value: "40" } });
    await waitFor(() => expect(lastSearch(calls)?.radiusMiles).toBe(25));
    fireEvent.change(input, { target: { value: "0" } });
    await waitFor(() => expect(lastSearch(calls)?.radiusMiles).toBe(0.25));
    fireEvent.change(screen.getByLabelText("Radius (miles)"), { target: { value: "3" } });
    await waitFor(() => expect(lastSearch(calls)?.radiusMiles).toBe(3));
    expect(screen.getByTestId("radius-value")).toHaveTextContent("3 mi");
  });

  test("an outsideCoverage result shows the 'Outside Broward coverage' banner", async () => {
    renderApp({ "map.search": () => searchResult([], { outsideCoverage: true }) });
    expect(await screen.findByTestId("outside-coverage")).toHaveTextContent("Outside Broward coverage");
  });

  test("long-open permits render with an emphasized style", async () => {
    const long = candidate({ openRoofPermits: [permitOf("ftl:R-1", 8)] });
    const recent = candidate({ propertyId: "2", openRoofPermits: [permitOf("ftl:R-2", 2)] });
    const f = candidateFeatures([long, recent, candidate({ propertyId: "3" })]).features.map(
      (x) => x.properties,
    );
    expect(f.map((p) => [p.kind, p.longOpen, p.openYears])).toEqual([
      ["permit", true, 8],
      ["permit", false, 2],
      ["aged", false, 0],
    ]);
    const spec = LAYER_SPECS.find((l) => l.id === "open-permits")!;
    expect(JSON.stringify(spec.paint["circle-stroke-width"])).toContain('["case",["get","longOpen"],3,1]');
    expect(JSON.stringify(spec.paint["circle-radius"])).toContain('["get","openYears"]');

    renderApp({ "map.search": () => searchResult([long, recent]) });
    const row = await screen.findByTestId("candidate-504202150320");
    expect(row.querySelector(".long-open")).toHaveTextContent("open 8 years · Long-open");
    expect(screen.getByTestId("candidate-2").querySelector(".long-open")).toBeNull();
  });

  test("a manifest mismatch shows a degraded-data banner naming both runs", async () => {
    renderApp({
      "meta.snapshot": () => snapshot({ manifestMismatch: true, servedManifestCid: "bafyOTHER" }),
      "map.search": () => {
        throw new ApiError("PRECONDITION_FAILED", "mismatch");
      },
    });
    const banner = await screen.findByText(/Data run mismatch/);
    expect(banner.parentElement).toHaveTextContent("bafyOTHER");
    expect(banner.parentElement).toHaveTextContent("bafkreiaw4jf6");
    expect(
      await screen.findByText(/Search refused: the Oracle serves a different data run/),
    ).toBeInTheDocument();
  });

  test("a capped layer says only the first rows are shown", async () => {
    renderApp({ "map.search": () => searchResult([candidate()], { capped: ["aged_roofs"] }) });
    expect(await screen.findByTestId("capped")).toHaveTextContent(
      "Showing the first 2,000 aged roofs (the oldest roofs first)",
    );
  });
});
