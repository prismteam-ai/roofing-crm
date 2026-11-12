/**
 * Write <dist>/config.json for the deployed CRM: absolute API URL (OracleLaDataApi output), the CRM API token
 * and the Amazon Location map key (both from .secrets/). Prints nothing secret.
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
const apiUrl = execFileSync(
  "aws",
  [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    "OracleLaDataApi",
    "--profile",
    "prism",
    "--region",
    "eu-north-1",
    "--query",
    "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue",
    "--output",
    "text",
  ],
  { encoding: "utf8" },
).trim();
if (
  !/^https:\/\/[a-z0-9]+\.execute-api\.eu-north-1\.amazonaws\.com$/.test(apiUrl)
)
  throw new Error(`unexpected ApiUrl ${apiUrl}`);
writeFileSync(
  join(dist, "config.json"),
  JSON.stringify({
    client: "crm",
    apiUrl,
    apiToken: s.apiToken,
    mapKey: s.mapKey,
  }),
);
console.log(
  `wrote ${join(dist, "config.json")} (apiUrl ${apiUrl}; token and key not shown)`,
);
