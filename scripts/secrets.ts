/** Create .secrets/crm.json once (basic-auth credentials and the API token). Prints nothing secret. */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const path = new URL("../.secrets/crm.json", import.meta.url).pathname;
if (existsSync(path)) {
  console.log(`${path} exists; not changed`);
  process.exit(0);
}
mkdirSync(new URL("../.secrets/", import.meta.url).pathname, {
  recursive: true,
  mode: 0o700,
});
const apiToken = randomBytes(32).toString("base64url");
writeFileSync(
  path,
  JSON.stringify(
    {
      basicUser: "crm-" + randomBytes(3).toString("hex"),
      basicPass: randomBytes(18).toString("base64url"),
      apiToken,
      apiTokenSha256: createHash("sha256").update(apiToken).digest("hex"),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(`wrote ${path} (values not shown)`);
