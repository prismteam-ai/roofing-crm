import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  parseMapView,
  patchMapView,
  useMapViewParam,
} from "../../src/routes/Map/Candidates/useMapViewParam";

describe("map view params", () => {
  it("reads view=list and triage=1, defaults to the map", () => {
    expect(parseMapView(new URLSearchParams("view=list&triage=1"))).toEqual({
      view: "list",
      triage: true,
    });
    expect(parseMapView(new URLSearchParams("view=bogus&triage=0"))).toEqual({
      view: "map",
      triage: false,
    });
  });

  it("patches only its own keys and leaves defaults out of the URL", () => {
    const base = new URLSearchParams("lat=30.4&lng=-97.6&r=5");
    const list = patchMapView(base, { view: "list" });
    expect(list.toString()).toBe("lat=30.4&lng=-97.6&r=5&view=list");
    expect(patchMapView(list, { view: "map" }).toString()).toBe("lat=30.4&lng=-97.6&r=5");
    expect(patchMapView(base, { triage: true }).get("triage")).toBe("1");
  });

  it("the hook follows the URL", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/map?view=list&r=5"]}>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useMapViewParam(), { wrapper });
    expect(result.current.view).toBe("list");
    act(() => result.current.setTriage(true));
    expect(result.current.triage).toBe(true);
    act(() => result.current.setView("map"));
    expect(result.current.view).toBe("map");
  });
});
