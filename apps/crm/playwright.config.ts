import { defineConfig } from "@playwright/test";

/**
 * Runs against the hosted Amplify URL only. Inputs are ONLY environment variables:
 *   CRM_URL   base URL of the hosted app (https://main.<appId>.amplifyapp.com)
 *   CRM_USER  basic-auth username
 *   CRM_PASS  basic-auth password
 * No credentials in the global `use`: tests that need them set them with test.use / context options,
 * scoped to the Amplify origin. The API token and the map key are read from the hosted /config.json.
 */
const baseURL = process.env.CRM_URL;
if (!baseURL) throw new Error("set CRM_URL");
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  // Kept on failure for the report; throwaway runs must use a separate --output directory.
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
