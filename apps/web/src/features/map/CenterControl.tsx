import { type LatLon, LatLon as LatLonSchema } from "@crm/shared";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTRPC } from "../../lib/trpc.ts";
import { useSearch } from "../../state.tsx";
import { GEO_MESSAGE, useGeolocation } from "./useGeolocation.ts";

const SOURCE_LABEL = {
  county: "Broward County center",
  gps: "your location",
  pin: "dropped pin",
  place: "place",
  coords: "coordinates",
  agent: "agent answer",
} as const;

/** Sets the search center without the map: city/place search, lat/lon, or GPS. */
export function CenterControl() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { search, setCenter } = useSearch();
  const [place, setPlace] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const geo = useGeolocation({ onLocated: (p: LatLon) => setCenter(p, "gps") });

  async function findPlace(e: FormEvent) {
    e.preventDefault();
    const name = place.trim();
    if (!name) return;
    setMessage(null);
    try {
      const r = await qc.fetchQuery(trpc.place.resolve.queryOptions({ name }));
      if (!r)
        setMessage(`No Broward County place named “${name}”. Try a city such as Fort Lauderdale or Weston.`);
      else setCenter({ lat: r.lat, lon: r.lon }, "place", r.name);
    } catch {
      setMessage("Place search is unavailable right now; enter latitude and longitude instead.");
    }
  }

  function setCoords(e: FormEvent) {
    e.preventDefault();
    const parsed = LatLonSchema.safeParse({ lat: Number(lat), lon: Number(lon) });
    if (!lat.trim() || !lon.trim() || !parsed.success) {
      setMessage("Enter a latitude between -90 and 90 and a longitude between -180 and 180.");
      return;
    }
    setMessage(null);
    setCenter(parsed.data, "coords");
  }

  const geoMessage = GEO_MESSAGE[geo.status];
  return (
    <section className="center-control" aria-label="Search center">
      <form onSubmit={findPlace} className="row">
        <label>
          City or place
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="e.g. Fort Lauderdale"
          />
        </label>
        <button type="submit">Go</button>
      </form>
      <form onSubmit={setCoords} className="row">
        <label>
          Latitude
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            inputMode="decimal"
            placeholder="26.1224"
          />
        </label>
        <label>
          Longitude
          <input
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            inputMode="decimal"
            placeholder="-80.1373"
          />
        </label>
        <button type="submit">Set center</button>
      </form>
      <div className="row">
        <button type="button" onClick={geo.locate} disabled={geo.status === "locating"}>
          Use my location
        </button>
        <span className="muted" data-testid="center-label">
          Center: {search.placeName ?? SOURCE_LABEL[search.centerSource]} ({search.center.lat.toFixed(4)},{" "}
          {search.center.lon.toFixed(4)})
        </span>
      </div>
      {geoMessage ? (
        <p className={geo.status === "locating" ? "muted" : "notice"} role="status">
          {geoMessage}
        </p>
      ) : null}
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
