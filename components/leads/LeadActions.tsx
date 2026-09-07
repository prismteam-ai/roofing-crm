"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Note form + delete button for the lead detail page. */
export function LeadActions({ leadId }: { leadId: number }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: note }),
      });
      if (!res.ok)
        throw new Error(((await res.json()) as { error?: string }).error ?? "Failed to add note");
      setNote("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this lead and its notes?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
      router.push("/leads");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Add a note (call outcome, homeowner availability, roof observations)..."
        className="w-full rounded-md border border-[var(--line)] p-2 text-sm"
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addNote}
          disabled={busy || !note.trim()}
          className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Add note
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-xs text-red-700 underline"
        >
          Delete lead
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
