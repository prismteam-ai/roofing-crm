const ORACLE_DATA = window.ORACLE_DATA_BASE || "./data";
const $ = (id) => document.getElementById(id);
const WC = [39.9607, -75.6055];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

function safeId(id) {
  return /^[A-Za-z0-9:._-]+$/.test(String(id ?? "")) ? String(id) : "";
}

function miles(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = r(b[0] - a[0]);
  const dLng = r(b[1] - a[1]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function parseAgentQuestion(question) {
  const q = question.toLowerCase();
  const asksOpenPermit = q.includes("open") && q.includes("permit");
  const asksAgedRoof =
    !asksOpenPermit && (q.includes("15") || q.includes("older")) && q.includes("roof");
  let minOpenDays = 0;
  if (asksOpenPermit) {
    if (q.includes("many years")) minOpenDays = 365 * 3;
    else if (q.includes("five years") || q.includes("5 years")) minOpenDays = 365 * 5;
    else minOpenDays = 365;
  }
  return {
    radiusMiles: q.includes("five miles") || q.includes("5 miles") ? 5 : Number($("radius")?.value || 5),
    minRoofAgeYears: asksAgedRoof ? 15 : asksOpenPermit ? 0 : Number($("age")?.value || 0),
    openPermitsOnly: asksOpenPermit,
    minOpenDays,
  };
}

function openDuration(permits) {
  const open = permits.filter((p) => p.status === "open");
  return Math.max(0, ...open.map((p) => p.openDurationDays || 0));
}

function proxyAge(p) {
  return p.roofAgeYears ?? p.constructionAgeYears ?? null;
}

const store = { properties: [], permits: [], contractors: [] };
let leads = [];
try {
  const parsed = JSON.parse(localStorage.getItem("roofing-leads") || "[]");
  leads = Array.isArray(parsed) ? parsed : [];
} catch {
  leads = [];
}
let pin = WC.slice();

const map = L.map("map").setView(WC, 12);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles &copy; Esri",
  maxZoom: 16,
}).addTo(map);
const pinIcon = L.divIcon({
  className: "survey-pin",
  html: '<span class="survey-pin-dot"></span>',
  iconSize: [24, 28],
  iconAnchor: [12, 26],
});
const pinMarker = L.marker(pin, { draggable: true, icon: pinIcon }).addTo(map);
pinMarker.on("dragend", () => {
  const ll = pinMarker.getLatLng();
  pin = [ll.lat, ll.lng];
});
map.on("click", (e) => {
  pin = [e.latlng.lat, e.latlng.lng];
  pinMarker.setLatLng(pin);
});
const layer = L.layerGroup().addTo(map);

function saveLeads() {
  localStorage.setItem("roofing-leads", JSON.stringify(leads));
  renderLeads();
}

function visibleLeads() {
  const age = Number($("leadAge")?.value || 0);
  const openOnly = $("leadOpen")?.checked;
  const minDays = Number($("leadMinOpen")?.value || 0);
  const maxMi = Number($("leadRadius")?.value || 0);
  return leads.filter((l) => {
    const roof = l.roofAgeYears ?? l.constructionAgeYears;
    if (age && (roof == null || roof < age)) return false;
    if (openOnly && !l.hasOpen) return false;
    if (minDays && (l.openDays || 0) < minDays) return false;
    if (maxMi && l.lat != null && miles(pin, [l.lat, l.lng]) > maxMi) return false;
    return true;
  });
}

function renderLeads() {
  const rows = visibleLeads();
  $("leads").innerHTML = rows.length
    ? rows
        .map(
          (l) =>
            `<article class="lead">
              <div class="lead-top"><span>${esc(l.upi)}</span><span>saved</span></div>
              <strong class="addr">${esc(l.address)}</strong>
              <div class="chips">
                <span class="chip age">${l.roofAgeYears != null ? "roof" : "land-dev"} ${esc(l.roofAgeYears ?? l.constructionAgeYears ?? "?")}y</span>
                ${l.hasOpen ? `<span class="chip open">open ${esc(l.openDays || "?")}d</span>` : ""}
              </div>
              <button type="button" data-del="${esc(safeId(l.id))}">Remove</button>
            </article>`,
        )
        .join("")
    : `<p class="empty">No saved leads in this filter.</p>`;
  $("leads").onclick = (ev) => {
    const id = ev.target.getAttribute("data-del");
    if (!id) return;
    const i = leads.findIndex((x) => x.id === id);
    if (i >= 0) leads.splice(i, 1);
    saveLeads();
  };
}

function search() {
  const radius = Number($("radius").value);
  const age = Number($("age").value);
  const openOnly = $("open").checked;
  const minOpenDays = Number($("minOpenDays")?.value || 0);
  const byProp = new Map();
  for (const p of store.permits) {
    const arr = byProp.get(p.propertyId) ?? [];
    arr.push(p);
    byProp.set(p.propertyId, arr);
  }
  const allHits = store.properties
    .map((p) => ({
      p,
      d: miles(pin, [p.lat, p.lng]),
      permits: byProp.get(p.propertyId) ?? [],
    }))
    .filter((h) => h.d <= radius)
    .filter((h) => {
      if (age) {
        const years = proxyAge(h.p);
        if (years == null || years < age) return false;
      }
      if (openOnly) {
        return h.permits.some(
          (x) => x.status === "open" && (x.openDurationDays || 0) >= minOpenDays,
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (openOnly) return openDuration(b.permits) - openDuration(a.permits);
      return a.d - b.d;
    });
  const hits = allHits.slice(0, 80);

  layer.clearLayers();
  L.circle(pin, {
    radius: radius * 1609.34,
    color: "#2c5874",
    weight: 1.5,
    fillColor: "#2c5874",
    fillOpacity: 0.06,
  }).addTo(layer);
  hits.forEach((h) => {
    const openN = h.permits.filter((x) => x.status === "open").length;
    L.circleMarker([h.p.lat, h.p.lng], {
      radius: openN ? 6 : 5,
      color: openN ? "#8b2e2e" : "#a85b2a",
      weight: 1.5,
      fillOpacity: 0.85,
    })
      .bindPopup(`${esc(h.p.address)}<br>${esc(h.p.upi)}`)
      .addTo(layer);
  });
  $("hits").innerHTML = hits.length
    ? hits
        .map((h) => {
          const openN = h.permits.filter((x) => x.status === "open").length;
          const id = safeId(h.p.propertyId);
          const years = proxyAge(h.p);
          return `<article class="hit" data-id="${esc(id)}" tabindex="0">
            <div class="hit-top"><span>${esc(h.p.upi)}</span><span>${h.d.toFixed(1)} mi</span></div>
            <strong class="addr">${esc(h.p.address)}</strong>
            <div class="chips">
              <span class="chip age">${h.p.roofAgeYears != null ? "roof" : "land-dev"} ${esc(years ?? "?")}y</span>
              <span class="chip${openN ? " open" : ""}">${openN} open</span>
            </div>
            <button type="button" data-lead="${esc(id)}">Add lead</button>
          </article>`;
        })
        .join("")
    : `<p class="empty">No parcels in this radius with the current filters.</p>`;
  $("hits").onclick = (ev) => {
    const leadId = ev.target.getAttribute("data-lead");
    const hit = ev.target.closest(".hit");
    const id = leadId || hit?.getAttribute("data-id");
    const h = hits.find((x) => x.p.propertyId === id);
    if (!h) return;
    $("hits").querySelectorAll(".hit").forEach((el) => {
      el.classList.toggle("is-on", el.getAttribute("data-id") === id);
    });
    const contractors = store.contractors || [];
    const permitRows = h.permits
      .map((p) => {
        const c = contractors.find((x) => x.contractorId === p.contractorId);
        return `<div class="chips" style="margin:6px 0 0">
          <span class="chip${p.status === "open" ? " open" : ""}">${esc(p.status)} ${esc(p.openDurationDays ?? "?")}d</span>
          <span class="chip">${esc(p.permitType || "permit")}</span>
        </div>
        <div>${esc(p.contractorName ?? "—")} · BBB ${esc(c?.bbbRating ?? c?.bbbScore ?? "n/a")}<br>
        <span class="empty">${esc(p.provenance.sourceId)}</span></div>`;
      })
      .join("");
    $("detail").classList.remove("empty");
    $("detail").innerHTML = `<dl>
      <dt>Address</dt><dd>${esc(h.p.address)}</dd>
      <dt>UPI</dt><dd>${esc(h.p.upi)}</dd>
      <dt>Roof</dt><dd>${esc(h.p.roofAgeYears ?? "?")}y (${esc(h.p.roofAgeBasis)})</dd>
      <dt>Land-dev</dt><dd>${esc(h.p.constructionAgeYears ?? "—")}y</dd>
      <dt>Owner</dt><dd>${esc(h.p.ownerName ?? "—")}</dd>
    </dl>${permitRows || "<p class='empty'>No permits on this parcel.</p>"}`;
    if (!leadId) return;
    if (leads.some((l) => l.id === id)) return;
    leads.push({
      id,
      address: h.p.address,
      upi: h.p.upi,
      roofAgeYears: h.p.roofAgeYears,
      constructionAgeYears: h.p.constructionAgeYears,
      openDays: openDuration(h.permits),
      hasOpen: h.permits.some((p) => p.status === "open"),
      lat: h.p.lat,
      lng: h.p.lng,
      createdAt: new Date().toISOString(),
    });
    saveLeads();
  };
  $("hits").onkeydown = (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const hit = ev.target.closest(".hit");
    if (!hit) return;
    ev.preventDefault();
    hit.click();
  };
  const extra = allHits.length > hits.length ? ` (showing ${hits.length} of ${allHits.length})` : "";
  $("status").textContent = `${allHits.length} matches near pin${extra}`;
  if ($("hud-pin")) $("hud-pin").textContent = `Pin ${pin[0].toFixed(4)}, ${pin[1].toFixed(4)}`;
  if ($("hud-count")) $("hud-count").textContent = `${allHits.length} matches · ${radius} mi`;
}

async function loadJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

async function boot() {
  try {
    store.properties = await loadJson(`${ORACLE_DATA}/properties.json`);
    store.permits = await loadJson(`${ORACLE_DATA}/permits.json`);
  } catch (err) {
    $("status").textContent = `Failed to load Oracle artifacts: ${err}`;
    return;
  }
  try {
    store.contractors = await loadJson(`${ORACLE_DATA}/contractors.json`);
  } catch {
    store.contractors = [];
    $("status").textContent = `${store.properties.length} Oracle properties loaded (contractor file missing)`;
  }
  if (!$("status").textContent.includes("missing")) {
    $("status").textContent = `${store.properties.length} Oracle properties loaded`;
  }
  renderLeads();
  search();
  map.invalidateSize();
}

$("usePin").onclick = search;
$("gps").onclick = () => {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      pin = [pos.coords.latitude, pos.coords.longitude];
      pinMarker.setLatLng(pin);
      map.setView(pin, 12);
      search();
    },
    () => {
      $("status").textContent = "GPS denied; using pin";
    },
  );
};
$("ask").onclick = () => {
  const parsed = parseAgentQuestion($("q").value);
  $("open").checked = parsed.openPermitsOnly;
  $("radius").value = String(parsed.radiusMiles);
  $("age").value = String(parsed.minRoofAgeYears);
  if ($("minOpenDays")) $("minOpenDays").value = String(parsed.minOpenDays);
  search();
  const sample = [...document.querySelectorAll(".hit")].slice(0, 5).map((el) => el.innerText);
  $("agent").textContent = JSON.stringify(
    {
      answer: $("status").textContent,
      assumptions: parsed,
      caveats: [
        "Used Oracle Chester artifacts (not a separate vector store).",
        "Open-permit filter uses county Act 247 / EnerGov / health GIS.",
        "Municipal roofing UCC is not in the public harvest. BBB is n/a without a public bulk API.",
        "Aged-roof matches may use constructionAgeYears (land-dev), which is not a roof age.",
      ],
      evidence: sample,
    },
    null,
    2,
  );
};

$("filterLeads") && ($("filterLeads").onclick = renderLeads);

boot().catch((err) => {
  $("status").textContent = `Boot failed: ${err}`;
});
