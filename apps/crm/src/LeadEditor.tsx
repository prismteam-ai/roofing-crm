import { useState } from "react";
import {
  LEAD_STATUSES,
  notesProblem,
  type Lead,
  type LeadStatus,
} from "@roofing-crm/leads-client";

export const NOTES_HINT =
  "No owner names or contact details. Email addresses, phone numbers with an area code (with or without brackets, spaces, dots or hyphens) and 7 or more digits in a row (which covers parcel IDs) are refused.";

/** The lead of the parcel in the detail panel: create it, or edit its status and notes, or delete it. */
export function LeadEditor({
  parcelId,
  lead,
  busy,
  error,
  conflict,
  onCreate,
  onSave,
  onDelete,
  onReload,
}: {
  parcelId: string;
  /** undefined: loading; null: no lead yet. */
  lead: Lead | null | undefined;
  busy: boolean;
  error?: string;
  conflict: boolean;
  onCreate: (v: { status: LeadStatus; notes: string }) => void;
  onSave: (v: { status: LeadStatus; notes: string }) => void;
  onDelete: () => void;
  onReload: () => void;
}) {
  return (
    <section className="lead" data-testid="lead" data-parcel={parcelId}>
      <h4>Lead</h4>
      {lead === undefined ? (
        <p className="notice">Loading…</p>
      ) : (
        <LeadForm
          key={lead ? lead.updated_at : "new"}
          lead={lead}
          busy={busy}
          onSubmit={lead ? onSave : onCreate}
          onDelete={lead ? onDelete : undefined}
        />
      )}
      {conflict && (
        <p className="error" data-testid="lead-conflict">
          Changed elsewhere, reload.{" "}
          <button onClick={onReload} data-testid="lead-reload">
            Reload
          </button>
        </p>
      )}
      {error && !conflict && (
        <p className="error" data-testid="lead-error">
          {error}
        </p>
      )}
    </section>
  );
}

function LeadForm({
  lead,
  busy,
  onSubmit,
  onDelete,
}: {
  lead: Lead | null;
  busy: boolean;
  onSubmit: (v: { status: LeadStatus; notes: string }) => void;
  onDelete?: () => void;
}) {
  const [status, setStatus] = useState<LeadStatus>(lead?.status ?? "new");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const problem = notesProblem(notes.trim());
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) onSubmit({ status, notes: notes.trim() });
      }}
    >
      {lead && (
        <p className="notice" data-testid="lead-updated">
          Updated {lead.updated_at}
        </p>
      )}
      <label>
        Status{" "}
        <select
          data-testid="lead-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as LeadStatus)}
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <textarea
          data-testid="lead-notes"
          value={notes}
          maxLength={1000}
          rows={3}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p className="notice" data-testid="lead-notes-hint">
        {NOTES_HINT}
      </p>
      {problem && (
        <p className="error" data-testid="lead-notes-problem">
          {problem}
        </p>
      )}
      <div className="row">
        <button
          type="submit"
          data-testid={lead ? "lead-save" : "lead-create"}
          disabled={busy || !!problem}
        >
          {lead ? "Save" : "Create lead"}
        </button>
        {onDelete && (
          <button
            type="button"
            data-testid="lead-delete"
            disabled={busy}
            onClick={onDelete}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
