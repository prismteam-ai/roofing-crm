import { defineConfig } from "vitest/config";

// One vitest run over every workspace package (vitest 3 `projects`, the successor of vitest.workspace.ts).
export default defineConfig({
  test: { projects: ["packages/*", "apps/*"] },
});
