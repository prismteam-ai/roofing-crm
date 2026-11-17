"use client";

import type { Circle, LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, num, STATUS_LABEL, yearsOpen, type Lead, type Row } from "./client";

interface Evidence {
  sql: string | string[];
  snapshot: { id: string; root_cid: string };
}
interface Results {
  roofs: { total_matching_properties: number; distinct_street_addresses: number; shown: number; properties: Row[]; evidence: Evidence };
  permits: { total_matches: number; shown: number; permits: Row[]; evidence: Evidence };
}
interface Detail {
  property: Row | null;
  permits: Row[];
}

// Default view: Miami-Dade County, centred on downtown Miami.
const START = { lat: 25.7743, lon: -80.1937 };
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

function roofLead(row: Row, snapshotId: string) {
  return {
    folio: String(row.folio), address: text(row.site_address), city: text(row.site_city), zip: text(row.site_zip), owner: text(row.owner_1),
    reason: "aging_roof" as const, roofYear: row.roof_year === null ? null : Number(row.roof_year), roofBasis: text(row.roof_basis),
    permitNumber: null, permitIssued: null, permitStatus: null, contractor: null, contractorLicence: null,
    lat: row.lat === null ? null : Number(row.lat), lon: row.lon === null ? null : Number(row.lon), snapshotId, sourceUrl: text(row.source_url),
  };
}
function permitLead(row: Row, snapshotId: string) {
  return {
    folio: String(row.folio), address: text(row.address), city: null, zip: null, owner: null,
    reason: "open_permit" as const, roofYear: null, roofBasis: null,
    permitNumber: text(row.permit_number), permitIssued: text(row.issued_date), permitStatus: text(row.status),
    contractor: text(row.contractor_name), contractorLicence: text(row.contractor_number),
    lat: Number.isFinite(Number(row.lat ?? NaN)) ? Number(row.lat) : null,
    lon: Number.isFinite(Number(row.lon ?? NaN)) ? Number(row.lon) : null,
    snapshotId, sourceUrl: text(row.source_url),
  };
}

export function Finder({ leads, onSaved }: { leads: Lead[]; onSaved: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef<{ L: typeof import("leaflet"); results: LayerGroup; pin: Marker; ring: Circle } | null>(null);

  const [centre, setCentre] = useState(START);
  // Kept as typed text so the box can be cleared and retyped; the radius used is always 0.1 to 25 miles.
  const [milesText, setMilesText] = useState("1");
  const miles = Math.min(25, Math.max(0.1, Number(milesText) || 1));
  const [minRoofAge, setMinRoofAge] = useState(15);
  const [minYearsOpen, setMinYearsOpen] = useState(0);
  const [ownerAway, setOwnerAway] = useState(false);
  const [minYearsSinceSale, setMinYearsSinceSale] = useState(0);
  const [licence, setLicence] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const saved = new Set(leads.map((lead) => lead.leadId));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || map.current) return;
      const m = L.map(mapEl.current, { preferCanvas: true }).setView([START.lat, START.lon], 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      const icon = L.divIcon({ html: "📍", className: "", iconSize: [24, 24], iconAnchor: [12, 22] });
      const pin = L.marker([START.lat, START.lon], { icon }).addTo(m);
      const ring = L.circle([START.lat, START.lon], { radius: 1609.34, color: "#0b6bcb", fillOpacity: 0.05 }).addTo(m);
      const group = L.layerGroup().addTo(m);
      m.on("click", (event) => setCentre({ lat: event.latlng.lat, lon: event.latlng.lng }));
      map.current = m;
      layers.current = { L, results: group, pin, ring };
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const l = layers.current;
    if (!l) return;
    l.pin.setLatLng([centre.lat, centre.lon]);
    l.ring.setLatLng([centre.lat, centre.lon]).setRadius(miles * 1609.34);
  }, [centre, miles]);

  // Older roofs in amber, open permits in red. Clicking a marker opens the property.
  useEffect(() => {
    const l = layers.current;
    if (!l || !map.current || !results) return;
    l.results.clearLayers();
    const add = (row: Row, colour: string, label: string) => {
      // A record with no usable position (a permit whose folio is not in the roll) is listed but not mapped.
      const lat = Number(row.lat ?? NaN);
      const lon = Number(row.lon ?? NaN);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      l.L.circleMarker([lat, lon], { radius: 6, color: colour, weight: 1, fillOpacity: 0.75 })
        .bindTooltip(label)
        .on("click", () => openProperty(String(row.folio)))
        .addTo(l.results);
    };
    for (const row of results.roofs.properties) add(row, "#b25a00", `${row.site_address ?? row.folio}: roof ${row.roof_year}`);
    for (const row of results.permits.permits) add(row, "#b3261e", `${row.address}: permit ${row.permit_number}`);
    map.current.fitBounds(l.ring.getBounds(), { padding: [10, 10] });
  }, [results]);

  const search = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        lat: String(centre.lat), lon: String(centre.lon), miles: String(miles), minRoofAge: String(minRoofAge),
        minYearsOpen: String(minYearsOpen), minYearsSinceSale: String(minYearsSinceSale),
      });
      if (ownerAway) params.set("ownerLocation", "out_of_state,foreign,florida_outside_county");
      if (licence) params.set("contractorLicence", licence);
      setResults(await api<Results>(`/api/search?${params}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [centre, miles, minRoofAge, minYearsOpen, minYearsSinceSale, ownerAway, licence]);

  async function goToPlace() {
    if (!place.trim()) return;
    try {
      const found = await api<{ places: Row[] }>(`/api/places?name=${encodeURIComponent(place)}`);
      const hit = found.places[0];
      if (!hit) return setMessage(`No place named "${place}" in the property roll.`);
      setMessage(null);
      setCentre({ lat: Number(hit.lat), lon: Number(hit.lon) });
      map.current?.setView([Number(hit.lat), Number(hit.lon)], 13);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setMessage("This browser cannot share a location. Click the map to drop a pin instead.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lon: position.coords.longitude };
        if (next.lat < 25 || next.lat > 26.1 || next.lon < -81 || next.lon > -80) {
          return setMessage("Your location is outside Miami-Dade County, which is the area this data covers. Click the map to drop a pin instead.");
        }
        setCentre(next);
        map.current?.setView([next.lat, next.lon], 14);
      },
      () => setMessage("Location was not shared. Click the map to drop a pin instead."),
    );
  }

  async function openProperty(folio: string) {
    try {
      setDetail(await api<Detail>(`/api/property/${folio}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function save(lead: ReturnType<typeof roofLead> | ReturnType<typeof permitLead>) {
    try {
      await api("/api/leads", { method: "POST", body: JSON.stringify(lead) });
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const snapshotId = results?.roofs.evidence.snapshot.id ?? "";

  return (
    <div>
      <div className="controls">
        <label>
          Go to a city
          <span style={{ display: "flex", gap: 6 }}>
            <input value={place} onChange={(e) => setPlace(e.target.value)} onKeyDown={(e) => e.key === "Enter" && goToPlace()} placeholder="Hialeah" />
            <button onClick={goToPlace}>Go</button>
          </span>
        </label>
        <button onClick={useMyLocation}>Use my location</button>
        <label>
          Radius (miles)
          <input type="number" min={0.1} max={25} step={0.1} value={milesText} onChange={(e) => setMilesText(e.target.value)} onBlur={() => setMilesText(String(miles))} />
        </label>
        <label>
          Roof older than (years)
          <input type="number" min={0} max={150} value={minRoofAge} onChange={(e) => setMinRoofAge(Number(e.target.value) || 0)} />
        </label>
        <label>
          Permit open at least (years)
          <input type="number" min={0} max={50} step={0.5} value={minYearsOpen} onChange={(e) => setMinYearsOpen(Number(e.target.value) || 0)} />
        </label>
        <label>
          Not sold for (years)
          <input type="number" min={0} max={100} value={minYearsSinceSale} onChange={(e) => setMinYearsSinceSale(Number(e.target.value) || 0)} />
        </label>
        <label>
          Permit contractor&apos;s state licence
          <select value={licence} onChange={(e) => setLicence(e.target.value)}>
            <option value="">Any</option>
            <option value="problem">Probation, suspended or inactive</option>
            <option value="not_in_state_file">Not in the state licence file</option>
            <option value="current_active">Current and active</option>
          </select>
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={ownerAway} onChange={(e) => setOwnerAway(e.target.checked)} /> Owner outside the county
        </label>
        <button className="primary" onClick={search} disabled={busy}>
          {busy ? "Searching…" : "Find leads here"}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        Click the map to drop the pin. Centre {centre.lat.toFixed(5)}, {centre.lon.toFixed(5)}. Amber markers are older roofs, red markers are open roofing permits.
      </div>
      <div ref={mapEl} className="map" style={{ marginTop: 8 }} />
      {message && <div className="note">{message}</div>}

      {!results && <p className="muted">Choose a point and a radius, then search. The first search after a quiet period takes a few seconds.</p>}

      {results && (
        <div className="split" style={{ marginTop: 12 }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Older roofs</h3>
            <p className="muted" style={{ margin: "0 0 6px", fontSize: 13 }}>
              {num(results.roofs.total_matching_properties)} properties at {num(results.roofs.distinct_street_addresses)} addresses match. Showing the{" "}
              {results.roofs.shown} oldest, one per address.
            </p>
            <div className="list">
              {results.roofs.properties.map((row) => {
                const lead = roofLead(row, snapshotId);
                const isSaved = saved.has(`${lead.folio}-roof`);
                return (
                  <div className="candidate" key={String(row.folio)}>
                    <div className="what">
                      <b>{row.site_address ?? "No site address"}</b>
                      <div className="facts">
                        Roof {row.roof_year}, {row.roof_age_years} yr old{" "}
                        <span className={`tag ${row.roof_basis === "roof_permit" ? "ok" : "warn"}`}>{row.roof_basis === "roof_permit" ? "roof permit" : "year built"}</span>
                        {Number(row.matches_at_address) > 1 && <> · {num(row.matches_at_address)} units</>}
                      </div>
                      <div className="facts">
                        {row.owner_1 ?? "Owner not recorded"} · {String(row.owner_location).replaceAll("_", " ")} · {row.miles} mi
                        {row.last_sale_date ? <> · last sold {row.last_sale_date}</> : null}
                      </div>
                    </div>
                    <div className="actions">
                      <button onClick={() => openProperty(String(row.folio))}>Details</button>
                      <button className={isSaved ? "" : "primary"} disabled={isSaved} onClick={() => save(lead)}>
                        {isSaved ? "Saved" : "Add lead"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Open roofing permits</h3>
            <p className="muted" style={{ margin: "0 0 6px", fontSize: 13 }}>
              {num(results.permits.total_matches)} permits match. Showing {results.permits.shown}, longest open first.
            </p>
            <div className="list">
              {results.permits.permits.map((row) => {
                const lead = permitLead(row, snapshotId);
                const isSaved = saved.has(`${lead.folio}-permit-${lead.permitNumber}`);
                return (
                  <div className="candidate" key={String(row.permit_number)}>
                    <div className="what">
                      <b>{row.address}</b>
                      <div className="facts">
                        Permit {row.permit_number} · issued {row.issued_date} · open {yearsOpen(row.days_since_issued)}{" "}
                        <span className="tag bad">{STATUS_LABEL[String(row.status)] ?? row.status}</span>
                      </div>
                      <div className="facts">
                        {row.contractor_name ?? "No contractor printed"}
                        {row.contractor_number ? <> · {row.contractor_number}</> : null}
                        {row.state_licence_found === true && (
                          <>
                            {" "}
                            <span className={`tag ${row.state_licence_standing === "Current" && row.state_licence_activity === "Active" ? "ok" : "bad"}`}>
                              state licence: {row.state_licence_standing}
                              {row.state_licence_activity ? `, ${row.state_licence_activity}` : ""}
                            </span>
                          </>
                        )}
                        {row.state_licence_found === false && row.contractor_number ? <> · not in the state licence file</> : null}
                        {" · "}
                        {row.bbb_profile_url ? (
                          <a href={String(row.bbb_profile_url)} target="_blank" rel="noreferrer" title="The one BBB profile whose name equals this contractor's. A name match, not a confirmed identity. The rating is on that page.">
                            BBB profile
                          </a>
                        ) : (
                          <>BBB: no profile matched</>
                        )}
                      </div>
                    </div>
                    <div className="actions">
                      <button onClick={() => openProperty(String(row.folio))}>Details</button>
                      <button className={isSaved ? "" : "primary"} disabled={isSaved || !row.folio} onClick={() => save(lead)}>
                        {isSaved ? "Saved" : "Add lead"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {results && (
        <details style={{ marginTop: 8 }}>
          <summary>
            Where these results came from (snapshot <span className="mono">{snapshotId}</span>)
          </summary>
          <code className="block">{String(results.roofs.evidence.sql)}</code>
          <code className="block" style={{ marginTop: 6 }}>{String(results.permits.evidence.sql)}</code>
        </details>
      )}

      {detail && (
        <div className="drawer">
          <button onClick={() => setDetail(null)} style={{ float: "right" }}>
            Close
          </button>
          {detail.property ? (
            <>
              <h3>{detail.property.site_address ?? "No site address"}</h3>
              <div className="muted mono">{detail.property.folio}</div>
              <dl className="facts">
                <dt>City</dt>
                <dd>
                  {detail.property.site_city} {detail.property.site_zip}
                </dd>
                <dt>Land use</dt>
                <dd>{detail.property.land_use ?? "—"}</dd>
                <dt>Year built</dt>
                <dd>{detail.property.year_built ?? "not recorded"}</dd>
                <dt>Roof</dt>
                <dd>
                  {detail.property.roof_year ?? "unknown"}
                  {detail.property.roof_year ? ` (${detail.property.roof_age_years} yr), from ${String(detail.property.roof_basis).replaceAll("_", " ")}` : ""}
                  {detail.property.roof_permit_number ? `, permit ${detail.property.roof_permit_number}` : ""}
                </dd>
                <dt>Owner</dt>
                <dd>
                  {detail.property.owner_1 ?? "—"} {detail.property.owner_2 ?? ""}
                </dd>
                <dt>Owner mailing</dt>
                <dd>
                  {detail.property.mailing_address}, {detail.property.mailing_city} {detail.property.mailing_state} {detail.property.mailing_zip} (
                  {String(detail.property.owner_location).replaceAll("_", " ")})
                </dd>
                <dt>Last sale</dt>
                <dd>
                  {detail.property.last_sale_date ?? "not recorded"}
                  {detail.property.last_sale_price ? ` for $${num(detail.property.last_sale_price)}` : ""}
                </dd>
                <dt>Coordinates</dt>
                <dd className="mono">
                  {Number(detail.property.lat).toFixed(5)}, {Number(detail.property.lon).toFixed(5)}
                </dd>
                <dt>Source</dt>
                <dd>
                  <a href={String(detail.property.source_url)} target="_blank" rel="noreferrer">
                    county record
                  </a>{" "}
                  fetched {String(detail.property.fetched_at).slice(0, 10)}
                </dd>
              </dl>
              <h3>County permits on this property ({detail.permits.length})</h3>
              {detail.permits.length === 0 && <p className="muted">None on record since 2020.</p>}
              {detail.permits.map((permit) => (
                <div className="candidate" key={String(permit.permit_number)}>
                  <div className="what">
                    <b>
                      {permit.permit_number} · {String(permit.roofing_kind ?? permit.application_type).replaceAll("_", " ")}
                    </b>
                    <div className="facts">
                      Issued {permit.issued_date} · <span className={`tag ${permit.is_open ? "bad" : "ok"}`}>{STATUS_LABEL[String(permit.status)] ?? permit.status}</span>
                      {permit.is_open ? ` · open ${yearsOpen(permit.days_since_issued)}` : ""}
                    </div>
                    <div className="facts">
                      {permit.contractor_name ?? "No contractor printed"} {permit.contractor_number ?? ""} ·{" "}
                      {permit.bbb_profile_url ? (
                        <a href={String(permit.bbb_profile_url)} target="_blank" rel="noreferrer" title="The one BBB profile whose name equals this contractor's. A name match, not a confirmed identity. The rating is on that page.">
                          BBB profile
                        </a>
                      ) : (
                        <>BBB: no profile matched</>
                      )}
                    </div>
                    <div className="facts">{permit.description ?? permit.category ?? ""}</div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p>This folio is not in the property roll.</p>
          )}
        </div>
      )}
    </div>
  );
}
