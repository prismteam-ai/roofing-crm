"use client";

import { useState } from "react";
import { api, STATUS_LABEL, type Lead } from "./client";

const STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;
const PRIORITIES = ["high", "normal", "low"] as const;

/** Saved leads: review, re-prioritise, move through the pipeline, annotate, remove. */
export function LeadsBoard({ leads, onChanged }: { leads: Lead[]; onChanged: () => void }) {
  const [status, setStatus] = useState<string>("all");
  const [reason, setReason] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const shown = leads.filter((lead) => (status === "all" || lead.status === status) && (reason === "all" || lead.reason === reason));
  const count = (s: string) => leads.filter((lead) => lead.status === s).length;

  async function change(lead: Lead, patch: Partial<Pick<Lead, "status" | "priority" | "notes">>) {
    setError(null);
    try {
      await api(`/api/leads/${encodeURIComponent(lead.leadId)}`, { method: "PATCH", body: JSON.stringify(patch) });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function remove(lead: Lead) {
    setError(null);
    try {
      await api(`/api/leads/${encodeURIComponent(lead.leadId)}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <div className="stats" style={{ marginBottom: 12 }}>
        {STATUSES.map((s) => (
          <div className="stat" key={s}>
            <b>{count(s)}</b>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <div className="controls">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lead type
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="all">All</option>
            <option value="aging_roof">Aging roof</option>
            <option value="open_permit">Open roofing permit</option>
          </select>
        </label>
      </div>
      {error && <div className="note">{error}</div>}
      {leads.length === 0 && <p className="muted">No leads yet. Use the lead finder to add properties and permits worth pursuing.</p>}
      {leads.length > 0 && shown.length === 0 && <p className="muted">No leads match these filters.</p>}

      {shown.map((lead) => (
        <div className="card" key={lead.leadId} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <b>{lead.address ?? "No site address"}</b>{" "}
              <span className={`tag ${lead.reason === "open_permit" ? "bad" : "warn"}`}>{lead.reason === "open_permit" ? "open roofing permit" : "aging roof"}</span>
              <div className="muted mono">{lead.folio}</div>
            </div>
            <div className="controls" style={{ margin: 0 }}>
              <label>
                Status
                <select value={lead.status} onChange={(e) => change(lead, { status: e.target.value as Lead["status"] })}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select value={lead.priority} onChange={(e) => change(lead, { priority: e.target.value as Lead["priority"] })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => remove(lead)}>Remove</button>
            </div>
          </div>
          <dl className="facts">
            {lead.reason === "aging_roof" && (
              <>
                <dt>Roof</dt>
                <dd>
                  {lead.roofYear ?? "unknown"} (from {String(lead.roofBasis).replaceAll("_", " ")})
                </dd>
                <dt>Owner</dt>
                <dd>{lead.owner ?? "—"}</dd>
              </>
            )}
            {lead.reason === "open_permit" && (
              <>
                <dt>Permit</dt>
                <dd>
                  {lead.permitNumber}, issued {lead.permitIssued}, {STATUS_LABEL[String(lead.permitStatus)] ?? lead.permitStatus}
                </dd>
                <dt>Contractor</dt>
                <dd>
                  {lead.contractor ?? "none printed"} {lead.contractorLicence ?? ""}
                </dd>
              </>
            )}
            <dt>Evidence</dt>
            <dd>
              Snapshot <span className="mono">{lead.snapshotId}</span>
              {lead.sourceUrl && (
                <>
                  {" · "}
                  <a href={lead.sourceUrl} target="_blank" rel="noreferrer">
                    county record
                  </a>
                </>
              )}
            </dd>
            <dt>Added</dt>
            <dd>{lead.createdAt.slice(0, 16).replace("T", " ")} UTC</dd>
          </dl>
          <textarea
            className="notes"
            placeholder="Notes"
            value={drafts[lead.leadId] ?? lead.notes}
            onChange={(e) => setDrafts({ ...drafts, [lead.leadId]: e.target.value })}
          />
          {drafts[lead.leadId] !== undefined && drafts[lead.leadId] !== lead.notes && (
            <button
              className="primary"
              style={{ marginTop: 6 }}
              onClick={async () => {
                await change(lead, { notes: drafts[lead.leadId] });
                setDrafts((current) => {
                  const next = { ...current };
                  delete next[lead.leadId];
                  return next;
                });
              }}
            >
              Save notes
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
