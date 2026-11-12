/**
 * Write <dist>/config.json for the deployed CRM: absolute API URL (OracleLaDataApi output), leads API URL
 * (RoofingCrmLeads output; omitted, with the leads UI hidden, while that stack does not exist), the CRM API
 * token and the Amazon Location map key (both from .secrets/). Prints nothing secret.
 * Usage: node scripts/write-config.ts <dist-dir>
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = process.argv[2];
if (!dist) throw new Error("usage: write-config.ts <dist-dir>");
const s = JSON.parse(
  readFileSync(new URL("../.secrets/crm.json", import.meta.url), "utf8"),
);
const output = (stack: string, key: string) =>
  execFileSync(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stack,
      "--profile",
      "prism",
      "--region",
      "eu-north-1",
      "--query",
      `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue`,
      "--output",
      "text",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
const API_URL =
  /^https:\/\/[a-z0-9]+\.execute-api\.eu-north-1\.amazonaws\.com$/;
const apiUrl = output("OracleLaDataApi", "ApiUrl");
if (!API_URL.test(apiUrl)) throw new Error(`unexpected ApiUrl ${apiUrl}`);
let leadsApiUrl: string | undefined;
try {
  leadsApiUrl = output("RoofingCrmLeads", "LeadsApiUrl");
} catch {
  console.log(
    "RoofingCrmLeads not deployed: leadsApiUrl omitted (leads UI hidden)",
  );
}
if (leadsApiUrl !== undefined && !API_URL.test(leadsApiUrl))
  throw new Error(`unexpected LeadsApiUrl ${leadsApiUrl}`);
writeFileSync(
  join(dist, "config.json"),
  JSON.stringify({
    client: "crm",
    apiUrl,
    leadsApiUrl,
    apiToken: s.apiToken,
    mapKey: s.mapKey,
  }),
);
console.log(
  `wrote ${join(dist, "config.json")} (apiUrl ${apiUrl}, leadsApiUrl ${leadsApiUrl ?? "none"}; token and key not shown)`,
);
