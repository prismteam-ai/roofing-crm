const FILES = {
  leads: "https://ipfs.filebase.io/ipfs/bafybeihkejjprhb44k2432wohtkyveuslwpbc6yh7yrzooipeyil4wyqyy",
  permits: "https://ipfs.filebase.io/ipfs/bafybeih5jfqg6a4llcjvjzxpdzd2pkev6afvfxpfgl6o2hh22qk474ibt4",
};
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
  permits: "Open roof permits",
  saved: "Saved leads",
};
const BASIS = {
  "structure.year_built": "from year built",
  latest_roof_permit: "from last roof permit",
};
const BBB_NOTE = "BBB not loaded: bbb.org/robots.txt disallows category pages";
const state = { leads: [], permits: [], map: null, layer: null, pin: null, view: "roofs", rows: [], selected: null };

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
  const next = isSaved ? rest : [{ prclid: lead.prclid, address: lead.address, city: lead.city, saved_at: new Date().toISOString() }, ...rest];
  localStorage.setItem("roofing-leads", JSON.stringify(next.slice(0, 200)));
  return !isSaved;
}

function permitsFor(prclid) {
  return state.permits.filter((permit) => permit.prclid === prclid).sort((a, b) => (b.days_open || 0) - (a.days_open || 0));
}

function filters() {
  return {
    lat: Number(document.getElementById("lat").value),
    lon: Number(document.getElementById("lon").value),
    radius: Number(document.getElementById("miles").value),
    minAge: Number(document.getElementById("min-age").value),
  };
}

function withDistance(lat, lon) {
  return state.leads.map((lead) => ({ ...lead, distance_miles: miles(lat, lon, lead.lat, lead.lon) }));
}

function rowsFor(view, { lat, lon, radius, minAge }) {
  const all = withDistance(lat, lon);
  if (view === "saved") {
    const ids = new Set(saved().map((item) => item.prclid));
    return all.filter((lead) => ids.has(lead.prclid)).sort((a, b) => a.distance_miles - b.distance_miles);
  }
  const near = all.filter((lead) => lead.distance_miles <= radius);
  if (view === "permits") {
    return near.filter((lead) => lead.open_roof_permit_count > 0)
      .sort((a, b) => (b.oldest_open_roof_days || 0) - (a.oldest_open_roof_days || 0));
  }
  return near.filter((lead) => lead.roof_age_years != null && lead.roof_age_years >= minAge)
    .sort((a, b) => a.distance_miles - b.distance_miles);
}

function years(days) {
  return days == null ? null : Math.floor(days / 365.25);
}

function ageCell(lead) {
  if (lead.roof_age_years == null) return `<span class="none">Unknown</span>`;
  return `<span class="age${lead.roof_age_years >= 30 ? " old" : ""}">${lead.roof_age_years}</span><span class="sub">${BASIS[lead.roof_age_basis] || ""}</span>`;
}

function openCell(lead) {
  if (!lead.open_roof_permit_count) return `<span class="none">None open</span>`;
  const y = years(lead.oldest_open_roof_days);
  return `<span class="since">Open ${y >= 1 ? `${y} yr` : `${lead.oldest_open_roof_days} days`}</span>`;
}

function contractorCell(lead) {
  const named = permitsFor(lead.prclid).find((permit) => permit.contractor_name);
  if (named) return `<span class="who">${escapeHtml(named.contractor_name)}</span><span class="sub">On the open permit</span>`;
  if (lead.last_roof_contractor_name) {
    const year = String(lead.last_roof_contractor_issued_at || "").slice(0, 4);
    return `<span class="who">${escapeHtml(lead.last_roof_contractor_name)}</span><span class="sub">Last closed roof permit${year ? ` · ${year}` : ""}</span>`;
  }
  return `<span class="none">${lead.open_roof_permit_count ? "Not printed on permit" : "None on a closed roof permit"}</span>`;
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
    L.circle([lat, lon], { radius: radius * 1609.344, color: "#0b57d0", weight: 1, fillColor: "#d3e3fd", fillOpacity: 0.25 }).addTo(state.layer);
    L.marker([lat, lon]).addTo(state.layer);
  }
  rows.slice(0, 200).forEach((lead) => {
    const color = lead.open_roof_permit_count ? "#d96570" : "#9b72cb";
    L.circleMarker([lead.lat, lead.lon], { radius: 5, color, weight: 1, fillOpacity: 0.85 })
      .bindTooltip(`${lead.address.replace(/\s+/g, " ")}, ${lead.city}`)
      .on("click", () => openDrawer(lead.prclid))
      .addTo(state.layer);
  });
}

function render() {
  const rows = state.rows;
  const shown = Math.min(rows.length, 60);
  const savedIds = new Set(saved().map((item) => item.prclid));
  document.getElementById("view-title").textContent = VIEWS[state.view];
  document.getElementById("count").textContent = rows.length
    ? `${rows.length.toLocaleString()} properties · showing ${shown}${state.view === "permits" ? ", longest open first" : state.view === "roofs" ? ", closest first" : ""}`
    : "";
  document.getElementById("results").innerHTML = rows.length
    ? `<table><thead><tr><th>Property</th><th>Roof age</th><th>Open roof permit</th><th>Contractor</th><th>BBB</th><th></th></tr></thead>
      <tbody>${rows.slice(0, 60).map((lead) => `<tr data-prclid="${lead.prclid}"${state.selected === lead.prclid ? ' class="selected"' : ""}>
        <td><span class="addr">${escapeHtml(lead.address.replace(/\s+/g, " "))}</span><span class="sub">${escapeHtml(lead.city)} · ${lead.distance_miles.toFixed(2)} mi</span></td>
        <td>${ageCell(lead)}</td>
        <td>${openCell(lead)}</td>
        <td>${contractorCell(lead)}</td>
        <td><span class="none" title="${BBB_NOTE}">Not loaded</span></td>
        <td><button type="button" class="save${savedIds.has(lead.prclid) ? " done" : ""}" data-save="${lead.prclid}">${savedIds.has(lead.prclid) ? "Saved" : "Save lead"}</button></td>
      </tr>`).join("")}</tbody></table>`
    : `<p class="empty">${state.view === "saved" ? "Save a property from any view to keep it here." : "No properties match. Try a larger radius or a lower roof age."}</p>`;
}

function updateCounts() {
  const current = filters();
  document.getElementById("n-roofs").textContent = rowsFor("roofs", current).length.toLocaleString();
  document.getElementById("n-permits").textContent = rowsFor("permits", current).length.toLocaleString();
  document.getElementById("n-saved").textContent = saved().length.toLocaleString();
}

function run() {
  const current = filters();
  document.getElementById("age-filter").setAttribute("aria-disabled", String(state.view !== "roofs"));
  state.rows = rowsFor(state.view, current);
  draw(state.rows, current.lat, current.lon, current.radius);
  render();
  updateCounts();
}

function openDrawer(prclid) {
  const lead = state.rows.find((item) => item.prclid === prclid) || state.leads.find((item) => item.prclid === prclid);
  if (!lead) return;
  state.selected = prclid;
  const permits = permitsFor(prclid);
  const isSaved = saved().some((item) => item.prclid === prclid);
  const reason = lead.open_roof_permit_count
    ? `Roof permit open ${years(lead.oldest_open_roof_days)} years`
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
    <section><h3>Open roof permits</h3>${permits.length ? permits.map((permit) => `<div class="permit">
      <strong>Permit ${escapeHtml(permit.apno)}</strong> <span class="since">Open ${permit.days_open?.toLocaleString() ?? "?"} days</span>
      <p>Issued ${escapeHtml((permit.issued_at || "").slice(0, 10))}${permit.aptype ? ` · ${escapeHtml(permit.aptype)}` : ""}</p>
      <p>${escapeHtml(permit.comments || "No description")}</p>
      <p>Contractor: ${permit.contractor_name ? `<span class="who">${escapeHtml(permit.contractor_name)}</span>` : "not printed on this permit"}</p>
    </div>`).join("") : `<p class="muted">No open roof permit on this parcel.</p>`}</section>
    <section><h3>Contractor and BBB</h3><dl class="facts">
      <dt>Last roof contractor</dt><dd>${lead.last_roof_contractor_name ? `${escapeHtml(lead.last_roof_contractor_name)} <span class="sub">Closed or new-construction roof permit${lead.last_roof_contractor_issued_at ? ` · ${escapeHtml(String(lead.last_roof_contractor_issued_at).slice(0, 10))}` : ""}. Not the open-permit contractor.</span>` : "None printed on a closed roof permit"}</dd>
      <dt>Latest county permit</dt><dd>${lead.contractor_name ? `${escapeHtml(lead.contractor_name)} <span class="sub">Any permit type, not only roofing</span>` : "None printed"}</dd>
      <dt>BBB rating</dt><dd>${BBB_NOTE}</dd>
    </dl></section>
    <section><h3>Owner</h3><dl class="facts">
      <dt>Owner location</dt><dd>${lead.owner_out_of_area ? "Mailing address outside the area" : "Local mailing address"}</dd>
    </dl></section>
    <section><h3>Source</h3><dl class="facts">
      <dt>Parcel</dt><dd>${escapeHtml(lead.prclid)}</dd>
      <dt>Coordinates</dt><dd>${lead.lat.toFixed(5)}, ${lead.lon.toFixed(5)}</dd>
      <dt>Lead file</dt><dd><a href="${FILES.leads}" target="_blank" rel="noopener">IPFS CID</a></dd>
      <dt>Permit file</dt><dd><a href="${FILES.permits}" target="_blank" rel="noopener">IPFS CID</a></dd>
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
  const save = event.target.closest("[data-save]");
  if (save) {
    const lead = state.leads.find((item) => item.prclid === save.dataset.save);
    toggleSaved(lead);
    if (state.view === "saved") state.rows = rowsFor("saved", filters());
    render();
    updateCounts();
    if (document.getElementById("drawer").classList.contains("open")) openDrawer(state.selected || lead.prclid);
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
  "Delaware contractor business licenses were read through SODA dataset 5zy2-grhr. Electrical, plumbing, and HVACR licenses were read through SODA dataset pjnv-eaih. The lexicon manifest has no license class, so those rows are not matched to a permit name.",
  "The county open-permit layer has no contractor field. A name on an open permit appears only when that layer prints one. Last roof contractor is the name on the latest closed or new-construction roof permit. It is not the open-permit contractor.",
];

function retrieve(question) {
  const text = question.toLowerCase();
  const city = Object.keys(CITIES).find((name) => text.includes(name)) || "wilmington";
  const [lat, lon] = CITIES[city];
  const radius = Number((text.match(/(\d+(?:\.\d+)?)\s*mile/) || [0, 5])[1]);
  const age = Number((text.match(/older than\s+(\d+)/) || text.match(/(\d+)\s*years/) || [0, 15])[1]);
  const openOnly = text.includes("permit") || text.includes("contractor");
  const leads = rowsFor(openOnly ? "permits" : "roofs", { lat, lon, radius, minAge: age });
  const rows = leads.slice(0, 8).map((lead) => {
    const permit = permitsFor(lead.prclid)[0];
    return {
      source: "published-lead",
      prclid: lead.prclid,
      address: lead.address.replace(/\s+/g, " "),
      city: lead.city,
      distance_miles: Number(lead.distance_miles.toFixed(2)),
      roof_age_years: lead.roof_age_years,
      roof_age_basis: lead.roof_age_basis,
      open_roof_permit_count: lead.open_roof_permit_count,
      oldest_open_roof_days: lead.oldest_open_roof_days,
      permit: permit
        ? { apno: permit.apno, days_open: permit.days_open, contractor_name: permit.contractor_name, aptype: permit.aptype, comments: permit.comments }
        : null,
      last_roof_contractor_name: lead.last_roof_contractor_name,
      last_roof_contractor_basis: lead.last_roof_contractor_name ? "closed or new-construction roof permit, not the open permit" : null,
    };
  });
  return {
    city,
    radius,
    matchCount: leads.length,
    evidence: [
      { source: "retrieval", city, radius_miles: radius, open_only: openOnly, min_roof_age: openOnly ? null : age, match_count: leads.length },
      ...rows,
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
  if (!question || !state.leads.length) return;
  const retrieved = retrieve(question);
  const box = document.getElementById("answer");
  const send = document.querySelector("#ask-form .send");
  send.disabled = true;
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

Promise.all([
  fetch(FILES.leads).then((response) => response.json()),
  fetch(FILES.permits).then((response) => response.json()),
]).then(([leads, permits]) => {
  state.leads = leads;
  state.permits = permits;
  document.getElementById("status").textContent = `${leads.length.toLocaleString()} parcels · ${permits.length} open roof permits · published on IPFS`;
  run();
}).catch(() => {
  document.getElementById("status").textContent = "The Oracle dataset URL did not load.";
});

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
