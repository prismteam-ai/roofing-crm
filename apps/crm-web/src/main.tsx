import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import {
  CONTRACT_VERSION,
  LeadSchema,
  PropertySchema,
  SearchResponseSchema,
  type Lead,
  type Property,
  type QueryInput,
  type SearchResponse,
} from "../../../packages/contracts/src/index";
import {
  milesToMeters,
  OAKLAND_CENTER,
  queryFromUrl,
  queryToUrl,
} from "../../../packages/map-domain/src/index";
import {
  OracleHealthSchema,
  type OracleHealth,
} from "../../../packages/oracle-client/src/index";
import type { AgentAnswer } from "../../../packages/agent/src/index";
import { FieldMap } from "../../../packages/ui/src/FieldMap";
import {
  propertyEvidence,
  permitOpenDays,
  oldestOpenRoofDays as openDays,
} from "../../../packages/map-domain/src/signals";
let apiSessionGeneration = 0;
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const requestSessionGeneration = apiSessionGeneration;
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const data = (await response.json()) as T & { message?: string };
  if (
    response.status === 401 &&
    requestSessionGeneration === apiSessionGeneration &&
    !(path === "/api/session" && init?.method === "POST")
  )
    window.dispatchEvent(new Event("prism-session-expired"));
  if (!response.ok) throw new Error(data.message ?? "Request unavailable");
  return data;
}
const session = () => {
  let value = localStorage.getItem("prism-demo-session");
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem("prism-demo-session", value);
  }
  return value;
};
const age = (p: Property) =>
  p.roof.ageYears === null ? "Unknown" : `${p.roof.ageYears} years`;
const basis = (p: Property) =>
  ({
    completed_roof: "Completed roof evidence",
    completed_construction: "Construction evidence",
    built_year: "Built-year proxy",
    unknown: "Age unavailable",
  })[p.roof.basis];
function App() {
  const [query, setQuery] = useState<QueryInput>(() =>
    queryFromUrl(location.search),
  );
  const [health, setHealth] = useState<
    (OracleHealth & { accessMode?: string; provider?: string }) | null
  >(null);
  const [ready, setReady] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [needsAccess, setNeedsAccess] = useState(false);
  const [bootError, setBootError] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSnapshot, setSelectedSnapshot] = useState("");
  const [selected, setSelected] = useState<Property | null>(null);
  const [placing, setPlacing] = useState(false);
  const [gps, setGps] = useState("");
  const [basemap, setBasemap] = useState(true);
  const [view, setView] = useState<"opportunities" | "leads">("opportunities");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [prompt, setPrompt] = useState(
    "Show me open permits older than five years within five miles",
  );
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [sid, setSid] = useState(session);
  const seq = useRef(0),
    sessionGeneration = useRef(0),
    activeSession = useRef(false),
    bootstrapGeneration = useRef(0),
    detailGeneration = useRef(0),
    leadGeneration = useRef(0),
    agentGeneration = useRef(0);
  const [signingOut, setSigningOut] = useState(false);
  const sameSession = (generation: number) =>
    activeSession.current && generation === sessionGeneration.current;
  const closeDetail = () => {
    detailGeneration.current++;
    setSelected(null);
    setSelectedSnapshot("");
  };
  const endSession = () => {
    apiSessionGeneration++;
    sessionGeneration.current++;
    bootstrapGeneration.current++;
    seq.current++;
    leadGeneration.current++;
    agentGeneration.current++;
    activeSession.current = false;
    closeDetail();
    setReady(false);
    setNeedsAccess(true);
    setResult(null);
    setLeads([]);
    setAnswer(null);
    setAgentError("");
    setAgentBusy(false);
    setStatus("");
    setNote("");
    setError("");
    setAccessCode("");
    setPlacing(false);
    setGps("");
    setView("opportunities");
  };
  const beginSession = (id: string) => {
    apiSessionGeneration++;
    sessionGeneration.current++;
    seq.current++;
    detailGeneration.current++;
    leadGeneration.current++;
    agentGeneration.current++;
    activeSession.current = true;
    setSid(id);
    setNeedsAccess(false);
    setReady(true);
  };
  const synthetic =
    health?.mode === "synthetic" || health?.mode === "local-fixture";
  const connect = async () => {
    const generation = ++bootstrapGeneration.current,
      epoch = sessionGeneration.current;
    setBootError("");
    try {
      const raw = await api<
        OracleHealth & { accessMode?: string; provider?: string }
      >("/api/health");
      if (
        generation !== bootstrapGeneration.current ||
        epoch !== sessionGeneration.current
      )
        return;
      const status = {
        ...OracleHealthSchema.parse(raw),
        accessMode: raw.accessMode,
        provider: raw.provider,
      };
      setHealth(status);
      let id = sid;
      if (status.accessMode === "review-session") {
        try {
          const current = await api<{ session: { id: string } }>(
            "/api/session",
          );
          if (
            generation !== bootstrapGeneration.current ||
            epoch !== sessionGeneration.current
          )
            return;
          id = current.session.id;
        } catch {
          if (generation === bootstrapGeneration.current) setNeedsAccess(true);
          return;
        }
      }
      if (
        generation !== bootstrapGeneration.current ||
        epoch !== sessionGeneration.current
      )
        return;
      setQuery(queryFromUrl(location.search, status.snapshotId));
      beginSession(id);
    } catch (error) {
      if (
        generation === bootstrapGeneration.current &&
        epoch === sessionGeneration.current
      )
        setBootError((error as Error).message);
    }
  };
  useEffect(() => {
    void connect();
    const expired = () => endSession();
    window.addEventListener("prism-session-expired", expired);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", escape);
    return () => {
      endSession();
      window.removeEventListener("prism-session-expired", expired);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  const unlock = async () => {
    if (signingOut) return;
    const generation = ++bootstrapGeneration.current,
      epoch = sessionGeneration.current;
    try {
      const current = await api<{ session: { id: string } }>("/api/session", {
        method: "POST",
        body: JSON.stringify({ accessCode }),
      });
      if (
        generation !== bootstrapGeneration.current ||
        epoch !== sessionGeneration.current
      )
        return;
      setAccessCode("");
      setQuery(queryFromUrl(location.search, health?.snapshotId));
      beginSession(current.session.id);
    } catch (error) {
      if (
        generation === bootstrapGeneration.current &&
        epoch === sessionGeneration.current
      )
        setBootError((error as Error).message);
    }
  };
  const signOut = async () => {
    endSession();
    setSigningOut(true);
    try {
      await api("/api/session", { method: "DELETE" });
    } catch {
      /* Local state remains closed even when revocation cannot be confirmed. */
    } finally {
      setSigningOut(false);
    }
  };
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selected) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    detailRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [selected?.id]);
  const refreshLeads = async () => {
    if (!activeSession.current) return;
    const epoch = sessionGeneration.current,
      current = ++leadGeneration.current;
    const rows = await api<unknown[]>(
      "/api/leads?sessionId=" + encodeURIComponent(sid),
    );
    if (sameSession(epoch) && current === leadGeneration.current)
      setLeads(rows.map((value) => LeadSchema.parse(value)));
  };
  useEffect(() => {
    if (!ready) return;
    const epoch = sessionGeneration.current;
    void refreshLeads().catch(() => {
      if (sameSession(epoch))
        setStatus("Lead service unavailable. Start the local CRM API.");
    });
  }, [ready, sid]);
  useEffect(() => {
    if (!ready) return;
    const current = ++seq.current,
      epoch = sessionGeneration.current;
    setResult(null);
    closeDetail();
    setAnswer(null);
    setAgentError("");
    setLoading(true);
    setError("");
    history.replaceState(null, "", queryToUrl(query));
    const timer = setTimeout(() => {
      void api<unknown>("/api/search", {
        method: "POST",
        body: JSON.stringify(query),
      })
        .then((data) => {
          if (!sameSession(epoch) || current !== seq.current) return;
          const parsed = SearchResponseSchema.parse(data);
          setResult(parsed);
        })
        .catch((e) => {
          if (sameSession(epoch) && current === seq.current)
            setError((e as Error).message);
        })
        .finally(() => {
          if (sameSession(epoch) && current === seq.current) setLoading(false);
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [query, ready]);
  const update = (fields: Partial<QueryInput>) => {
    if (!activeSession.current) return;
    seq.current++;
    closeDetail();
    setQuery((q) => ({ ...q, ...fields, cursor: undefined }));
  };
  const choose = (p: Property, snapshotId = query.snapshotId) => {
    if (!activeSession.current) return;
    detailGeneration.current++;
    setSelectedSnapshot(snapshotId);
    setSelected(p);
    setStatus("");
    setNote("");
  };
  const pin = (lat: number, lng: number) => {
    update({ lat, lng });
    setPlacing(false);
    setGps("Search center updated from map pin.");
  };
  const useGps = () => {
    const epoch = sessionGeneration.current;
    setGps("Requesting location…");
    if (!navigator.geolocation) {
      setGps("Location unavailable. Place a pin instead.");
      setPlacing(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!sameSession(epoch)) return;
        pin(p.coords.latitude, p.coords.longitude);
        setGps("Search centered on your location.");
      },
      () => {
        if (!sameSession(epoch)) return;
        setGps("Location denied or unavailable. Place a pin instead.");
        setPlacing(true);
      },
      { timeout: 8000, maximumAge: 0 },
    );
  };
  const createLead = async (p: Property) => {
    const epoch = sessionGeneration.current,
      detail = detailGeneration.current;
    if (!sameSession(epoch)) return;
    try {
      await api<Lead>("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          sessionId: sid,
          propertyId: p.id,
          snapshotId: selectedSnapshot || query.snapshotId,
          idempotencyKey: `${p.id}:${selectedSnapshot || query.snapshotId}`,
        }),
      });
      if (!sameSession(epoch)) return;
      await refreshLeads();
      if (sameSession(epoch) && detail === detailGeneration.current)
        setStatus("Lead saved. It will remain after refresh.");
    } catch (e) {
      if (sameSession(epoch) && detail === detailGeneration.current)
        setStatus((e as Error).message);
    }
  };
  const updateLead = async (
    lead: Lead,
    change: { status?: Lead["status"]; note?: string },
  ) => {
    const epoch = sessionGeneration.current,
      detail = detailGeneration.current;
    if (!sameSession(epoch)) return;
    try {
      await api<Lead>(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          sessionId: sid,
          id: lead.id,
          expectedVersion: lead.version,
          ...change,
        }),
      });
      if (!sameSession(epoch)) return;
      await refreshLeads();
      if (sameSession(epoch) && detail === detailGeneration.current) {
        setNote("");
        setStatus("Lead updated.");
      }
    } catch (e) {
      if (!sameSession(epoch)) return;
      if (detail === detailGeneration.current) setStatus((e as Error).message);
      await refreshLeads().catch(() => undefined);
    }
  };
  const ask = async () => {
    const generation = seq.current,
      epoch = sessionGeneration.current,
      current = ++agentGeneration.current;
    if (!sameSession(epoch)) return;
    setAgentBusy(true);
    setAgentError("");
    try {
      const next = await api<AgentAnswer>("/api/agent", {
        method: "POST",
        body: JSON.stringify({ prompt, query }),
      });
      if (
        sameSession(epoch) &&
        generation === seq.current &&
        current === agentGeneration.current
      )
        setAnswer(next);
    } catch (e) {
      if (
        sameSession(epoch) &&
        generation === seq.current &&
        current === agentGeneration.current
      )
        setAgentError((e as Error).message);
    } finally {
      if (sameSession(epoch) && current === agentGeneration.current)
        setAgentBusy(false);
    }
  };
  const reviewLead = async (lead: Lead) => {
    const epoch = sessionGeneration.current,
      current = ++detailGeneration.current,
      queryGeneration = seq.current;
    if (!sameSession(epoch)) return;
    setSelected(null);
    try {
      const property = PropertySchema.parse(
        await api<unknown>(
          `/api/properties/${encodeURIComponent(lead.propertyId)}?snapshotId=${encodeURIComponent(lead.snapshotId)}`,
        ),
      );
      if (
        !sameSession(epoch) ||
        current !== detailGeneration.current ||
        queryGeneration !== seq.current
      )
        return;
      if (property.id !== lead.propertyId)
        throw new Error(
          "Property detail identity does not match the saved lead",
        );
      choose(property, lead.snapshotId);
    } catch (error) {
      if (
        sameSession(epoch) &&
        current === detailGeneration.current &&
        queryGeneration === seq.current
      )
        setStatus((error as Error).message);
    }
  };
  const selectedLead = leads.find(
    (x) => x.propertyId === selected?.id && x.snapshotId === selectedSnapshot,
  );
  return (
    <div
      className="app-shell"
      data-snapshot-id={query.snapshotId}
      data-query-hash={result?.queryHash ?? ""}
      data-query-generation={seq.current}
      data-mode={synthetic ? "synthetic" : "real-public"}
    >
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Prism Roofing CRM">
          <span className="brand-mark">P</span>
          <div>
            prism<span>ROOFING INTELLIGENCE</span>
          </div>
        </a>
        <div className="workspace">
          <span className="workspace-icon">O</span>
          <div>
            Oakland workspace<small>Michigan · evidence workspace</small>
          </div>
        </div>
        <p className="nav-heading">WORKSPACE</p>
        <nav aria-label="Main navigation">
          <button
            className={view === "opportunities" ? "active" : ""}
            onClick={() => {
              closeDetail();
              setView("opportunities");
            }}
          >
            <span>◈</span> Opportunities
          </button>
          <button
            className={view === "leads" ? "active" : ""}
            onClick={() => {
              closeDetail();
              setView("leads");
              const epoch = sessionGeneration.current;
              void refreshLeads().catch((error) => {
                if (sameSession(epoch)) setStatus((error as Error).message);
              });
            }}
          >
            <span>▤</span> Leads <b>{leads.length}</b>
          </button>
          <p className="nav-heading">COMING NEXT</p>
          <button disabled>
            <span>◌</span> Campaigns <small>Soon</small>
          </button>
          <button disabled>
            <span>◇</span> Automations <small>Soon</small>
          </button>
          <button disabled>
            <span>▥</span> Reporting <small>Soon</small>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="connected">
            <i /> Oracle data connected
          </div>
          <p>
            Snapshot-bound decisions.
            <br />
            Source-backed opportunities.
          </p>
          <a
            href={
              import.meta.env.VITE_ORACLE_STUDIO_URL ?? "http://127.0.0.1:4173"
            }
            target="_blank"
            rel="noreferrer"
          >
            Open Oracle Studio ↗
          </a>
          <div className="demo-account">
            <span>LO</span>
            <div>
              Review operator
              <small>
                {health?.accessMode === "review-session"
                  ? "Signed review session"
                  : "Isolated local session"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            Workspace <span>/</span>{" "}
            {view === "opportunities" ? "Opportunities" : "Lead workspace"}
          </div>
          <div className="topbar-right">
            <span className="fixture-badge">
              {synthetic ? "SYNTHETIC DEMO" : "REAL PUBLIC EVIDENCE"}
            </span>
            {health?.accessMode === "review-session" && ready && (
              <button className="text-button" onClick={() => void signOut()}>
                Sign out
              </button>
            )}
            <span className="avatar">LO</span>
          </div>
        </header>
        <section className="page-head">
          <div>
            <p className="eyebrow">OAKLAND COUNTY, MICHIGAN</p>
            <h1>
              {view === "opportunities"
                ? "Find the right roofs."
                : "Keep good opportunities moving."}
            </h1>
            <p className="subtitle">
              {view === "opportunities"
                ? "Explore evidence, qualify opportunities, and build your next route."
                : "Your selected properties, saved locally with a clear decision history."}
            </p>
          </div>
          <span className="snapshot-pill">
            <i /> {query.snapshotId}
            <small>
              Contract {CONTRACT_VERSION} ·{" "}
              {health?.provider === "bedrock-converse"
                ? "Bedrock adapter"
                : "deterministic provider"}
            </small>
          </span>
        </section>
        {!ready && (
          <section
            className="error-banner"
            role={bootError ? "alert" : "status"}
          >
            {needsAccess ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void unlock();
                }}
              >
                <h2>Open the review workspace</h2>
                <label>
                  Review access code{" "}
                  <input
                    type="password"
                    autoComplete="off"
                    aria-label="Review access code"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                  />
                </label>
                <button
                  className="button primary"
                  type="submit"
                  disabled={signingOut}
                >
                  Open workspace
                </button>
              </form>
            ) : (
              <p>{bootError || "Connecting to the active Oracle snapshot…"}</p>
            )}
            {bootError && (
              <p>
                {bootError}
                <button onClick={() => void connect()}>Retry connection</button>
              </p>
            )}
          </section>
        )}
        {ready &&
          (view === "opportunities" ? (
            <>
              <section className="search-toolbar" aria-label="Search filters">
                <div className="search-context">
                  <span className="location-glyph">⌖</span>
                  <div>
                    <b>Oakland County</b>
                    <span>
                      {query.lat.toFixed(4)}, {query.lng.toFixed(4)}
                    </span>
                  </div>
                </div>
                <label>
                  Search radius
                  <select
                    aria-label="Search radius"
                    value={(query.radiusMeters / 1609.344).toFixed(0)}
                    onChange={(e) =>
                      update({
                        radiusMeters: milesToMeters(Number(e.target.value)),
                      })
                    }
                  >
                    {[1, 3, 5, 10, 20].map((n) => (
                      <option key={n} value={n}>
                        {n} miles
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button secondary" onClick={useGps}>
                  ⌖ Use GPS
                </button>
                <button
                  className={`button ${placing ? "primary" : "secondary"}`}
                  onClick={() => setPlacing((v) => !v)}
                >
                  Place pin
                </button>
                <button
                  className="icon-button"
                  aria-label="Move pin east"
                  title="Move pin east"
                  onClick={() => pin(query.lat, query.lng + 0.02)}
                >
                  →
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery({
                      ...queryFromUrl("", query.snapshotId),
                      ...OAKLAND_CENTER,
                    });
                    setGps("");
                    setPlacing(false);
                  }}
                >
                  Reset
                </button>
              </section>
              {gps && (
                <p className="inline-status" role="status">
                  {gps}
                </p>
              )}
              <section className="filter-row">
                <div className="filter-group">
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={query.roofMinAgeYears !== undefined}
                      onChange={(e) =>
                        update({
                          roofMinAgeYears: e.target.checked ? 15 : undefined,
                        })
                      }
                    />
                    Filter by roof age
                  </label>
                  <label className="compact-label">
                    Roof age
                    <input
                      aria-label="Roof age"
                      type="number"
                      min="0"
                      max="150"
                      disabled={query.roofMinAgeYears === undefined}
                      value={query.roofMinAgeYears ?? 15}
                      onChange={(e) =>
                        update({ roofMinAgeYears: Number(e.target.value) })
                      }
                    />
                    <span>years +</span>
                  </label>
                </div>
                <label>
                  Permit status
                  <select
                    aria-label="Permit status"
                    value={query.permitStatus ?? "any"}
                    onChange={(e) =>
                      update({
                        permitStatus: e.target
                          .value as QueryInput["permitStatus"],
                      })
                    }
                  >
                    <option value="any">Any status</option>
                    <option value="open">Open permits</option>
                    <option value="closed">Closed permits</option>
                  </select>
                </label>
                <label>
                  Minimum open days
                  <input
                    aria-label="Minimum open days"
                    type="number"
                    min="0"
                    max="50000"
                    value={query.minOpenDays ?? 0}
                    onChange={(e) =>
                      update({ minOpenDays: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Evidence confidence
                  <select
                    aria-label="Evidence confidence"
                    value={query.minConfidence ?? "any"}
                    onChange={(e) =>
                      update({
                        minConfidence: e.target
                          .value as QueryInput["minConfidence"],
                      })
                    }
                  >
                    <option value="any">All confidence levels</option>
                    <option value="high">High only</option>
                    <option value="medium">Medium or higher</option>
                    <option value="low">Known evidence</option>
                  </select>
                </label>
                <label>
                  Owner region
                  <select
                    aria-label="Owner region"
                    value={query.ownerRegion ?? "any"}
                    onChange={(e) =>
                      update({
                        ownerRegion: e.target
                          .value as QueryInput["ownerRegion"],
                      })
                    }
                  >
                    <option value="any">Any evidence state</option>
                    <option value="regional">Regional</option>
                    <option value="out_of_area">Out of area</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    aria-label="Filter by ownership duration"
                    checked={query.minOwnershipYears !== undefined}
                    onChange={(e) =>
                      update({
                        minOwnershipYears: e.target.checked ? 10 : undefined,
                      })
                    }
                  />
                  Ownership duration
                </label>
                <label>
                  Minimum ownership years
                  <input
                    aria-label="Minimum ownership years"
                    type="number"
                    min="0"
                    max="200"
                    disabled={query.minOwnershipYears === undefined}
                    value={query.minOwnershipYears ?? 10}
                    onChange={(e) =>
                      update({ minOwnershipYears: Number(e.target.value) })
                    }
                  />
                </label>
              </section>
              <section className="results-heading">
                <div>
                  <h2>
                    Explore opportunities <span>{result?.total ?? "—"}</span>
                  </h2>
                  <p data-testid="query-identity">
                    {result
                      ? `Snapshot ${result.snapshotId} · query ${result.queryHash}`
                      : `Search generation ${seq.current} pending`}
                    <br />
                    {result?.truncated
                      ? `Showing ${result.rows.length} of ${result.total}; refine filters. No hidden map matches.`
                      : "Map and list use the same snapshot and filters."}
                  </p>
                </div>
                <div className="map-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={basemap}
                      onChange={(e) => setBasemap(e.target.checked)}
                    />
                    Map context
                  </label>
                  <span>
                    <i className="legend-dot" /> Property{" "}
                    <i className="legend-dot permit" /> Open permit
                  </span>
                </div>
              </section>
              {result && result.limitations.length > 0 && (
                <details className="coverage-note">
                  <summary>Coverage and evidence limitations</summary>
                  {result.limitations.map((limitation, index) => (
                    <p key={index}>{limitation}</p>
                  ))}
                </details>
              )}
              {error && (
                <div className="error-banner" role="alert">
                  {error}{" "}
                  <button onClick={() => setQuery((q) => ({ ...q }))}>
                    Retry search
                  </button>
                </div>
              )}
              <div className="explore-grid">
                <FieldMap
                  query={query}
                  rows={result?.rows ?? []}
                  selected={selected?.id ?? null}
                  placing={placing}
                  onPin={pin}
                  onSelect={choose}
                  basemap={basemap}
                  synthetic={synthetic}
                />
                <section
                  className="property-list"
                  aria-label="Matching properties"
                >
                  <div className="list-header">
                    <span>
                      {loading
                        ? "Updating search…"
                        : `${result?.rows.length ?? 0} properties displayed`}
                    </span>
                    <span>Distance ↑</span>
                  </div>
                  {!loading && !result?.rows.length && !error ? (
                    <div className="empty-state">
                      <span>⌖</span>
                      <h3>No matches in this search</h3>
                      <p>
                        Widen the radius or adjust age and permit filters.
                        Missing evidence is never treated as zero.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() =>
                          update({
                            roofMinAgeYears: undefined,
                            permitStatus: "any",
                            minOpenDays: 0,
                          })
                        }
                      >
                        Clear opportunity filters
                      </button>
                    </div>
                  ) : (
                    result?.rows.map((p) => (
                      <button
                        key={p.id}
                        data-property-id={p.id}
                        data-testid="property-row"
                        className={`property-card ${selected?.id === p.id ? "selected" : ""}`}
                        onClick={() => choose(p)}
                      >
                        <div className="property-card-head">
                          <span className={`usage ${p.usage}`}>{p.usage}</span>
                          <span>
                            {(p.distanceMeters / 1609.344).toFixed(1)} mi ↗
                          </span>
                        </div>
                        <h3>{p.address}</h3>
                        <span className="property-id">{p.id}</span>
                        <div className="card-signals">
                          <div>
                            <span>Roof evidence</span>
                            <strong>{age(p)}</strong>
                          </div>
                          <div>
                            <span>Open permits</span>
                            <strong>
                              {
                                p.permits.filter(
                                  (x) =>
                                    x.status === "open" && x.kind !== "other",
                                ).length
                              }
                            </strong>
                          </div>
                        </div>
                        <div className="card-footer">
                          <span className={`confidence ${p.roof.confidence}`}>
                            {p.roof.confidence === "unknown"
                              ? "Unknown age"
                              : `${p.roof.confidence} confidence`}
                          </span>
                          <span>
                            {openDays(p) !== null
                              ? `${openDays(p)?.toLocaleString()} days open`
                              : "No known open duration"}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </section>
              </div>
              <section className="agent-panel">
                <div className="agent-title">
                  <span className="agent-glyph">✧</span>
                  <div>
                    <h2>Ask your evidence assistant</h2>
                    <p>Turn a question into the same typed property search.</p>
                  </div>
                  <span className="offline-label">
                    DETERMINISTIC · NO INFERENCE
                  </span>
                </div>
                <div className="agent-input">
                  <input
                    aria-label="Agent prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void ask();
                    }}
                  />
                  <button
                    className="button primary"
                    onClick={() => void ask()}
                    disabled={agentBusy || loading || !result}
                  >
                    {agentBusy ? "Retrieving…" : "Ask agent"} ↗
                  </button>
                </div>
                {agentError && (
                  <p role="alert" className="agent-error">
                    {agentError}
                  </p>
                )}
                {answer && (
                  <div
                    className="agent-answer"
                    data-testid="agent-answer"
                    aria-live="polite"
                  >
                    <p>{answer.answer}</p>
                    <div className="agent-result-links">
                      {answer.results.slice(0, 6).map((p) => (
                        <button key={p.id} onClick={() => choose(p)}>
                          {p.address} ↗
                        </button>
                      ))}
                    </div>
                    <details>
                      <summary>
                        {answer.citations.length} source citations · inspect
                        retrieval trace
                      </summary>
                      <code>
                        {answer.citations.join(" · ") ||
                          "No matching source records"}
                      </code>
                      <pre>{JSON.stringify(answer.toolTrace, null, 2)}</pre>
                    </details>
                    <p className="caveat">{answer.caveats.join(" ")}</p>
                  </div>
                )}
              </section>
              <div className="page-foot">
                <span>
                  Source-backed decisions, with uncertainty kept visible.
                </span>
                <span>
                  {synthetic
                    ? "Synthetic fixture · separate from real data"
                    : "Official public evidence · coverage limitations apply"}
                </span>
              </div>
            </>
          ) : (
            <section className="leads-board" aria-label="Saved leads">
              <div className="leads-title">
                <h2>
                  Saved opportunities <span>{leads.length}</span>
                </h2>
                <span>
                  {health?.accessMode === "review-session"
                    ? "Session-bound storage"
                    : "Local SQLite"}{" "}
                  · refresh-safe
                </span>
              </div>
              {!leads.length ? (
                <div className="empty-state">
                  <h3>Your next lead starts on the map</h3>
                  <p>
                    Select a property, review its evidence, then create a lead.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => {
                      closeDetail();
                      setView("opportunities");
                    }}
                  >
                    Explore opportunities
                  </button>
                </div>
              ) : (
                leads.map((l) => (
                  <article className="saved-lead" key={l.id}>
                    <div>
                      <span className="eyebrow">{l.snapshotId}</span>
                      <h3>{l.propertyId}</h3>
                      <p>
                        {l.events.length} recorded events · version {l.version}
                      </p>
                    </div>
                    <label>
                      Lead status
                      <select
                        aria-label={`Lead status ${l.propertyId}`}
                        value={l.status}
                        onChange={(e) =>
                          void updateLead(l, {
                            status: e.target.value as Lead["status"],
                          })
                        }
                      >
                        <option value="new">New</option>
                        <option value="qualified">Qualified</option>
                        <option value="contacted">
                          Contacted (record only)
                        </option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                    <button
                      className="button secondary"
                      onClick={() => void reviewLead(l)}
                    >
                      Review evidence
                    </button>
                  </article>
                ))
              )}
            </section>
          ))}
        {status && (
          <div className="toast" role="status">
            {status}
          </div>
        )}
      </main>
      {ready && selected && (
        <aside
          ref={detailRef}
          role="dialog"
          aria-modal="false"
          className="detail-drawer"
          data-testid="property-detail"
          aria-label="Property detail"
        >
          <div className="detail-top">
            <span className="eyebrow">PROPERTY EVIDENCE</span>
            <button
              className="close-button"
              aria-label="Close property detail"
              onClick={closeDetail}
            >
              ×
            </button>
          </div>
          <span className={`usage ${selected.usage}`}>{selected.usage}</span>
          <h2>{selected.address}</h2>
          <p className="detail-id">
            {selected.id} · {selected.nativeId} · {selectedSnapshot}
          </p>
          <div className="detail-main-signal">
            <span>Estimated roof age</span>
            <strong>{age(selected)}</strong>
            <span className={`confidence ${selected.roof.confidence}`}>
              {selected.roof.confidence} confidence
            </span>
          </div>
          <p className="basis">
            {basis(selected)} · as of {selected.roof.asOf}
          </p>
          <p className="caveat">
            {selected.roof.caveats.join(" ") ||
              "Evidence anchor is not a physical roof inspection."}
          </p>
          <h3 className="section-label">PERMITS & CONTRACTORS</h3>
          {selected.permits.length ? (
            selected.permits.map((p) => (
              <div className="permit-detail" key={p.id}>
                <div className="permit-line">
                  <b>{p.id}</b>
                  <span className={`permit-state ${p.status}`}>{p.status}</span>
                </div>
                <p>
                  {p.kind.replaceAll("_", " ")} · opened{" "}
                  {p.openedAt ?? "date unavailable"}
                </p>
                <p>
                  Closed {p.closedAt ?? "not recorded"} · open duration{" "}
                  {permitOpenDays(p, selected.roof.asOf) !== null
                    ? `${permitOpenDays(p, selected.roof.asOf)} days`
                    : "unknown / not open roofing work"}
                </p>
                <b>
                  {p.contractor.reportedName ?? "Contractor name unavailable"}
                </b>
                <small>
                  {p.contractor.verifiedCompanyId
                    ? "Official company edge: " + p.contractor.verifiedCompanyId
                    : "Source-reported name · official identity unresolved"}
                </small>
                <small>
                  License: {p.contractor.license ?? "unavailable"} · Rating:{" "}
                  {p.contractor.rating === null
                    ? "unavailable"
                    : `${p.contractor.rating}/100 (synthetic score)`}
                </small>
              </div>
            ))
          ) : (
            <p className="caveat">
              No permit evidence in this snapshot. This does not prove the
              absence of permits.
            </p>
          )}
          <h3 className="section-label">OWNERSHIP & IDENTITY</h3>
          <p className="caveat">
            Transfer: {selected.ownership.lastTransferDate ?? "unavailable"} ·
            historical coverage {selected.ownership.historyCoverage}. Region:{" "}
            {selected.ownership.ownerRegion.replaceAll("_", " ")}. No owner
            contacts are displayed.
          </p>
          {selected.ownership.events &&
            selected.ownership.events.length > 0 && (
              <>
                <h3 className="section-label">
                  REPORTED OWNERSHIP EVENTS · PARTIAL
                </h3>
                {selected.ownership.events.map((event) => (
                  <p className="caveat" key={event.id}>
                    {event.kind.replaceAll("_", " ")} · {event.date} ·{" "}
                    {event.id}
                  </p>
                ))}
                <p className="caveat">
                  A source-reported sale event is a partial observation. It does
                  not establish current ownership tenure or complete transfer
                  history.
                </p>
              </>
            )}
          <p className="caveat">
            {selected.parcelIds.length} parcel association(s) ·{" "}
            {selected.coordinates
              ? "Source position available"
              : "No geometry available"}
          </p>
          {selected.siteAddresses && (
            <>
              <h3 className="section-label">SITE ADDRESSES</h3>
              <p className="caveat">
                {selected.siteAddressCount ?? selected.siteAddresses.length}{" "}
                source address records · coordinate basis{" "}
                {selected.coordinateBasis?.replaceAll("_", " ") ?? "unknown"}
                {selected.siteAddressesTruncated ? " · display truncated" : ""}
              </p>
              {selected.siteAddresses.map((a) => (
                <p className="caveat" key={a.id}>
                  {a.address} · {a.city ?? "city unavailable"} · {a.id}
                </p>
              ))}
            </>
          )}
          <p className="caveat">
            Ownership evidence: {selected.ownership.evidenceClass ?? "unknown"}{" "}
            · location class{" "}
            {selected.ownership.locationClass?.replaceAll("_", " ") ??
              "unknown"}
            . Missing transfer dates do not establish tenure.
          </p>
          <h3 className="section-label">SOURCE CITATIONS</h3>
          {propertyEvidence(selected).map((p) => (
            <div
              className="citation"
              key={`${p.sourceId}:${p.recordId}:${p.digest}`}
            >
              <b>{p.sourceId}</b>
              <span>
                {p.recordId} · {p.kind}
              </span>
              <small>
                Observed {p.observedAt.slice(0, 10)} · digest{" "}
                {p.digest.slice(0, 12)}…
              </small>
            </div>
          ))}
          <div className="lead-actions">
            {selectedLead ? (
              <>
                <div className="saved-label">
                  ✓ Saved as a lead · version {selectedLead.version}
                </div>
                <label>
                  Lead status
                  <select
                    aria-label="Lead status"
                    value={selectedLead.status}
                    onChange={(e) =>
                      void updateLead(selectedLead, {
                        status: e.target.value as Lead["status"],
                      })
                    }
                  >
                    <option value="new">New</option>
                    <option value="qualified">Qualified</option>
                    <option value="contacted">Contacted (record only)</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label>
                  Lead note
                  <textarea
                    aria-label="Lead note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a local qualification note"
                    maxLength={2000}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={!note.trim()}
                  onClick={() => void updateLead(selectedLead, { note })}
                >
                  Save note
                </button>
                <details>
                  <summary>Lead history ({selectedLead.events.length})</summary>
                  {selectedLead.events.map((e, i) => (
                    <p className="history-event" key={i}>
                      {e.kind} · {e.at.slice(0, 19)}
                      {e.note ? ` — ${e.note}` : ""}
                    </p>
                  ))}
                </details>
              </>
            ) : (
              <button
                className="button primary"
                onClick={() => void createLead(selected)}
              >
                Create lead <span>+</span>
              </button>
            )}
            <small>Local record only. No message or outreach is sent.</small>
          </div>
        </aside>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
