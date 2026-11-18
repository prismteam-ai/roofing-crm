const CRM_STATUSES = ["New", "Contacted", "Qualified", "Won", "Lost"];

const crmUi = {
  list: document.querySelector("#crm-lead-list"),
  empty: document.querySelector("#crm-empty"),
  panel: document.querySelector("#crm-panel"),
  open: document.querySelector("#crm-drawer-open"),
  close: document.querySelector("#crm-drawer-close"),
};

function setCrmDrawerOpen(open) {
  if (!crmUi.panel) {
    return;
  }
  crmUi.panel.classList.toggle("is-open", open);
  crmUi.open?.setAttribute("aria-expanded", String(open));
  if (crmUi.open) {
    crmUi.open.hidden = open;
  }
  window.setTimeout(() => window.dispatchEvent(new Event("resize")), 260);
}

crmUi.open?.addEventListener("click", () => setCrmDrawerOpen(true));
crmUi.close?.addEventListener("click", () => setCrmDrawerOpen(false));

let crmLeads = [];
let savedPropertyIds = new Set();
const expandedCrmIds = new Set();

async function fetchCrmLeads() {
  const response = await fetch("/api/leads");
  if (!response.ok) {
    throw new Error("Could not load CRM leads.");
  }
  crmLeads = await response.json();
  savedPropertyIds = new Set(crmLeads.map((l) => l.propertyId));
}

function notifyStatus(message) {
  const status = document.querySelector("#status");
  if (status) {
    status.textContent = message;
  }
}

function toCreatePayload(property, signals) {
  return {
    propertyId: property.id,
    address: property.address,
    city: property.city,
    latitude: property.latitude,
    longitude: property.longitude,
    roofAgeYears: property.roofAgeYears,
    permitOpen: property.permitOpen,
    permitOpenYears: property.permitOpenYears,
    permitStatus: property.permitStatus,
    contractorName: property.contractorName,
    bbbRating: property.bbbRating,
    leadSignals: signals,
  };
}

function updateDrawerTabBadge() {
  const badge = document.querySelector("#crm-drawer-count");
  if (!badge) {
    return;
  }
  if (crmLeads.length === 0) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.textContent = String(crmLeads.length);
  badge.setAttribute("aria-label", `${crmLeads.length} saved leads`);
}

function renderCrmLeads() {
  if (!crmUi.list || !crmUi.empty) {
    return;
  }

  updateDrawerTabBadge();
  crmUi.list.replaceChildren();

  if (crmLeads.length === 0) {
    crmUi.empty.hidden = false;
    return;
  }

  crmUi.empty.hidden = true;

  for (const lead of crmLeads) {
    const li = document.createElement("li");
    li.className = "crm-item";
    const statusOptions = CRM_STATUSES.map(
      (s) => `<option value="${s}"${lead.status === s ? " selected" : ""}>${s}</option>`
    ).join("");

    const isExpanded = expandedCrmIds.has(lead.id);
    li.classList.toggle("is-expanded", isExpanded);

    li.innerHTML = `
      <div class="crm-item__head">
        <button
          type="button"
          class="crm-item__toggle"
          data-crm-toggle="${lead.id}"
          aria-expanded="${isExpanded}"
          aria-controls="crm-body-${lead.id}"
        >
          <span class="crm-item__chevron" aria-hidden="true"></span>
          <span class="crm-item__title">${lead.address}</span>
        </button>
        <button type="button" class="btn-icon" data-crm-delete="${lead.id}" title="Delete lead" aria-label="Delete lead">×</button>
      </div>
      <div id="crm-body-${lead.id}" class="crm-item__body" ${isExpanded ? "" : "hidden"}>
        <p class="crm-item__meta">${lead.city} · roof ${lead.roofAgeYears} yr</p>
        <label class="crm-item__field">
          <span>Status</span>
          <select class="crm-status" data-crm-id="${lead.id}">${statusOptions}</select>
        </label>
        <label class="crm-item__field crm-item__field--notes">
          <span>Notes</span>
          <textarea class="crm-notes" data-crm-id="${lead.id}" rows="2" placeholder="Outreach notes…">${lead.notes ?? ""}</textarea>
        </label>
        <button type="button" class="btn-save-crm" data-crm-save="${lead.id}">Save changes</button>
      </div>
    `;
    crmUi.list.append(li);
  }
}

async function refreshCrmLeads() {
  try {
    await fetchCrmLeads();
    renderCrmLeads();
    window.dispatchEvent(new CustomEvent("crm:refreshed", { detail: { propertyIds: [...savedPropertyIds] } }));
  } catch {
    notifyStatus("Could not load saved CRM leads.");
  }
}

async function createCrmLead(property, signals) {
  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toCreatePayload(property, signals)),
    });

    if (response.status === 409) {
      const body = await response.json().catch(() => ({}));
      notifyStatus(body.error ?? "This property is already saved as a CRM lead.");
      await refreshCrmLeads();
      return;
    }

    if (!response.ok) {
      throw new Error("Create failed");
    }

    notifyStatus(`Saved CRM lead for ${property.address}.`);
    await refreshCrmLeads();
    setCrmDrawerOpen(true);
  } catch {
    notifyStatus("Could not save CRM lead. Try again.");
  }
}

async function updateCrmLead(id, patch) {
  const body = {};
  if (patch.status !== undefined) {
    body.status = patch.status;
  }
  if (patch.notes !== undefined) {
    body.notes = patch.notes;
  }

  const response = await fetch(`/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    notifyStatus("Could not update CRM lead.");
    return false;
  }

  notifyStatus("CRM lead updated.");
  await refreshCrmLeads();
  return true;
}

async function deleteCrmLead(id) {
  const response = await fetch(`/api/leads/${id}`, { method: "DELETE" });
  if (!response.ok) {
    notifyStatus("Could not delete CRM lead.");
    return;
  }

  expandedCrmIds.delete(id);
  notifyStatus("CRM lead removed.");
  await refreshCrmLeads();
}

function isPropertySaved(propertyId) {
  return savedPropertyIds.has(propertyId);
}

crmUi.list?.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-crm-toggle]");
  if (toggle) {
    const item = toggle.closest(".crm-item");
    const body = item?.querySelector(".crm-item__body");
    if (!item || !body) {
      return;
    }
    const willOpen = body.hidden;
    body.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
    item.classList.toggle("is-expanded", willOpen);
    if (willOpen) {
      expandedCrmIds.add(toggle.dataset.crmToggle);
    } else {
      expandedCrmIds.delete(toggle.dataset.crmToggle);
    }
    return;
  }

  const saveBtn = event.target.closest("[data-crm-save]");
  if (saveBtn) {
    const item = saveBtn.closest(".crm-item");
    const status = item?.querySelector(".crm-status")?.value;
    const notes = item?.querySelector(".crm-notes")?.value ?? "";
    saveBtn.disabled = true;
    updateCrmLead(saveBtn.dataset.crmSave, { status, notes }).finally(() => {
      saveBtn.disabled = false;
    });
    return;
  }

  const btn = event.target.closest("[data-crm-delete]");
  if (!btn) {
    return;
  }
  event.stopPropagation();
  deleteCrmLead(btn.dataset.crmDelete);
});

document.getElementById("map")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-add-crm]");
  if (!btn) {
    return;
  }
  const row = window.MapLeads?.getCandidateByPropertyId(btn.dataset.propertyId);
  if (row) {
    createCrmLead(row.property, row.signals);
  }
});

window.CrmLeads = {
  refresh: refreshCrmLeads,
  createFromProperty: createCrmLead,
  isPropertySaved,
};

refreshCrmLeads();