import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
const names = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
let bytes = 0;
const failures: string[] = [];
for (const name of names) {
  if (!/\.(?:ts|tsx|json|ya?ml|md|txt|css|html)$/.test(name)) continue;
  let size: number;
  try {
    size = (await stat(name)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw error;
  }
  if (size > 5 * 1024 ** 2) {
    failures.push(name + ": oversized tracked source");
    continue;
  }
  const source = await readFile(name, "utf8");
  bytes += Buffer.byteLength(source);
  if (
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
      source,
    )
  )
    failures.push(name + ": high-confidence credential pattern");
  if (
    /\.(?:ts|tsx)$/.test(name) &&
    /(?:from|import\s*\()\s*["']@aws-sdk\/client-bedrock-runtime["']/.test(
      source,
    )
  )
    failures.push(name + ": forbidden direct model-provider SDK");
}
if (failures.length) throw new Error(failures.join("\n"));
console.log(
  JSON.stringify({
    status: "PASS_TRACKED_SOURCE_CREDENTIAL_AND_PROVIDER_BOUNDARY_SCAN",
    files: names.length,
    bytes,
    scope:
      "High-confidence credential literals and forbidden direct model SDK imports; not a complete PII or runtime secret audit.",
  }),
);
