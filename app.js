const FILES = {
  leads: "https://ipfs.filebase.io/ipfs/bafybeihw5g56twmdqkk2c2brwnseo3tlvdepkvheewle6kuhjdm7jaos6i",
  permits: "https://ipfs.filebase.io/ipfs/bafybeifoqcp3xzsslb6w2p2woklnr5tv5axsp2jgploqvlgpunrzxvpwqa",
  tiles: GATEWAY + TILE_INDEX_CID,
};
const PAGE = 200;
const CITIES = {
  wilmington: [39.739072, -75.539787],
  newark: [39.683723, -75.749657],
  hockessin: [39.790669, -75.704647],
  middletown: [39.449556, -75.716321],
  bear: [39.629279, -75.658261],
  "new castle": [39.662039, -75.566313],
};
const VIEWS = {
  roofs: "Roofs 15+",
  permits: "Open permits",
  saved: "Saved leads",
};
const BASIS = {
  "structure.year_built": "from year built",
  latest_roof_permit: "from last roof permit",
};
const BBB_NOTE = "BBB not loaded: bbb.org/robots.txt disallows category pages";
const state = {
  leads: [], byParcel: new Map(), map: null, layer: null, pin: null, view: "roofs", rows: [], selected: null,
  limit: PAGE, ready: false, runId: 0, sort: { key: null, dir: -1 },
};

function miles(lat1, lon1, lat2, lon2) {
  const r = 3958.7613;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dlat = ((lat2 - lat1) * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function saved() {
  return JSON.parse(localStorage.getItem("roofing-leads") || "[]");
}

function toggleSaved(lead) {
  const rest = saved().filter((item) => item.prclid !== lead.prclid);
  const isSaved = rest.length !== saved().length;
  const { distance_miles: _distance, ...copy } = lead;
  const next = isSaved ? rest : [{ ...copy, saved_at: new Date().toISOString() }, ...rest];
  localStorage.setItem("roofing-leads", JSON.stringify(next.slice(0, 200)));
  return !isSaved;
}

function findLead(prclid) {
  return state.rows.find((item) => item.prclid === prclid)
    || state.leads.find((item) => item.prclid === prclid)
    || saved().find((item) => item.prclid === prclid);
}

function permitsFor(prclid) {
  return state.byParcel.get(prclid) || [];
}

function openPermitsFor(prclid) {
  return permitsFor(prclid).filter((permit) => permit.permit_status === "open");
}

function filters() {
  return {
    lat: Number(document.getElementById("lat").value),
    lon: Number(document.getElementById("lon").value),
    radius: Number(document.getElementById("miles").value),
    minAge: Number(document.getElementById("min-age").value),
  };
}

function withDistance(leads, lat, lon) {
  return leads.map((lead) => ({ ...lead, distance_miles: miles(lat, lon, lead.lat, lead.lon) }));
}

function oldestOpenRoofDays(prclid, byParcel) {
  const days = (byParcel.get(prclid) || [])
    .filter((permit) => permit.permit_status === "open" && permit.is_roof)
    .map((permit) => permit.days_open ?? -Infinity);
  return days.length ? Math.max(...days) : -Infinity;
}

function rowsFor(view, { lat, lon, radius, minAge, roofOnly = state.roofOnly }, leads = state.leads, byParcel = state.byParcel) {
  if (view === "saved") {
    return saved().map((lead) => (lead.lat == null
      ? { ...lead, distance_miles: Infinity, legacy: true }
      : { ...lead, distance_miles: miles(lat, lon, lead.lat, lead.lon) }))
      .sort((a, b) => a.distance_miles - b.distance_miles);
  }
  const near = withDistance(leads, lat, lon).filter((lead) => lead.distance_miles <= radius);
  if (view === "permits") {
    const key = roofOnly
      ? (lead) => oldestOpenRoofDays(lead.prclid, byParcel)
      : (lead) => lead.oldest_open_days ?? -Infinity;
    return near.filter((lead) => lead.open_permit_count > 0 && (!roofOnly || lead.open_roof_permit_count > 0))
      .sort((a, b) => key(b) - key(a));
  }
  return near.filter((lead) => lead.roof_age_years != null && lead.roof_age_years >= minAge)
    .sort((a, b) => a.distance_miles - b.distance_miles);
}

function years(days) {
  return days == null ? null : Math.floor(days / 365.25);
}

function ageCell(lead) {
  if (lead.legacy) return `<span class="none">Saved before details were kept</span>`;
  if (lead.roof_age_years == null) return `<span class="none">Unknown</span>`;
  return `<span class="age${lead.roof_age_years >= 30 ? " old" : ""}">${lead.roof_age_years}</span><span class="sub">${BASIS[lead.roof_age_basis] || ""}</span>`;
}

function span(days) {
  if (days == null) return "";
  const y = years(days);
  return y >= 1 ? `${y} yr` : `${days} days`;
}

function openCell(lead) {
  if (!lead.open_permit_count) return `<span class="none">None open</span>`;
  const newest = span(lead.newest_open_days);
  const oldest = span(lead.oldest_open_days);
  const detail = lead.open_permit_count > 1 && oldest !== newest ? `newest ${newest} · oldest ${oldest}` : newest ? `issued ${newest} ago` : "";
  return `<span class="since">${lead.open_permit_count} open</span>${detail ? `<span class="sub">${detail}</span>` : ""}`;
}

const LICENSE_LABEL = {
  "RESIDENT CONTRACTOR": "Delaware resident contractor",
  "NON-RESIDENT CONTRACTOR": "non-resident contractor",
  "CONSTRUCTION MANAGER": "construction manager",
};

function licenseSub(category, validTo, status) {
  if (!status) return `<span class="sub">No name match on Delaware contractor licenses</span>`;
  const label = LICENSE_LABEL[category] || "contractor license";
  return `<span class="sub">Licensed name match · ${label}${validTo ? ` · valid to ${escapeHtml(String(validTo).slice(0, 10))}` : ""}</span>`;
}

function permitLicenseLine(permit) {
  return licenseSub(permit.license_category, permit.license_valid_to, permit.license_status);
}

function contractorCell(lead) {
  const named = openPermitsFor(lead.prclid).find((permit) => permit.contractor_name);
  if (named) return `<span class="who">${escapeHtml(named.contractor_name)}</span><span class="sub">On the open permit</span>${permitLicenseLine(named)}`;
  if (lead.last_roof_contractor_name) {
    const year = String(lead.last_roof_contractor_issued_at || "").slice(0, 4);
    return `<span class="who">${escapeHtml(lead.last_roof_contractor_name)}</span><span class="sub">Last closed roof permit${year ? ` · ${year}` : ""}</span>${licenseSub(lead.last_roof_license_category, lead.last_roof_license_valid_to, lead.last_roof_license_status)}`;
  }
  return `<span class="none">${lead.open_roof_permit_count ? "Not printed on permit" : "None on a closed roof permit"}</span>`;
}

function distanceLabel(lead) {
  return Number.isFinite(lead.distance_miles) ? `${lead.distance_miles.toFixed(2)} mi` : "location not stored";
}

function draw(rows, lat, lon, radius) {
  if (!state.map) {
    state.map = L.map("map").setView([lat, lon], 11);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors", maxZoom: 16,
    }).addTo(state.map);
    state.map.on("click", (event) => {
      state.pin = [event.latlng.lat, event.latlng.lng];
      document.getElementById("lat").value = event.latlng.lat.toFixed(6);
      document.getElementById("lon").value = event.latlng.lng.toFixed(6);
      document.getElementById("gps-status").textContent = "Pin dropped. Choose Use map pin to search here.";
    });
  }
  if (state.layer) state.layer.remove();
  state.layer = L.layerGroup().addTo(state.map);
  if (state.view !== "saved") {
    const circle = L.circle([lat, lon], { radius: radius * 1609.344, color: "#0b57d0", weight: 1, fillColor: "#d3e3fd", fillOpacity: 0.25 }).addTo(state.layer);
    L.marker([lat, lon]).addTo(state.layer);
    state.map.fitBounds(circle.getBounds(), { padding: [24, 24], maxZoom: 14 });
  } else if (rows.some((lead) => lead.lat != null)) {
    state.map.fitBounds(L.latLngBounds(rows.filter((lead) => lead.lat != null).map((lead) => [lead.lat, lead.lon])), { padding: [24, 24], maxZoom: 14 });
  }
  const canvas = L.canvas({ padding: 0.5 });
  rows.filter((lead) => lead.lat != null).forEach((lead) => {
    const color = lead.open_roof_permit_count ? "#d96570" : "#9b72cb";
    L.circleMarker([lead.lat, lead.lon], { renderer: canvas, radius: 5, color, weight: 1, fillOpacity: 0.85 })
      .bindTooltip(`${lead.address.replace(/\s+/g, " ")}, ${lead.city}`)
      .on("click", () => openDrawer(lead.prclid))
      .addTo(state.layer);
  });
}

function contractorName(lead) {
  const named = openPermitsFor(lead.prclid).find((permit) => permit.contractor_name);
  return named?.contractor_name || lead.last_roof_contractor_name || "";
}

function compareValues(a, b, dir) {
  const empty = (value) => value == null || value === "" || (typeof value === "number" && !Number.isFinite(value));
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  const diff = typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return diff * dir;
}

function sortedRows(rows) {
  const { key, dir } = state.sort;
  if (!key) return rows;
  const value = {
    property: (lead) => lead.address,
    age: (lead) => lead.roof_age_years,
    open: (lead) => (state.roofOnly ? oldestOpenRoofDays(lead.prclid, state.byParcel) : lead.oldest_open_days),
    contractor: contractorName,
  }[key];
  return [...rows].sort((a, b) => compareValues(value(a), value(b), dir));
}

function orderPhrase() {
  if (!state.sort.key) {
    if (state.view === "permits") return ", longest open first";
    if (state.view === "roofs") return ", closest first";
    return "";
  }
  const text = state.sort.key === "property" || state.sort.key === "contractor";
  const way = text
    ? (state.sort.dir < 0 ? "Z to A" : "A to Z")
    : (state.sort.dir < 0 ? "high to low" : "low to high");
  const label = { property: "address", age: "roof age", open: "days open", contractor: "contractor" }[state.sort.key];
  return `, by ${label}, ${way}`;
}

function sortHeader(label, key) {
  const on = state.sort.key === key;
  const mark = on ? (state.sort.dir < 0 ? " ↓" : " ↑") : "";
  return `<th><button type="button" class="sort${on ? " on" : ""}" data-sort="${key}" aria-sort="${on ? (state.sort.dir < 0 ? "descending" : "ascending") : "none"}">${label}${mark}</button></th>`;
}

function render() {
  const rows = sortedRows(state.rows);
  const shown = Math.min(rows.length, state.limit);
  const savedIds = new Set(saved().map((item) => item.prclid));
  document.getElementById("view-title").textContent = VIEWS[state.view];
  document.getElementById("count").textContent = rows.length
    ? `${rows.length.toLocaleString()} ${state.view === "permits" ? (state.roofOnly ? "open roof permits" : "open permits") : "properties"}${orderPhrase()}${shown < rows.length ? ` · showing ${shown.toLocaleString()}` : ""}`
    : "";
  const more = shown < rows.length
    ? `<button type="button" class="btn tonal more" data-more>Show ${Math.min(PAGE, rows.length - shown).toLocaleString()} more</button>`
    : "";
  document.getElementById("results").innerHTML = rows.length
    ? `<table><thead><tr>${sortHeader("Property", "property")}${sortHeader("Roof age", "age")}${sortHeader("Open permits", "open")}${sortHeader("Contractor", "contractor")}<th>BBB</th><th></th></tr></thead>
      <tbody>${rows.slice(0, shown).map((lead) => `<tr data-prclid="${lead.prclid}"${state.selected === lead.prclid ? ' class="selected"' : ""}>
        <td><span class="addr">${escapeHtml(lead.address.replace(/\s+/g, " "))}</span><span class="sub">${escapeHtml(lead.city)} · ${distanceLabel(lead)}</span></td>
        <td>${ageCell(lead)}</td>
        <td>${openCell(lead)}</td>
        <td>${contractorCell(lead)}</td>
        <td><span class="none" title="${BBB_NOTE}">Not loaded</span></td>
        <td><button type="button" class="save${savedIds.has(lead.prclid) ? " done" : ""}" data-save="${lead.prclid}">${savedIds.has(lead.prclid) ? "Saved" : "Save lead"}</button></td>
      </tr>`).join("")}</tbody></table>${more}`
    : `<p class="empty">${state.view === "saved" ? "Save a property from any view to keep it here." : "No properties match. Try a larger radius or a lower roof age."}</p>`;
}

function updateCounts() {
  const current = filters();
  document.getElementById("n-roofs").textContent = rowsFor("roofs", current).length.toLocaleString();
  document.getElementById("n-permits").textContent = rowsFor("permits", current).length.toLocaleString();
  document.getElementById("n-saved").textContent = saved().length.toLocaleString();
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

async function run() {
  state.sort = { key: null, dir: -1 };
  const current = filters();
  document.getElementById("age-filter").setAttribute("aria-disabled", String(state.view !== "roofs"));
  if (![current.lat, current.lon, current.radius].every(Number.isFinite) || current.radius <= 0) {
    setStatus("Enter a latitude, longitude, and a radius above 0.");
    return;
  }
  const id = ++state.runId;
  state.limit = PAGE;
  state.roofOnly = document.getElementById("roof-only").checked;
  document.getElementById("roof-only-filter").hidden = state.view !== "permits";
  if (state.view !== "saved") {
    document.getElementById("results").classList.add("busy");
    setStatus(`Loading parcels within ${current.radius} miles…`);
    try {
      const area = await loadArea(current.lat, current.lon, current.radius, (done, total) => {
        if (id === state.runId) setStatus(`Loading map tiles ${done} of ${total}…`);
      });
      if (id !== state.runId) return;
      state.leads = area.leads;
      state.byParcel = area.byParcel;
    } catch (error) {
      if (id === state.runId) setStatus(`Published data did not load (${error.message}).`);
      document.getElementById("results").classList.remove("busy");
      return;
    }
    document.getElementById("results").classList.remove("busy");
  } else {
    await loadTileIndex();
    const keys = [...new Set(saved().filter((lead) => lead.lat != null).flatMap((lead) => tilesNear(lead.lat, lead.lon, 0)))];
    for (const tile of await Promise.all(keys.map(loadTile))) {
      for (const permit of tile.permits) {
        const list = state.byParcel.get(permit.prclid) || [];
        if (!list.some((item) => item.apno === permit.apno)) list.push(permit);
        state.byParcel.set(permit.prclid, list);
      }
    }
    if (id !== state.runId) return;
  }
  state.rows = rowsFor(state.view, current);
  draw(state.rows, current.lat, current.lon, current.radius);
  render();
  updateCounts();
  const totals = tileTotals();
  setStatus(`${state.leads.length.toLocaleString()} parcels loaded near this point · ${totals.parcels.toLocaleString()} county parcels published on IPFS`);
}

function openDrawer(prclid) {
  const lead = findLead(prclid);
  if (!lead) return;
  state.selected = prclid;
  const permits = openPermitsFor(prclid);
  const roofHistory = permitsFor(prclid).filter((permit) => permit.permit_status !== "open" && permit.is_roof);
  const isSaved = saved().some((item) => item.prclid === prclid);
  const reason = lead.open_permit_count
    ? `${lead.open_permit_count} open permit${lead.open_permit_count === 1 ? "" : "s"}`
    : lead.roof_age_years != null ? `Roof about ${lead.roof_age_years} years old` : "No roof signal";
  document.getElementById("drawer").innerHTML = `
    <div class="drawer-top"><button type="button" class="close" data-close aria-label="Close">×</button></div>
    <h2>${escapeHtml(lead.address.replace(/\s+/g, " "))}</h2>
    <p class="lede">${escapeHtml(lead.city)}, DE ${escapeHtml((lead.zip || "").replace(/-$/, ""))} · ${reason}</p>
    <div class="actions">
      <button type="button" class="btn ${isSaved ? "tonal" : "primary"}" data-save="${lead.prclid}">${isSaved ? "Saved as lead" : "Save as lead"}</button>
    </div>
    <section><h3>Roof</h3><dl class="facts">
      <dt>Roof age</dt><dd>${lead.roof_age_years != null ? `${lead.roof_age_years} years, ${BASIS[lead.roof_age_basis] || "basis unknown"}` : "Not known"}</dd>
      <dt>Year built</dt><dd>${lead.year_built ?? "Not in county data"}</dd>
      <dt>Open roof permits</dt><dd>${lead.open_roof_permit_count || 0}</dd>
    </dl></section>
    <section><h3>Open permits</h3>${permits.length ? permits.map((permit) => `<div class="permit">
      <strong>Permit ${escapeHtml(permit.apno)}</strong> <span class="since">Open ${permit.days_open?.toLocaleString() ?? "?"} days</span>
      <p>Issued ${escapeHtml(permit.issued_on || "date not published")}${permit.aptype ? ` · ${escapeHtml(permit.aptype)}` : ""}${permit.is_roof ? " · roof work" : ""}</p>
      <p>${escapeHtml(permit.comments || "No description")}</p>
      <p>Contractor: ${permit.contractor_name ? `<span class="who">${escapeHtml(permit.contractor_name)}</span>${permitLicenseLine(permit)}` : "not printed on this permit"}</p>
    </div>`).join("") : `<p class="muted">No open permit on this parcel.</p>`}</section>
    <section><h3>Past roof permits</h3>${roofHistory.length ? roofHistory.map((permit) => `<div class="permit">
      <strong>Permit ${escapeHtml(permit.apno)}</strong> <span class="sub">${escapeHtml(permit.permit_status || "")}</span>
      <p>Issued ${escapeHtml(permit.issued_on || "date not published")}${permit.aptype ? ` · ${escapeHtml(permit.aptype)}` : ""}</p>
      <p>${escapeHtml(permit.comments || "No description")}</p>
      <p>Contractor: ${permit.contractor_name ? `<span class="who">${escapeHtml(permit.contractor_name)}</span>${permitLicenseLine(permit)}` : "not printed on this permit"}</p>
    </div>`).join("") : `<p class="muted">No closed roof permit on this parcel.</p>`}</section>
    <section><h3>Contractor and BBB</h3><dl class="facts">
      <dt>Last roof contractor</dt><dd>${lead.last_roof_contractor_name ? `${escapeHtml(lead.last_roof_contractor_name)} <span class="sub">Closed or new-construction roof permit${lead.last_roof_contractor_issued_at ? ` · ${escapeHtml(String(lead.last_roof_contractor_issued_at).slice(0, 10))}` : ""}. Not the open-permit contractor.</span>${licenseSub(lead.last_roof_license_category, lead.last_roof_license_valid_to, lead.last_roof_license_status)}` : "None printed on a closed roof permit"}</dd>
      <dt>Latest county permit</dt><dd>${lead.contractor_name ? `${escapeHtml(lead.contractor_name)} <span class="sub">Any permit type, not only roofing</span>` : "None printed"}</dd>
      <dt>BBB rating</dt><dd>${BBB_NOTE}</dd>
    </dl></section>
    <section><h3>Owner</h3><dl class="facts">
      <dt>Owner location</dt><dd>${lead.owner_out_of_area ? "Mailing address outside the area" : "Local mailing address"}</dd>
    </dl></section>
    <section><h3>Source</h3><dl class="facts">
      <dt>Parcel</dt><dd>${escapeHtml(lead.prclid)}</dd>
      <dt>Coordinates</dt><dd>${lead.lat != null ? `${lead.lat.toFixed(5)}, ${lead.lon.toFixed(5)}` : "Not stored on this lead (saved before coordinates were kept)"}</dd>
      <dt>Lead file</dt><dd><a href="${FILES.leads}" target="_blank" rel="noopener">IPFS CID</a></dd>
      <dt>Permit file</dt><dd><a href="${FILES.permits}" target="_blank" rel="noopener">IPFS CID</a></dd>
      <dt>Map tiles</dt><dd><a href="${FILES.tiles}" target="_blank" rel="noopener">IPFS CID</a></dd>
    </dl></section>`;
  document.getElementById("drawer").classList.add("open");
  render();
}

function closeDrawer() {
  state.selected = null;
  document.getElementById("drawer").classList.remove("open");
  render();
}

document.addEventListener("click", (event) => {
  const sort = event.target.closest("[data-sort]");
  if (sort) {
    const key = sort.dataset.sort;
    const descFirst = key === "age" || key === "open";
    state.sort = state.sort.key === key
      ? { key, dir: state.sort.dir * -1 }
      : { key, dir: descFirst ? -1 : 1 };
    render();
    return;
  }
  const save = event.target.closest("[data-save]");
  if (save) {
    const lead = findLead(save.dataset.save);
    if (!lead) return;
    toggleSaved(lead);
    if (state.view === "saved") state.rows = rowsFor("saved", filters());
    render();
    updateCounts();
    if (document.getElementById("drawer").classList.contains("open")) openDrawer(state.selected || lead.prclid);
    return;
  }
  if (event.target.closest("[data-more]")) {
    state.limit += PAGE;
    render();
    return;
  }
  if (event.target.closest("[data-close]")) return closeDrawer();
  const row = event.target.closest("tr[data-prclid]");
  if (row) openDrawer(row.dataset.prclid);
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item === button));
    run();
  });
});

document.querySelectorAll("[data-density]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById("results").classList.toggle("compact", button.dataset.density === "compact");
    document.querySelectorAll("[data-density]").forEach((item) => item.classList.toggle("active", item === button));
  });
});

document.getElementById("roof-only").addEventListener("change", () => run());

document.getElementById("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run();
});
document.getElementById("use-pin").addEventListener("click", () => {
  if (!state.pin) {
    document.getElementById("gps-status").textContent = "Click the map to drop a pin first.";
    return;
  }
  document.getElementById("lat").value = state.pin[0].toFixed(6);
  document.getElementById("lon").value = state.pin[1].toFixed(6);
  run();
});
document.getElementById("use-gps").addEventListener("click", () => {
  const status = document.getElementById("gps-status");
  if (!navigator.geolocation) {
    status.textContent = "This browser does not provide a location.";
    return;
  }
  status.textContent = "Requesting your location.";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      document.getElementById("lat").value = latitude.toFixed(6);
      document.getElementById("lon").value = longitude.toFixed(6);
      status.textContent = `Centered on your location (${latitude.toFixed(4)}, ${longitude.toFixed(4)}).`;
      run();
    },
    (error) => {
      status.textContent = error.code === 1
        ? "Location permission was denied. Use the map pin or type coordinates."
        : "Your location could not be read. Use the map pin or type coordinates.";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
});

const CITATIONS = [
  "BBB ratings were not submitted. https://www.bbb.org/robots.txt disallows /*? and /business-reviews/*, so no BBB harvest was submitted.",
  "Contractor license fields are a name match to the Delaware business contractor licenses (SODA dataset 5zy2-grhr). A match means a licensed name exists. It does not confirm the permit contractor is that licensee. Electrical, plumbing, and HVACR trade licenses (pjnv-eaih) are issued to people, so they are not matched. HOMEOWNER PERMIT is not matched.",
  "The county open-permit layer prints a contractor on only a few rows. A name on an open permit appears only when that layer prints one. Last roof contractor is the name on the latest closed or new-construction roof permit. It is not the open-permit contractor.",
];

function leadFacts(lead, permit) {
  const facts = [];
  if (lead.roof_age_years != null) {
    facts.push(`roof about ${lead.roof_age_years} years old, from ${lead.roof_age_basis === "structure.year_built" ? "year built" : "the latest roof permit"}`);
  } else {
    facts.push("roof age unknown");
  }
  if (permit) {
    facts.push(`${permit.is_roof ? "roof" : permit.aptype || "other"} permit open ${Number(permit.days_open ?? 0).toLocaleString()} days`);
    facts.push(permit.contractor_name
      ? `contractor on that permit ${permit.contractor_name}, ${permit.license_status ? `Delaware license name match, valid to ${String(permit.license_valid_to).slice(0, 10)}` : "no Delaware license name match"}`
      : "no contractor printed on that permit");
  }
  if (lead.last_roof_contractor_name) {
    facts.push(`last roof contractor ${lead.last_roof_contractor_name}, ${lead.last_roof_license_status ? `Delaware license name match, valid to ${String(lead.last_roof_license_valid_to).slice(0, 10)}` : "no Delaware license name match"}`);
  }
  return facts;
}

async function retrieve(question) {
  const text = question.toLowerCase();
  const city = Object.keys(CITIES).find((name) => text.includes(name)) || "wilmington";
  const [lat, lon] = CITIES[city];
  const radius = Number((text.match(/(\d+(?:\.\d+)?)\s*mile/) || [0, 5])[1]);
  const age = Number((text.match(/older than\s+(\d+)/) || text.match(/(\d+)\s*years/) || [0, 15])[1]);
  const openOnly = text.includes("permit") || text.includes("contractor");
  const area = await loadArea(lat, lon, radius);
  const roofOnly = text.includes("roof");
  const leads = rowsFor(openOnly ? "permits" : "roofs", { lat, lon, radius, minAge: age, roofOnly }, area.leads, area.byParcel);
  const rows = leads.slice(0, 8).map((lead) => {
    const open = (area.byParcel.get(lead.prclid) || []).filter((item) => item.permit_status === "open");
    const permit = open.find((item) => item.is_roof) || open[0];
    return {
      source: "published-lead",
      prclid: lead.prclid,
      address: lead.address.replace(/\s+/g, " "),
      city: lead.city,
      distance_miles: Number(lead.distance_miles.toFixed(2)),
      roof_age_years: lead.roof_age_years,
      roof_age_basis: lead.roof_age_basis,
      open_permit_count: lead.open_permit_count,
      open_roof_permit_count: lead.open_roof_permit_count,
      newest_open_days: lead.newest_open_days,
      oldest_open_days: lead.oldest_open_days,
      permit: permit
        ? { apno: permit.apno, issued_on: permit.issued_on, days_open: permit.days_open, is_roof: permit.is_roof, contractor_name: permit.contractor_name, aptype: permit.aptype, comments: permit.comments, license_category: permit.license_category, license_status: permit.license_status, license_valid_to: permit.license_valid_to }
        : null,
      last_roof_contractor_name: lead.last_roof_contractor_name,
      last_roof_contractor_basis: lead.last_roof_contractor_name ? "closed or new-construction roof permit, not the open permit" : null,
      last_roof_license_category: lead.last_roof_license_category,
      last_roof_license_status: lead.last_roof_license_status,
      last_roof_license_valid_to: lead.last_roof_license_valid_to,
      facts: leadFacts(lead, permit),
    };
  });
  return {
    city,
    radius,
    matchCount: leads.length,
    evidence: [
      { source: "retrieval", city, radius_miles: radius, open_only: openOnly, min_roof_age: openOnly ? null : age, match_count: leads.length, shown_count: rows.length },
      ...rows.map((row) => ({ source: row.source, prclid: row.prclid, address: row.address, city: row.city, distance_miles: row.distance_miles, facts: row.facts })),
      ...CITATIONS.map((text) => ({ source: "citation", text })),
    ],
  };
}

function sourcesHtml(retrieved) {
  const parcels = retrieved.evidence.filter((item) => item.prclid)
    .map((lead) => `<li>${escapeHtml(lead.address)}, ${escapeHtml(lead.city)} · parcel ${lead.prclid}</li>`).join("");
  const notes = CITATIONS.map((text) => `<p>${text}</p>`).join("");
  return `<details class="sources"><summary>Sources and limits</summary><ul>${parcels}</ul>${notes}</details>`;
}

document.querySelectorAll("[data-prompt]").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.getElementById("question").value = chip.dataset.prompt;
    document.getElementById("ask-form").requestSubmit();
  });
});

document.getElementById("question").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    document.getElementById("ask-form").requestSubmit();
  }
});

function focusAsk() {
  const box = document.getElementById("question");
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  box.focus();
  box.select();
}
document.getElementById("open-ask").addEventListener("click", focusAsk);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    focusAsk();
  }
  if (event.key === "Escape" && document.getElementById("drawer").classList.contains("open")) closeDrawer();
});

document.getElementById("ask-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = document.getElementById("question").value.trim();
  if (!question) return;
  const box = document.getElementById("answer");
  const send = document.querySelector("#ask-form .send");
  send.disabled = true;
  box.innerHTML = `<div class="response thinking"><span class="spark"></span><div><p class="response-body">Loading published parcels for this question…</p></div></div>`;
  let retrieved;
  try {
    retrieved = await retrieve(question);
  } catch (error) {
    box.innerHTML = `<div class="response"><span class="spark"></span><div><p class="response-body">Published data did not load (${escapeHtml(error.message)}).</p></div></div>`;
    send.disabled = false;
    return;
  }
  box.innerHTML = `<div class="response thinking"><span class="spark"></span><div><p class="response-body">Reading ${retrieved.matchCount} matching parcels within ${retrieved.radius} miles of ${retrieved.city}…</p></div></div>`;
  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, evidence: retrieved.evidence }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The model request failed.");
    box.innerHTML = `<div class="response"><span class="spark"></span><div>
      <p class="response-body">${escapeHtml(payload.answer).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
      <p class="response-meta">${retrieved.matchCount} published parcels matched within ${retrieved.radius} miles of ${retrieved.city}; the model read the first ${Math.min(8, retrieved.matchCount)} · ${escapeHtml(payload.model)}</p>
      ${sourcesHtml(retrieved)}</div></div>`;
  } catch (error) {
    box.innerHTML = `<div class="response"><span class="spark"></span><div>
      <p class="response-body">The model call failed (${escapeHtml(error.message)}). The parcels it would have used are listed below.</p>
      ${sourcesHtml(retrieved).replace("<details", "<details open")}</div></div>`;
  } finally {
    send.disabled = false;
  }
});

run();

const appsButton = document.querySelector(".apps-button");
const appsMenu = document.getElementById("apps-menu");
appsMenu.querySelectorAll("a").forEach((link) => {
  if (link.dataset.app === document.body.dataset.app) link.setAttribute("aria-current", "page");
});
appsButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = appsMenu.hidden;
  appsMenu.hidden = !open;
  appsButton.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".apps")) {
    appsMenu.hidden = true;
    appsButton.setAttribute("aria-expanded", "false");
  }
});
