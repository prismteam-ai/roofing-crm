import { describe, expect, it } from "vitest";
import {
  runUndoMany,
  undoOneText,
  undoSummary,
  type UndoReason,
} from "../../src/routes/Map/Candidates/undoCopy";

describe("undo copy", () => {
  it("summarises undone, kept (with reasons, de-duplicated) and unreachable", () => {
    expect(undoSummary({ undone: 2, refused: [], failed: 0 })).toBe("Undid 2 leads");
    expect(undoSummary({ undone: 1, refused: [], failed: 0 })).toBe("Undid 1 lead");
    expect(
      undoSummary({ undone: 0, refused: ["TOO_OLD", "TOO_OLD", "NOT_OWNER"], failed: 1 }),
    ).toBe(
      "3 kept (it was created more than 15 minutes ago; it belongs to someone else) · 1 not undone (couldn’t reach the server)",
    );
  });

  it("says one lead's outcome honestly for every reason", () => {
    expect(undoOneText({ deleted: true })).toBe("Lead removed");
    expect(undoOneText("failed")).toBe("Couldn’t undo. The lead is still saved.");
    const reasons: UndoReason[] = ["NOT_UNDOABLE", "NOT_FOUND", "NOT_OWNER", "TOO_OLD", "CHANGED"];
    for (const reason of reasons)
      expect(undoOneText({ deleted: false, reason })).toMatch(/^Lead kept: .+\.$/);
  });

  it("runUndoMany tallies, never exceeds the concurrency and treats a thrown call as failed", async () => {
    let live = 0;
    let peak = 0;
    const tally = await runUndoMany(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 2));
        live -= 1;
        if (n === 1) throw new Error("net");
        if (n === 2) return { deleted: false, reason: "CHANGED" };
        return { deleted: true };
      },
      2,
    );
    expect(peak).toBe(2);
    expect(tally).toEqual({ undone: 4, refused: ["CHANGED"], failed: 1 });
  });
});
