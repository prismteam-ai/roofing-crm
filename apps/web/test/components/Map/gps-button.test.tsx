// T015: write first, confirm it fails (no GpsButton exists yet). AC-2's denied/unavailable/
// timeout states and AC-1's edge case 2 (outside-county) — every failure is an explicit, on-screen
// state (role="alert"), never silent (testplans/B-03-test-cases.md TC-009, TC-010).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GpsButton, formatAccuracy } from "../../../src/components/Map/GpsButton.js";

afterEach(cleanup);

function fakeGeolocation(
  behavior: (onSuccess: PositionCallback, onError: PositionErrorCallback | undefined) => void,
): Pick<Geolocation, "getCurrentPosition"> {
  return {
    getCurrentPosition: vi.fn((onSuccess, onError) => behavior(onSuccess, onError ?? undefined)),
  };
}

describe("GpsButton", () => {
  it("resolves a position inside coverage and calls onLocated", () => {
    const onLocated = vi.fn();
    const geolocation = fakeGeolocation((onSuccess) => {
      onSuccess({
        coords: { latitude: 30.4394, longitude: -97.62 },
      } as GeolocationPosition);
    });
    render(<GpsButton onLocated={onLocated} geolocation={geolocation} />);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(onLocated).toHaveBeenCalledWith({ lat: 30.4394, lng: -97.62 });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("PERMISSION_DENIED shows an explicit 'location denied' alert, never silent", () => {
    const geolocation = fakeGeolocation((_onSuccess, onError) => {
      onError?.({ code: 1, message: "denied" } as GeolocationPositionError);
    });
    render(<GpsButton onLocated={vi.fn()} geolocation={geolocation} />);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-state")).toBe("CrmMapGpsDenied390");
    expect(alert.textContent).toMatch(/location/i);
  });

  it("POSITION_UNAVAILABLE and TIMEOUT each show their own explicit state", () => {
    const unavailable = fakeGeolocation((_onSuccess, onError) => {
      onError?.({ code: 2, message: "unavailable" } as GeolocationPositionError);
    });
    const { unmount } = render(<GpsButton onLocated={vi.fn()} geolocation={unavailable} />);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByRole("alert").getAttribute("data-state")).toBe("CrmMapGpsUnavailable390");
    unmount();

    const timeout = fakeGeolocation((_onSuccess, onError) => {
      onError?.({ code: 3, message: "timeout" } as GeolocationPositionError);
    });
    render(<GpsButton onLocated={vi.fn()} geolocation={timeout} />);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    // CRM-HANDOFF.md §4.2: "unavailable or timed out" is one combined board, no separate
    // "CrmMapGpsTimeout390" board exists (CR-B-03 finding).
    expect(screen.getByRole("alert").getAttribute("data-state")).toBe("CrmMapGpsUnavailable390");
  });

  it("no geolocation API at all shows the unavailable state, never a crash", () => {
    render(<GpsButton onLocated={vi.fn()} geolocation={undefined as never} />);
    // geolocation undefined falls through to navigator.geolocation, absent in jsdom by default —
    // still an explicit state, never an unhandled exception.
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Use my location" })),
    ).not.toThrow();
  });

  it("edge case 2: a resolved position outside coverage shows the outside-county state AND still calls onLocated (matching the map-click path, TC-008 — found in review, CR-B-03)", () => {
    const onLocated = vi.fn();
    const geolocation = fakeGeolocation((onSuccess) => {
      onSuccess({ coords: { latitude: 30.6333, longitude: -97.678 } } as GeolocationPosition);
    });
    render(
      <GpsButton onLocated={onLocated} geolocation={geolocation} isInCoverage={() => false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByRole("alert").getAttribute("data-state")).toBe("CrmMapGpsOutside390");
    expect(onLocated).toHaveBeenCalledWith({ lat: 30.6333, lng: -97.678 });
  });

  // Boards CrmGpsStates, CrmMapLocating390, CrmMapGps390, CrmMapGpsLow390, CrmMapGpsDenied390,
  // CrmMapGpsUnavailable390, CrmMapGpsOutside390: each state is a card with its own words and
  // the action the board draws.
  describe("board states", () => {
    const fix = (accuracy?: number): Pick<Geolocation, "getCurrentPosition"> =>
      fakeGeolocation((onSuccess) =>
        onSuccess({
          coords: {
            latitude: 30.4394,
            longitude: -97.62,
            ...(accuracy === undefined ? {} : { accuracy }),
          },
        } as GeolocationPosition),
      );
    const press = (): void => {
      fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    };

    it("formats accuracy as metres, then kilometres", () => {
      expect(formatAccuracy(12)).toBe("±12 m");
      expect(formatAccuracy(499.6)).toBe("±500 m");
      expect(formatAccuracy(1600)).toBe("±1.6 km");
    });

    it("locating: a status card, 'Finding your location…', while the browser answers", () => {
      render(<GpsButton onLocated={vi.fn()} geolocation={fakeGeolocation(() => undefined)} />);
      press();
      const card = screen.getByRole("status");
      expect(card.getAttribute("data-state")).toBe("CrmMapGpsLocating390");
      expect(card.textContent).toMatch(/Finding your location…/);
    });

    it("located (500 m or better): says where the ring centres, with the accuracy", () => {
      const onAccuracy = vi.fn();
      render(
        <GpsButton
          onLocated={vi.fn()}
          onAccuracy={onAccuracy}
          radiusMi={5}
          geolocation={fix(12)}
        />,
      );
      press();
      const card = screen.getByRole("status");
      expect(card.getAttribute("data-state")).toBe("CrmMapGps390");
      expect(card.textContent).toMatch(/You are here \(±12 m\)\. The 5 mi ring centres on you\./);
      expect(onAccuracy).toHaveBeenCalledWith(12);
    });

    it("located with no accuracy reported: does not invent one", () => {
      render(<GpsButton onLocated={vi.fn()} radiusMi={5} geolocation={fix()} />);
      press();
      const text = screen.getByRole("status").textContent ?? "";
      expect(text).toMatch(/You are here\. The 5 mi ring centres on you\./);
      expect(text).not.toMatch(/±/);
    });

    it("low accuracy (over 500 m): says it is approximate and offers Drop pin", () => {
      const onDropPin = vi.fn();
      render(<GpsButton onLocated={vi.fn()} onDropPin={onDropPin} geolocation={fix(1600)} />);
      press();
      const card = screen.getByRole("status");
      expect(card.getAttribute("data-state")).toBe("CrmMapGpsLow390");
      expect(card.textContent).toMatch(/Location is approximate \(±1\.6 km\)/);
      fireEvent.click(screen.getByRole("button", { name: "Drop pin" }));
      expect(onDropPin).toHaveBeenCalledTimes(1);
    });

    it("denied: 'Location is off' with Drop pin", () => {
      const onDropPin = vi.fn();
      const denied = fakeGeolocation((_ok, onError) =>
        onError?.({ code: 1, message: "denied" } as GeolocationPositionError),
      );
      render(<GpsButton onLocated={vi.fn()} onDropPin={onDropPin} geolocation={denied} />);
      press();
      expect(screen.getByRole("alert").textContent).toMatch(
        /Location is off\. Drop a pin or search a place instead\./,
      );
      fireEvent.click(screen.getByRole("button", { name: "Drop pin" }));
      expect(onDropPin).toHaveBeenCalledTimes(1);
    });

    it("timed out: says so, with Drop pin and Try again, which asks the browser once more", () => {
      const geolocation = fakeGeolocation((_ok, onError) =>
        onError?.({ code: 3, message: "timeout" } as GeolocationPositionError),
      );
      render(<GpsButton onLocated={vi.fn()} onDropPin={vi.fn()} geolocation={geolocation} />);
      press();
      expect(screen.getByRole("alert").textContent).toMatch(
        /Your location isn't available: the request timed out\./,
      );
      expect(screen.getByRole("button", { name: "Drop pin" })).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
    });

    it("outside the county: says so and Go to Travis County shows the whole county", () => {
      const onGoToCounty = vi.fn();
      render(
        <GpsButton
          onLocated={vi.fn()}
          onGoToCounty={onGoToCounty}
          isInCoverage={() => false}
          geolocation={fix(30)}
        />,
      );
      press();
      expect(screen.getByRole("alert").textContent).toMatch(
        /You are outside Travis County\. The CRM covers Travis County only\./,
      );
      fireEvent.click(screen.getByRole("button", { name: "Go to Travis County" }));
      expect(onGoToCounty).toHaveBeenCalledTimes(1);
    });

    it("a card can be closed, leaving the button usable", () => {
      render(<GpsButton onLocated={vi.fn()} geolocation={fix(12)} />);
      press();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.getByRole("button", { name: "Use my location" })).not.toBeNull();
    });

    it("renders the card into a given host (the map's status slot) instead of the toolbar", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      render(<GpsButton onLocated={vi.fn()} geolocation={fix(12)} statusHost={host} />);
      press();
      expect(host.querySelector("[data-state='CrmMapGps390']")).not.toBeNull();
      host.remove();
    });
  });
});
