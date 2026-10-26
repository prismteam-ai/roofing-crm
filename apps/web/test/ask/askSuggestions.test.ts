// The Ask composer's example questions cannot drift from the questions tested against the live
// agent: each one must equal the `prompt` of the golden query it cites (or be marked derived).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SUGGESTION_GROUPS } from "../../src/routes/Ask/askCopy";

interface Golden {
  readonly id: string;
  readonly prompt: string;
}
const golden = (
  JSON.parse(readFileSync(resolve(__dirname, "../../../../tests/agent/golden.json"), "utf8")) as {
    queries: Golden[];
  }
).queries;

describe("Ask suggestions", () => {
  const items = SUGGESTION_GROUPS.flatMap((g) => g.items);

  it("offers five or six, ordered roofs, permits, owners, then what is not published", () => {
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.length).toBeLessThanOrEqual(6);
    expect(SUGGESTION_GROUPS.map((g) => g.label)).toEqual([
      "Roofs",
      "Permits",
      "Owners",
      "What is not published",
    ]);
  });

  it("each text is the verbatim prompt of the golden query it cites", () => {
    for (const { golden: id, text } of items) {
      expect(golden.find((q) => q.id === id)?.prompt, id).toBe(text);
    }
  });

  it("none depends on a previous turn (names its place itself)", () => {
    for (const { text } of items) {
      expect(text).not.toMatch(/\b(that|those|the first|same)\b/i);
      expect(text).toMatch(/Pflugerville|Austin|Lakeway|Manor/);
    }
  });
});
