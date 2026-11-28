import { defineProject } from "vitest/config";
// One DynamoDB Local container for the package (globalSetup), so tests share it.
export default defineProject({
  test: {
    name: "leads-db",
    globalSetup: ["test/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
