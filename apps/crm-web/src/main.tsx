import { createRoot } from "react-dom/client";
import {
  CONTRACT_VERSION,
  type Lead,
} from "../../../packages/contracts/src/index";
import { BUILD_IDENTITY } from "../../../packages/runtime-config/src/index";
import { OpportunitiesView } from "./OpportunitiesView";
import { PropertyDrawer } from "./PropertyDrawer";
import "./style.css";
import { useCrmController } from "./useCrmController";
function App() {
  const controller = useCrmController();
  const {
    query,
    health,
    ready,
    accessCode,
    setAccessCode,
    needsAccess,
    bootError,
    result,
    view,
    setView,
    leads,
    status,
    setStatus,
    leadMutationBusy,
    seq,
    sessionGeneration,
    signingOut,
    sameSession,
    closeDetail,
    synthetic,
    connect,
    unlock,
    signOut,
    refreshLeads,
    updateLead,
    reviewLead,
  } = controller;
  return (
    <div
      className="app-shell"
      data-head={BUILD_IDENTITY.head}
      data-tree={BUILD_IDENTITY.tree}
      data-oracle-origin={
        import.meta.env.VITE_ORACLE_STUDIO_URL ?? "http://127.0.0.1:4173"
      }
      data-build-id={BUILD_IDENTITY.buildId}
      data-region={BUILD_IDENTITY.region}
      data-stage={BUILD_IDENTITY.stage}
      data-model-id={health?.model?.id ?? ""}
      data-model-region={health?.model?.region ?? ""}
      data-snapshot-id={query.snapshotId}
      data-query-hash={result?.queryHash ?? ""}
      data-query-generation={seq.current}
      data-mode={health?.dataMode ?? (synthetic ? "synthetic" : "real-public")}
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
        <a
          className="sidebar-evidence"
          href="/api/evidence"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Assessment evidence (opens in a new tab)"
          title="Assessment evidence (opens in a new tab)"
        >
          <span className="evidence-icon" aria-hidden="true">
            ↗
          </span>
          <span className="evidence-label">Assessment evidence</span>
        </a>
      </aside>
      <main>
        <header className="topbar">
          <div>
            Workspace <span>/</span>{" "}
            {view === "opportunities" ? "Opportunities" : "Lead workspace"}
          </div>
          <div className="topbar-right">
            <span className="fixture-badge">
              {synthetic
                ? "SYNTHETIC DEMO"
                : health?.dataMode === "protected-real"
                  ? "REAL EVIDENCE · MIXED SOURCE TERMS"
                  : "REAL PUBLIC EVIDENCE"}
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
              {health?.provider === "bedrock-grounded"
                ? "Bedrock grounded evidence"
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
            <OpportunitiesView controller={controller} />
          ) : (
            <section className="leads-board" aria-label="Saved leads">
              <div className="leads-title">
                <h2>
                  Saved opportunities <span>{leads.length}</span>
                </h2>
                <span>
                  {health?.accessMode === "review-session"
                    ? "Workspace-backed storage"
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
                        disabled={leadMutationBusy}
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
      <PropertyDrawer controller={controller} />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
