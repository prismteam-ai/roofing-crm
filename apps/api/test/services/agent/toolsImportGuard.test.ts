// T029 (B-09, Phase 4/US1): the confirm-flow-bypass guard from `agent-design.md` ash §5 /
// contracts/agent-api.md's `agent.confirmLead` section ("A grep of
// `apps/api/src/services/agent/tools.ts` for any `LeadService`/`requireLeadService` import must
// come back empty; it is only ever imported by this router handler" — meaning
// `routers/agent.ts`'s `confirmLead` handler, never the model's own tool set).
//
// Sequenced in Phase 4, not Phase 2 (tasks.md's note on T029): `tools.ts` is created by this same
// phase (T032, builder: alakazam), in parallel with this test. If it doesn't exist yet when this
// runs, the test fails on file-not-found (`fs.readFileSync` ENOENT) — the correct TDD-first
// failure (constitution XXI), not a bad assertion in the test body below. Once `tools.ts` exists,
// this becomes a real static/import-graph check: it reads the file's own source text and parses
// every `import ... from "..."` declaration, so a future rename or re-export cannot quietly slip
// `LeadService`/`requireLeadService` back in without this test's regex catching it.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TOOLS_PATH = fileURLToPath(new URL("../../../src/services/agent/tools.ts", import.meta.url));

const FORBIDDEN_IMPORTS = ["LeadService", "requireLeadService"] as const;

/** Every `import ... from "module"` declaration's full text (type-only imports included, since a
 *  `import type { LeadService } from ...` is just as much a coupling the guard forbids — the
 *  contract's wording is "no code path reaching the same call", and a type-only import would
 *  still signal exactly the coupling this guard exists to prevent). */
function importDeclarations(source: string): string[] {
  const matches = source.matchAll(/^import\s+(?:type\s+)?\{[^}]*\}\s+from\s+["'][^"']+["'];?/gm);
  return [...matches].map((m) => m[0]);
}

describe("services/agent/tools.ts import guard (T029)", () => {
  it("imports neither LeadService nor requireLeadService anywhere in the file", () => {
    const source = readFileSync(TOOLS_PATH, "utf8");
    const declarations = importDeclarations(source);

    for (const forbidden of FORBIDDEN_IMPORTS) {
      const offending = declarations.filter((d) => d.includes(forbidden));
      expect(offending, `tools.ts must never import ${forbidden}`).toEqual([]);
    }

    // Belt-and-suspenders: even outside an import declaration (e.g. a re-export or a dynamic
    // `await import(...)`), the bare identifiers must not appear in the file at all — the
    // confirm-flow write path is reachable only from routers/agent.ts's confirmLead handler.
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(source.includes(forbidden), `tools.ts must never reference ${forbidden}`).toBe(false);
    }
  });
});
