import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["*.test.ts"],
    // T042: 21 asks (7 queries x GOLDEN_REPEATS=3) paced 13s apart against the deployed agent is
    // a ~5 minute run by design (agent-design.md alakazam §1) -- far past Vitest's 5s default.
    testTimeout: 600_000,
    hookTimeout: 60_000,
  },
});
