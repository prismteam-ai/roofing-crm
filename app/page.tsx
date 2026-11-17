"use client";

import { useCallback, useEffect, useState } from "react";
import { Assistant } from "./components/Assistant";
import { api, type Lead } from "./components/client";
import { Finder } from "./components/Finder";
import { LeadsBoard } from "./components/LeadsBoard";

type View = "finder" | "leads" | "assistant";

/** Parts of a full CRM that this first release does not build. Shown so the product's direction is visible. */
const LATER = [
  { name: "Outreach", about: "Letters, texts and call scripts sent to owners from a lead." },
  { name: "Estimates", about: "Roof measurements and priced quotes attached to a lead." },
  { name: "Scheduling", about: "Inspection and crew calendars." },
  { name: "Invoicing", about: "Deposits, invoices and payments for won jobs." },
  { name: "Team and territories", about: "Reps, assignment rules and service areas." },
  { name: "Reports", about: "Conversion by source, area and contractor." },
];

export default function Page() {
  const [view, setView] = useState<View>("finder");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [later, setLater] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLeads((await api<{ leads: Lead[] }>("/api/leads")).leads);
    } catch {
      // The finder still works without saved leads; the leads screen reports its own errors.
    }
  }, []);
  // Initial load: fetch saved leads once the page is in the browser.
  useEffect(() => {
    let live = true;
    api<{ leads: Lead[] }>("/api/leads")
      .then((result) => live && setLeads(result.leads))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="shell">
      <aside className="nav">
        <h1>Roofing Lead CRM</h1>
        <div className="sub">Miami-Dade County, Florida</div>
        <button className={`item ${view === "finder" ? "active" : ""}`} onClick={() => setView("finder")}>
          Lead finder
        </button>
        <button className={`item ${view === "leads" ? "active" : ""}`} onClick={() => setView("leads")}>
          Leads <span className="soon">{leads.length}</span>
        </button>
        <button className={`item ${view === "assistant" ? "active" : ""}`} onClick={() => setView("assistant")}>
          Assistant
        </button>
        <div className="group">Not in this release</div>
        {LATER.map((item) => (
          <button className="item" key={item.name} disabled aria-label={`${item.name} (not in this release)`} title={item.about} onMouseEnter={() => setLater(item.about)} onMouseLeave={() => setLater(null)}>
            {item.name} <span className="soon">later</span>
          </button>
        ))}
        {later && <div className="sub" style={{ marginTop: 8 }}>{later}</div>}
      </aside>

      <main className="content" style={{ maxWidth: "none", margin: 0 }}>
        {view === "finder" && (
          <>
            <h2>Lead finder</h2>
            <p className="lead">
              Drop a pin or use your location, set a radius, and review properties with aging roofs and roofing permits that were never
              closed out. Roof age comes from a completed roof permit where one exists, otherwise from year built.
            </p>
            <Finder leads={leads} onSaved={refresh} />
          </>
        )}
        {view === "leads" && (
          <>
            <h2>Leads</h2>
            <p className="lead">The properties and permits you chose to pursue. Each keeps the published record it came from.</p>
            <LeadsBoard leads={leads} onChanged={refresh} />
          </>
        )}
        {view === "assistant" && (
          <>
            <h2>Assistant</h2>
            <p className="lead">
              Ask for roofing opportunities in plain language. The assistant retrieves records from the published county data and your saved
              leads, answers from them, and shows what it retrieved.
            </p>
            <Assistant onLeadsChanged={refresh} />
          </>
        )}
      </main>
    </div>
  );
}
