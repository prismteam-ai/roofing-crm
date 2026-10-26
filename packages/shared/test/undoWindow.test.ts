import { describe, expect, it } from "vitest";
import { UNDO_WINDOW_MS } from "../src/index.js";

describe("UNDO_WINDOW_MS", () => {
  it("is the 15 minutes `leads.undoCreate` allows", () => {
    expect(UNDO_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});
