// Changing the search in the top-bar box (a place or ZIP, a found permit, TCAD account or address,
// a saved search) starts a new conversation: Map.tsx mints a new agent thread and clears the
// answer, and the Ask panel empties its question box when the thread changes (AskPanel.test.tsx).
// A source rule, because the three callbacks live inside the Map route's many hooks.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MAP = readFileSync(resolve(__dirname, "../../src/routes/Map/Map.tsx"), "utf8");

/** The body of `const <name> = useCallback(` up to its dependency array. */
function callbackBody(name: string): string {
  const start = MAP.indexOf(`const ${name} = useCallback(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const end = MAP.indexOf("\n  );", start);
  return MAP.slice(start, end);
}

describe("Ask resets when the search changes", () => {
  it("resetAsk starts a new thread, clears the answer and the prefill", () => {
    const body = callbackBody("resetAsk");
    expect(body).toContain("setThreadId(newThreadId())");
    expect(body).toContain("setAnswer(null)");
    expect(body).toContain("setPrefill(null)");
  });

  it.each(["searchCentre", "searchOpenProperty", "searchApplySaved"])(
    "%s resets the Ask panel",
    (name) => {
      const body = callbackBody(name);
      expect(body).toContain("resetAsk()");
      expect(body).toMatch(/\[setSearchParams, resetAsk\]/);
    },
  );

  it("a pin drop, a hexagon click and the radius do not reset a conversation", () => {
    for (const name of ["searchCurrent"]) {
      expect(MAP.indexOf(`const ${name} = useMemo(`)).toBeGreaterThan(-1);
    }
    // Only the three search-box callbacks (and resetAsk's own definition) call it.
    const calls = MAP.match(/resetAsk\(\)/g) ?? [];
    expect(calls.length).toBe(3);
  });
});
