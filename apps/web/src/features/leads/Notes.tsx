import type { LeadEvent, LeadNote } from "@crm/leads-db/schema";
import { type FormEvent, useState } from "react";
import { STATUS_LABEL } from "./StatusControl.tsx";

type Entry = { at: string; text: string; kind: string };

function describe(e: LeadEvent): string {
  if (e.type === "created") return "Lead created";
  if (e.type === "status")
    return `Status ${STATUS_LABEL[e.from as keyof typeof STATUS_LABEL] ?? e.from} → ${STATUS_LABEL[e.to as keyof typeof STATUS_LABEL] ?? e.to}`;
  if (e.type === "stale") return `Marked stale: ${e.detail ?? ""}`;
  return e.detail ?? "Note";
}

/** Notes and lifecycle events as one timeline, newest first, with a note form. */
export function Notes({
  notes,
  events,
  onAdd,
  pending,
}: {
  notes: LeadNote[];
  events: LeadEvent[];
  onAdd(body: string): void;
  pending?: boolean;
}) {
  const [body, setBody] = useState("");
  const entries: Entry[] = [
    ...notes.map((n) => ({ at: n.at, text: n.body, kind: "note" })),
    ...events.filter((e) => e.type !== "note").map((e) => ({ at: e.at, text: describe(e), kind: e.type })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    onAdd(body.trim());
    setBody("");
  }
  return (
    <section className="notes" aria-label="Timeline">
      <form onSubmit={submit} className="row">
        <label className="grow">
          Add a note
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={4000} />
        </label>
        <button type="submit" disabled={pending || !body.trim()}>
          Add note
        </button>
      </form>
      <ol className="timeline" data-testid="timeline">
        {entries.map((e, i) => (
          <li key={`${e.at}-${i}`} className={e.kind}>
            <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time> {e.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
