// Honest wording for `leads.undoCreate` outcomes. The server answers `{ deleted: true }` or
// `{ deleted: false, reason }`; a refusal is an outcome to explain, never a failure to hide. Pure,
// shared by the candidate list's bulk Undo and the triage Undo.

import { UNDO_WINDOW_MS } from "@crm/shared";

export type UndoReason = "NOT_UNDOABLE" | "NOT_FOUND" | "NOT_OWNER" | "TOO_OLD" | "CHANGED";

/** The window `leads.undoCreate` allows, in minutes: `UNDO_WINDOW_MS` from `@crm/shared`, which
 *  mirrors apps/api/src/services/leads.ts (a web test fails if the two drift). */
export const UNDO_WINDOW_MINUTES = UNDO_WINDOW_MS / 60_000;

export interface UndoAnswer {
  readonly deleted: boolean;
  readonly reason?: UndoReason | undefined;
}

export const UNDO_REASON_TEXT: Readonly<Record<UndoReason, string>> = {
  NOT_FOUND: "that lead is already gone",
  NOT_OWNER: "it belongs to someone else",
  CHANGED: "it was updated after it was created",
  TOO_OLD: `it was created more than ${String(UNDO_WINDOW_MINUTES)} minutes ago`,
  NOT_UNDOABLE: "it is no longer New",
};

export interface UndoTally {
  readonly undone: number;
  /** Refused by the server, with the reason it gave. */
  readonly refused: readonly UndoReason[];
  /** The call itself failed, so the lead's state is unknown (treated as still saved). */
  readonly failed: number;
}

/** "Undid 2 leads", or "Undid 1 lead · 1 kept (it was updated after it was created)". */
export function undoSummary(t: UndoTally): string {
  const parts: string[] = [];
  if (t.undone > 0 || (t.refused.length === 0 && t.failed === 0))
    parts.push(`Undid ${String(t.undone)} ${t.undone === 1 ? "lead" : "leads"}`);
  if (t.refused.length > 0) {
    const reasons = [...new Set(t.refused)].map((r) => UNDO_REASON_TEXT[r]);
    parts.push(`${String(t.refused.length)} kept (${reasons.join("; ")})`);
  }
  if (t.failed > 0) parts.push(`${String(t.failed)} not undone (couldn’t reach the server)`);
  return parts.join(" · ");
}

/** One lead: "Lead removed" or why it was kept. */
export function undoOneText(answer: UndoAnswer | "failed"): string {
  if (answer === "failed") return "Couldn’t undo. The lead is still saved.";
  if (answer.deleted) return "Lead removed";
  const why = answer.reason === undefined ? "it can’t be undone" : UNDO_REASON_TEXT[answer.reason];
  return `Lead kept: ${why}.`;
}

/** Runs `undo` for each lead, at most `concurrency` in flight (server account concurrency is 10). */
export async function runUndoMany<L>(
  leads: readonly L[],
  undo: (lead: L) => Promise<UndoAnswer>,
  concurrency = 2,
): Promise<UndoTally> {
  let undone = 0;
  let failed = 0;
  const refused: UndoReason[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < leads.length) {
      const lead = leads[next++];
      if (lead === undefined) return;
      try {
        const answer = await undo(lead);
        if (answer.deleted) undone += 1;
        else refused.push(answer.reason ?? "NOT_UNDOABLE");
      } catch {
        failed += 1;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), leads.length) }, () => worker()),
  );
  return { undone, refused, failed };
}
