import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // TD-6: no unit test may reach the network; an unstubbed fetch fails with its URL.
    setupFiles: ["test/setup.noNetwork.ts"],
  },
});
