import { defineProject } from "vitest/config";
// Router tests use DynamoDB Local, started once by the leads-db global setup.
export default defineProject({
  test: {
    name: "api",
    globalSetup: ["../../packages/leads-db/test/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
