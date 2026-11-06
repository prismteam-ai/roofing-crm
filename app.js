const FILES = {
  leads: "https://ipfs.filebase.io/ipfs/bafybeif7pt7mppcl2vzfekhcmt3locjegapjwvpmjb4azl3mn5avzwdxky",
  permits: "https://ipfs.filebase.io/ipfs/bafybeiarmwqsbi2z2hexbdtf7qq62scakz464uduyqv33im4cfegthapdi",
};
const CITIES = {
  wilmington: [39.739072, -75.539787],
  newark: [39.683723, -75.749657],
  hockessin: [39.790669, -75.704647],
  middletown: [39.449556, -75.716321],
  bear: [39.629279, -75.658261],
  "new castle": [39.662039, -75.566313],
};
const state = { leads: [], permits: [], map: null, layer: null, pin: null };

function miles(lat1, lon1, lat2, lon2) {
  const r = 3958.7613;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dlat = ((lat2 - lat1) * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

function saved() {
  return JSON.parse(localStorage.getItem("roofing-leads") || "[]");
}

function renderSaved() {
  const rows = saved();
  document.getElementById("saved").innerHTML = rows.length
    ? rows.map((lead) => `<div class="lead">${lead.address}, ${lead.city}<br>${lead.prclid}</div>`).join("")
    : "<p>No saved leads.</p>";
}

function search(lat, lon, radius, minAge) {
  return state.leads
    .map((lead) => ({ ...lead, distance_miles: miles(lat, lon, lead.lat, lead.lon) }))
    .filter((lead) => lead.distance_miles <= radius && lead.roof_age_years != null && lead.roof_age_years >= minAge)
    .sort((a, b) => a.distance_miles - b.distance_miles);
}

function draw(leads, lat, lon, radius) {
  if (!state.map) {
    state.map = L.map("map").setView([lat, lon], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(state.map);
    state.map.on("click", (event) => {
      state.pin = [event.latlng.lat, event.latlng.lng];
      document.getElementById("lat").value = event.latlng.lat.toFixed(6);
      document.getElementById("lon").value = event.latlng.lng.toFixed(6);
    });
  }
  if (state.layer) state.layer.remove();
  state.layer = L.layerGroup().addTo(state.map);
  L.circle([lat, lon], { radius: radius * 1609.344, color: "#17211b", weight: 1 }).addTo(state.layer);
  L.marker([lat, lon]).addTo(state.layer);
  leads.slice(0, 150).forEach((lead) => {
    L.circleMarker([lead.lat, lead.lon], { radius: 4, color: "#0f6b4c" }).addTo(state.layer);
  });
}

function render(leads) {
  document.getElementById("count").textContent = `${leads.length} roofs in range`;
  document.getElementById("results").innerHTML = `<table><thead><tr><th>Miles</th><th>Address</th><th>Age</th><th></th></tr></thead><tbody>
    ${leads.slice(0, 40).map((lead) => `<tr>
      <td>${lead.distance_miles.toFixed(2)}</td>
      <td>${lead.address}, ${lead.city}<br>${lead.roof_age_basis || ""}</td>
      <td>${lead.roof_age_years}</td>
      <td><button type="button" data-save="${lead.prclid}">Save lead</button></td>
    </tr>`).join("")}
  </tbody></table>`;
  document.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", () => {
      const lead = leads.find((item) => item.prclid === button.dataset.save);
      const next = saved().filter((item) => item.prclid !== lead.prclid);
      next.unshift({ prclid: lead.prclid, address: lead.address, city: lead.city });
      localStorage.setItem("roofing-leads", JSON.stringify(next.slice(0, 50)));
      renderSaved();
    });
  });
}

function runSearch() {
  const lat = Number(document.getElementById("lat").value);
  const lon = Number(document.getElementById("lon").value);
  const radius = Number(document.getElementById("miles").value);
  const minAge = Number(document.getElementById("min-age").value);
  const leads = search(lat, lon, radius, minAge);
  draw(leads, lat, lon, radius);
  render(leads);
  return leads;
}

document.getElementById("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch();
});
document.getElementById("use-pin").addEventListener("click", () => {
  if (!state.pin) return;
  document.getElementById("lat").value = state.pin[0].toFixed(6);
  document.getElementById("lon").value = state.pin[1].toFixed(6);
  runSearch();
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
      runSearch();
    },
    (error) => {
      status.textContent = error.code === 1
        ? "Location permission was denied. Use the map pin or type coordinates."
        : "Your location could not be read. Use the map pin or type coordinates.";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
});

document.getElementById("ask-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = document.getElementById("question").value.toLowerCase();
  const city = Object.keys(CITIES).find((name) => text.includes(name)) || "wilmington";
  const [lat, lon] = CITIES[city];
  const radius = Number((text.match(/(\d+(?:\.\d+)?)\s*mile/) || [0, 5])[1]);
  const openOnly = text.includes("permit") || text.includes("contractor");
  let leads = state.leads
    .map((lead) => ({ ...lead, distance_miles: miles(lat, lon, lead.lat, lead.lon) }))
    .filter((lead) => lead.distance_miles <= radius);
  if (openOnly) {
    leads = leads.filter((lead) => lead.open_roof_permit_count > 0)
      .sort((a, b) => (b.oldest_open_roof_days || 0) - (a.oldest_open_roof_days || 0));
  } else {
    leads = leads.filter((lead) => lead.roof_age_years >= 15).sort((a, b) => a.distance_miles - b.distance_miles);
  }
  const items = leads.slice(0, 6).map((lead) => {
    const permit = state.permits.find((item) => item.prclid === lead.prclid);
    return `<li>${lead.address}, ${lead.city}: ${lead.distance_miles.toFixed(1)} mi${permit ? `, ${permit.days_open} days, ${permit.contractor_name || "no contractor on the permit"}` : `, roof age ${lead.roof_age_years}`}</li>`;
  }).join("");
  document.getElementById("answer").innerHTML = `<div class="note"><p>${leads.length} matches within ${radius} miles of ${city}, from the published New Castle lead set.</p><ul>${items}</ul><p>BBB ratings are not in the dataset. Contractor names are the text printed on the permit.</p></div>`;
});

Promise.all([
  fetch(FILES.leads).then((response) => response.json()),
  fetch(FILES.permits).then((response) => response.json()),
]).then(([leads, permits]) => {
  state.leads = leads;
  state.permits = permits;
  document.getElementById("status").textContent = `${leads.length.toLocaleString()} lead parcels from the Oracle publish.`;
  renderSaved();
  runSearch();
}).catch(() => {
  document.getElementById("status").textContent = "The Oracle dataset URL did not load.";
});
