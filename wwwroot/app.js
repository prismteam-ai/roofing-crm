const statusEl = document.querySelector("#status");
const coordsEl = document.querySelector("#coords");
const radiusEl = document.querySelector("#radius");
const radiusValueEl = document.querySelector("#radius-value");
const locateBtn = document.querySelector("#locate-me");
const clearFiltersBtn = document.querySelector("#clear-filters");
const propertyListEl = document.querySelector("#property-list");
const propertyEmptyEl = document.querySelector("#property-empty");
const leadSummaryEl = document.querySelector("#lead-summary");
const filterAgingRoofEl = document.querySelector("#filter-aging-roof");
const filterOpenPermitEl = document.querySelector("#filter-open-permit");
const minRoofAgeEl = document.querySelector("#min-roof-age");
const minRoofAgeValueEl = document.querySelector("#min-roof-age-value");
const minPermitYearsEl = document.querySelector("#min-permit-years");
const minPermitYearsValueEl = document.querySelector("#min-permit-years-value");

const LONG_OPEN_PERMIT_YEARS = 5;

const TRAVIS_COUNTY = {
  name: "Travis County",
  latitude: 30.2672,
  longitude: -97.7431,
  zoom: 11,
};

/** Demo dataset — replaced by API when ingestion is wired. */
const MOCK_PROPERTIES = [
  {
    id: "p1",
    address: "1204 Barton Springs Rd",
    city: "Austin",
    latitude: 30.2634,
    longitude: -97.7712,
    roofAgeYears: 22,
    permitOpen: true,
    permitOpenYears: 6,
    permitStatus: "Open",
    contractorName: "Lone Star Roofing LLC",
    bbbRating: "B+",
  },
  {
    id: "p2",
    address: "810 E 41st St",
    city: "Austin",
    latitude: 30.2981,
    longitude: -97.7265,
    roofAgeYears: 18,
    permitOpen: false,
    permitOpenYears: 0,
    permitStatus: "Closed",
    contractorName: "—",
    bbbRating: "—",
  },
  {
    id: "p3",
    address: "4517 Avenue G",
    city: "Austin",
    latitude: 30.3068,
    longitude: -97.7341,
    roofAgeYears: 12,
    permitOpen: true,
    permitOpenYears: 3,
    permitStatus: "Open",
    contractorName: "Capitol City Roof Co.",
    bbbRating: "A-",
  },
  {
    id: "p4",
    address: "2300 E 7th St",
    city: "Austin",
    latitude: 30.2612,
    longitude: -97.7148,
    roofAgeYears: 25,
    permitOpen: false,
    permitOpenYears: 0,
    permitStatus: "—",
    contractorName: "—",
    bbbRating: "—",
  },
  {
    id: "p5",
    address: "9901 Brodie Ln",
    city: "Austin",
    latitude: 30.2124,
    longitude: -97.8401,
    roofAgeYears: 16,
    permitOpen: true,
    permitOpenYears: 8,
    permitStatus: "Open",
    contractorName: "Hill Country Exteriors",
    bbbRating: "C",
  },
  {
    id: "p6",
    address: "711 W 23rd St",
    city: "Austin",
    latitude: 30.2888,
    longitude: -97.7435,
    roofAgeYears: 8,
    permitOpen: false,
    permitOpenYears: 0,
    permitStatus: "—",
    contractorName: "—",
    bbbRating: "—",
  },
  {
    id: "p7",
    address: "5205 Brodie Ln",
    city: "Austin",
    latitude: 30.2245,
    longitude: -97.835,
    roofAgeYears: 14,
    permitOpen: true,
    permitOpenYears: 7,
    permitStatus: "Open",
    contractorName: "Summit Shield Roofing",
    bbbRating: "B",
  },
];

const DEFAULT_FILTERS = {
  radiusMiles: 5,
  includeAgingRoof: true,
  minRoofAgeYears: 15,
  includeOpenPermit: true,
  minPermitOpenYears: 0,
};

const searchState = {
  latitude: TRAVIS_COUNTY.latitude,
  longitude: TRAVIS_COUNTY.longitude,
  radiusMiles: DEFAULT_FILTERS.radiusMiles,
};

const leadCriteria = { ...DEFAULT_FILTERS };

let map;
let searchMarker;
let searchCircle;
let propertyLayer;
let selectedLeadId = null;
let currentCandidates = [];
let ragPropertyFilter = null;

function setStatus(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function formatCoords(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function updateFilterLabels() {
  if (radiusValueEl && radiusEl) {
    radiusValueEl.textContent = `${radiusEl.value} mi`;
  }
  if (minRoofAgeValueEl && minRoofAgeEl) {
    minRoofAgeValueEl.textContent = `${minRoofAgeEl.value} yr`;
  }
  if (minPermitYearsValueEl && minPermitYearsEl) {
    minPermitYearsValueEl.textContent = `${minPermitYearsEl.value} yr`;
  }
}

function updateCoordsDisplay() {
  if (coordsEl) {
    coordsEl.textContent = formatCoords(searchState.latitude, searchState.longitude);
  }
  updateFilterLabels();
}

function milesToMeters(miles) {
  return miles * 1609.344;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function matchesAgingRoof(property) {
  return property.roofAgeYears >= leadCriteria.minRoofAgeYears;
}

function matchesOpenPermit(property) {
  return (
    property.permitOpen &&
    property.permitOpenYears >= leadCriteria.minPermitOpenYears
  );
}

function matchesLeadCriteria(property) {
  const signals = [];
  if (leadCriteria.includeAgingRoof && matchesAgingRoof(property)) {
    signals.push("aging");
  }
  if (leadCriteria.includeOpenPermit && matchesOpenPermit(property)) {
    signals.push("permit");
  }
  if (!leadCriteria.includeAgingRoof && !leadCriteria.includeOpenPermit) {
    return { match: false, signals: [] };
  }
  return { match: signals.length > 0, signals };
}

function leadPriority(property, signals) {
  let score = 0;
  if (signals.includes("permit")) {
    score += 1000 + property.permitOpenYears * 10;
    if (property.permitOpenYears >= LONG_OPEN_PERMIT_YEARS) {
      score += 200;
    }
  }
  if (signals.includes("aging")) {
    score += 100 + property.roofAgeYears;
  }
  return score;
}

function readLeadCriteriaFromUi() {
  leadCriteria.includeAgingRoof = filterAgingRoofEl?.checked ?? true;
  leadCriteria.includeOpenPermit = filterOpenPermitEl?.checked ?? true;
  leadCriteria.minRoofAgeYears = Number(minRoofAgeEl?.value ?? 15);
  leadCriteria.minPermitOpenYears = Number(minPermitYearsEl?.value ?? 0);
}

function propertiesInRadius() {
  return MOCK_PROPERTIES.filter(
    (p) =>
      haversineMiles(
        searchState.latitude,
        searchState.longitude,
        p.latitude,
        p.longitude
      ) <= searchState.radiusMiles
  );
}

function leadSignalsForProperty(property) {
  const signals = [];
  if (property.roofAgeYears >= leadCriteria.minRoofAgeYears) signals.push("aging");
  if (property.permitOpen && property.permitOpenYears >= leadCriteria.minPermitOpenYears) {
    signals.push("permit");
  }
  return signals;
}

function getLeadCandidates() {
  if (ragPropertyFilter) {
    return propertiesInRadius()
      .filter((p) => ragPropertyFilter.has(p.id))
      .map((p) => ({
        property: p,
        match: true,
        signals: leadSignalsForProperty(p),
        priority: leadPriority(p, leadSignalsForProperty(p)),
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  return propertiesInRadius()
    .map((p) => {
      const { match, signals } = matchesLeadCriteria(p);
      return { property: p, match, signals, priority: leadPriority(p, signals) };
    })
    .filter((row) => row.match)
    .sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      const distA = haversineMiles(
        searchState.latitude,
        searchState.longitude,
        a.property.latitude,
        a.property.longitude
      );
      const distB = haversineMiles(
        searchState.latitude,
        searchState.longitude,
        b.property.latitude,
        b.property.longitude
      );
      return distA - distB;
    });
}

function statusForSearch(sourceLabel) {
  const candidates = getLeadCandidates().length;
  const inRadius = propertiesInRadius().length;
  const src = sourceLabel ? `${sourceLabel} · ` : "";
  setStatus(
    `${TRAVIS_COUNTY.name} · ${src}${searchState.radiusMiles} mi · ${candidates} lead${candidates === 1 ? "" : "s"} (${inRadius} in radius)`
  );
}

function setSearchCenter(lat, lng, { pan = true, source = "map" } = {}) {
  searchState.latitude = lat;
  searchState.longitude = lng;

  if (searchMarker) {
    searchMarker.setLatLng([lat, lng]);
  }

  if (searchCircle) {
    searchCircle.setLatLng([lat, lng]);
  }

  updateCoordsDisplay();
  refreshLeads();

  const sourceLabel =
    source === "gps" ? "GPS" : source === "pin" ? "dropped pin" : null;
  statusForSearch(sourceLabel);

  if (pan && map) {
    map.panTo([lat, lng]);
  }
}

function refreshSearchCircle() {
  if (!searchCircle) {
    return;
  }
  searchCircle.setRadius(milesToMeters(searchState.radiusMiles));
}

function markerStyleForLead(property, signals) {
  const stalled =
    signals.includes("permit") &&
    property.permitOpenYears >= LONG_OPEN_PERMIT_YEARS;
  const dual = signals.includes("aging") && signals.includes("permit");

  if (dual && stalled) {
    return {
      radius: 9,
      color: "#9a3412",
      fillColor: "#ea580c",
      weight: 3,
    };
  }
  if (stalled) {
    return {
      radius: 8,
      color: "#b45309",
      fillColor: "#f59e0b",
      weight: 2,
    };
  }
  if (signals.includes("permit")) {
    return {
      radius: 7,
      color: "#b45309",
      fillColor: "#fcd34d",
      weight: 2,
    };
  }
  return {
    radius: 7,
    color: "#44403c",
    fillColor: "#78716c",
    weight: 2,
  };
}

function hasDetail(value) {
  return Boolean(value && value !== "—");
}

function bbbBadgeHtml(rating) {
  if (!hasDetail(rating)) {
    return '<span class="bbb bbb--na">Not available</span>';
  }
  return `<span class="bbb">${rating}</span>`;
}

function leadDetailHtml(property, distanceMi, signals) {
  const permitOpen = property.permitOpen;
  const permitStatus = permitOpen
    ? `${property.permitStatus} · ${property.permitOpenYears} yr open`
    : hasDetail(property.permitStatus)
      ? property.permitStatus
      : "No open roofing permit";
  const signalText = [
    signals.includes("aging") ? "Aging roof" : "",
    signals.includes("permit") ? "Open permit" : "",
  ]
    .filter(Boolean)
  .join(" · ") || "—";

  return `
    <header class="detail-head">
      <h3 class="detail-address">${property.address}</h3>
      <p class="detail-sub">${property.city} · ${distanceMi.toFixed(1)} mi from search center</p>
      <div class="detail-badges">${leadBadgesHtml(property, signals)}</div>
    </header>
    <section class="detail-block">
      <h4 class="detail-kicker">Property</h4>
      <dl class="detail-dl">
        <div><dt>Roof age (est.)</dt><dd>${property.roofAgeYears} years</dd></div>
        <div><dt>Lead signals</dt><dd>${signalText}</dd></div>
      </dl>
    </section>
    <section class="detail-block">
      <h4 class="detail-kicker">Permit</h4>
      <dl class="detail-dl">
        <div><dt>Status</dt><dd>${permitStatus}</dd></div>
        ${
          permitOpen
            ? `<div><dt>Open duration</dt><dd>${property.permitOpenYears} year${property.permitOpenYears === 1 ? "" : "s"}</dd></div>`
            : ""
        }
      </dl>
    </section>
    <section class="detail-block">
      <h4 class="detail-kicker">Contractor</h4>
      <dl class="detail-dl">
        <div><dt>Name</dt><dd>${hasDetail(property.contractorName) ? property.contractorName : "Not available"}</dd></div>
        <div><dt>BBB rating</dt><dd>${bbbBadgeHtml(property.bbbRating)}</dd></div>
      </dl>
    </section>
    <footer class="detail-actions">
      <button type="button" class="btn-popup" data-add-crm data-property-id="${property.id}">Save to CRM</button>
    </footer>
  `;
}

function propertyPopupHtml(property, distanceMi, signals) {
  return `<div class="lead-popup">${leadDetailHtml(property, distanceMi, signals)}</div>`;
}

function focusLead(property, signals, distanceMi, { pan = false, openPopup = false } = {}) {
  selectedLeadId = property.id;
  propertyListEl?.querySelectorAll(".property-item").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.id === property.id);
  });
  if (pan && map) {
    map.setView([property.latitude, property.longitude], Math.max(map.getZoom(), 15));
  }
  if (openPopup) {
    propertyLayer?.eachLayer((layer) => {
      if (layer.propertyId === property.id) {
        layer.openPopup();
      }
    });
  }
}

function leadBadgesHtml(property, signals) {
  const parts = [];
  if (signals.includes("aging")) {
    parts.push('<span class="badge badge-age">Aging roof</span>');
  }
  if (signals.includes("permit")) {
    const cls =
      property.permitOpenYears >= LONG_OPEN_PERMIT_YEARS
        ? "badge badge-stalled"
        : "badge badge-permit";
    const label =
      property.permitOpenYears >= LONG_OPEN_PERMIT_YEARS
        ? `Stalled ${property.permitOpenYears} yr`
        : "Open permit";
    parts.push(`<span class="${cls}">${label}</span>`);
  }
  return parts.join(" ");
}

function updateLeadSummary(candidates, inRadius) {
  if (!leadSummaryEl) {
    return;
  }
  const stalled = candidates.filter(
    (c) => c.property.permitOpenYears >= LONG_OPEN_PERMIT_YEARS
  ).length;
  leadSummaryEl.textContent = `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} · ${inRadius} propert${inRadius === 1 ? "y" : "ies"} in radius${stalled ? ` · ${stalled} long-open permit${stalled === 1 ? "" : "s"}` : ""}`;
}

function renderPropertyList(rows) {
  if (!propertyListEl || !propertyEmptyEl) {
    return;
  }

  propertyListEl.innerHTML = "";

  if (rows.length === 0) {
    propertyEmptyEl.hidden = false;
    return;
  }

  propertyEmptyEl.hidden = true;

  for (const { property, signals } of rows) {
    const distanceMi = haversineMiles(
      searchState.latitude,
      searchState.longitude,
      property.latitude,
      property.longitude
    );
    const li = document.createElement("li");
    li.innerHTML = `
      <button type="button" class="property-item" data-id="${property.id}">
        <span class="property-address">${property.address}</span>
        <span class="property-meta">${distanceMi.toFixed(1)} mi · roof ${property.roofAgeYears} yr ${leadBadgesHtml(property, signals)}</span>
      </button>
    `;
    li.querySelector("button").addEventListener("click", () => {
      focusLead(property, signals, distanceMi, { pan: true, openPopup: true });
    });
    propertyListEl.appendChild(li);
  }
}

function refreshLeads() {
  if (!propertyLayer) {
    return;
  }

  readLeadCriteriaFromUi();
  propertyLayer.clearLayers();

  const inRadius = propertiesInRadius();
  const candidates = getLeadCandidates();
  currentCandidates = candidates;
  updateLeadSummary(candidates, inRadius.length);

  if (selectedLeadId && !candidates.some((c) => c.property.id === selectedLeadId)) {
    selectedLeadId = null;
  }

  for (const { property, signals } of candidates) {
    const distanceMi = haversineMiles(
      searchState.latitude,
      searchState.longitude,
      property.latitude,
      property.longitude
    );
    const style = markerStyleForLead(property, signals);
    const marker = L.circleMarker([property.latitude, property.longitude], {
      ...style,
      fillOpacity: 0.9,
    })
      .bindPopup(propertyPopupHtml(property, distanceMi, signals), { maxWidth: 320 })
      .addTo(propertyLayer);
    marker.propertyId = property.id;
    marker.on("popupopen", () => {
      focusLead(property, signals, distanceMi);
      const saved = window.CrmLeads?.isPropertySaved(property.id);
      const btn = marker.getPopup()?.getElement()?.querySelector("[data-add-crm]");
      if (btn) {
        btn.disabled = Boolean(saved);
        btn.textContent = saved ? "In CRM" : "Save to CRM";
      }
    });
  }

  renderPropertyList(candidates);
}

function onCriteriaChange() {
  if (ragPropertyFilter) {
    ragPropertyFilter = null;
    window.MapLeads?.clearAskAiSearch?.({ clearPrompt: false });
  }

  searchState.radiusMiles = Number(radiusEl?.value ?? searchState.radiusMiles);
  updateCoordsDisplay();
  refreshSearchCircle();
  refreshLeads();
  statusForSearch(null);
}

function resetFiltersToDefault() {
  if (radiusEl) radiusEl.value = String(DEFAULT_FILTERS.radiusMiles);
  if (filterAgingRoofEl) filterAgingRoofEl.checked = DEFAULT_FILTERS.includeAgingRoof;
  if (minRoofAgeEl) minRoofAgeEl.value = String(DEFAULT_FILTERS.minRoofAgeYears);
  if (filterOpenPermitEl) filterOpenPermitEl.checked = DEFAULT_FILTERS.includeOpenPermit;
  if (minPermitYearsEl) minPermitYearsEl.value = String(DEFAULT_FILTERS.minPermitOpenYears);

  selectedLeadId = null;
  ragPropertyFilter = null;
  window.MapLeads?.clearAskAiSearch?.({ clearPrompt: true });
  searchMarker?.closePopup();
  map?.closePopup();

  setSearchCenter(TRAVIS_COUNTY.latitude, TRAVIS_COUNTY.longitude, { pan: false });
  if (map) {
    map.setView([TRAVIS_COUNTY.latitude, TRAVIS_COUNTY.longitude], TRAVIS_COUNTY.zoom);
  }

  onCriteriaChange();
}

function onLocateClick() {
  if (!navigator.geolocation) {
    setStatus("GPS is not available in this browser.");
    return;
  }

  setStatus("Requesting your location…");
  locateBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locateBtn.disabled = false;
      setSearchCenter(pos.coords.latitude, pos.coords.longitude, {
        pan: true,
        source: "gps",
      });
      map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 14));
    },
    (err) => {
      locateBtn.disabled = false;
      const messages = {
        1: "Location permission denied. Drop a pin on the map instead.",
        2: "Location unavailable. Try again or drop a pin.",
        3: "Location request timed out. Try again or drop a pin.",
      };
      setStatus(messages[err.code] || "Could not read GPS position.");
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

function loadMap() {
  const container = document.getElementById("map");

  if (!container || typeof L === "undefined") {
    setStatus("Map could not load. Check the network connection and refresh.");
    return;
  }

  map = L.map(container, {
    zoomControl: true,
    scrollWheelZoom: true,
  }).setView([TRAVIS_COUNTY.latitude, TRAVIS_COUNTY.longitude], TRAVIS_COUNTY.zoom);
  if (window.MapLeads) window.MapLeads.map = map;

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  searchMarker = L.marker([searchState.latitude, searchState.longitude], {
    draggable: true,
    title: "Search center — drag or click the map to move",
  })
    .addTo(map)
    .bindPopup("Search center<br><small>Drag me or click the map</small>");

  searchCircle = L.circle([searchState.latitude, searchState.longitude], {
    radius: milesToMeters(searchState.radiusMiles),
    color: "#b45309",
    fillColor: "#f59e0b",
    fillOpacity: 0.08,
    weight: 2,
    dashArray: "6 4",
  }).addTo(map);

  propertyLayer = L.layerGroup().addTo(map);

  searchMarker.on("dragend", () => {
    const { lat, lng } = searchMarker.getLatLng();
    setSearchCenter(lat, lng, { pan: false, source: "pin" });
  });

  map.on("click", (e) => {
    setSearchCenter(e.latlng.lat, e.latlng.lng, { pan: false, source: "pin" });
    searchMarker.openPopup();
  });

  map.whenReady(() => {
    map.invalidateSize();
    updateCoordsDisplay();
    refreshLeads();
    statusForSearch(null);
  });

  window.addEventListener("resize", () => map.invalidateSize());
}

const criteriaInputs = [
  radiusEl,
  filterAgingRoofEl,
  filterOpenPermitEl,
  minRoofAgeEl,
  minPermitYearsEl,
];

for (const el of criteriaInputs) {
  if (el) {
    el.addEventListener("input", onCriteriaChange);
    el.addEventListener("change", onCriteriaChange);
  }
}

if (locateBtn) {
  locateBtn.addEventListener("click", onLocateClick);
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener("click", resetFiltersToDefault);
}

function focusPropertiesByIds(propertyIds, { fitBounds = false, openPopup = false } = {}) {
  if (!map || !propertyIds?.length) return;

  const properties = propertyIds
    .map((id) => MOCK_PROPERTIES.find((p) => p.id === id))
    .filter(Boolean);

  if (!properties.length) return;

  if (fitBounds || properties.length > 1) {
    map.fitBounds(
      L.latLngBounds(properties.map((p) => [p.latitude, p.longitude])),
      { padding: [48, 48], maxZoom: 14 }
    );
  } else {
    const p = properties[0];
    map.setView([p.latitude, p.longitude], Math.max(map.getZoom(), 14));
  }

  for (const property of properties) {
    if (openPopup) {
      propertyLayer?.eachLayer((layer) => {
        if (layer.propertyId === property.id) layer.openPopup();
      });
    }
    const row = window.MapLeads.getCandidateByPropertyId(property.id);
    if (row) {
      focusLead(property, row.signals, haversineMiles(
        searchState.latitude,
        searchState.longitude,
        property.latitude,
        property.longitude
      ), { pan: false, openPopup: false });
    }
  }
}

function clearRagPropertyFilter() {
  ragPropertyFilter = null;
  refreshLeads();
}

function applyRagSearchResults(propertyIds) {
  if (!Array.isArray(propertyIds)) {
    ragPropertyFilter = null;
  } else if (propertyIds.length === 0) {
    ragPropertyFilter = new Set();
  } else {
    ragPropertyFilter = new Set(propertyIds);
  }
  refreshLeads();
  if (propertyIds?.length) {
    focusPropertiesByIds(propertyIds, {
      fitBounds: propertyIds.length > 1,
      openPopup: true,
    });
  }
}

window.MapLeads = {
  map: null,
  getCandidateByPropertyId(id) {
    return currentCandidates.find((row) => row.property.id === id);
  },
  getSearchState() {
    readLeadCriteriaFromUi();
    searchState.radiusMiles = Number(radiusEl?.value ?? searchState.radiusMiles);
    return { ...searchState };
  },
  focusPropertiesByIds,
  applyRagSearchResults,
  clearRagPropertyFilter,
};

loadMap();