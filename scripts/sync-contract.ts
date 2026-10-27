import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(
  root,
  "../oracle-property-intelligence-platform-pipeline-oakland-mi/packages/contracts",
);
const targetRoot = path.join(root, "packages/contracts");
const source = await readFile(path.join(sourceRoot, "src/index.ts"));
const digest = createHash("sha256").update(source).digest("hex");
const manifest = JSON.parse(
  await readFile(path.join(sourceRoot, "contract_manifest.json"), "utf8"),
) as { version: string; sha256: string };
if (manifest.sha256 !== digest)
  throw new Error("Producer contract does not match its frozen manifest");
if (process.argv.includes("--check")) {
  const target = await readFile(path.join(targetRoot, "src/index.ts"));
  const targetManifest = JSON.parse(
    await readFile(path.join(targetRoot, "contract_manifest.json"), "utf8"),
  ) as { version: string; sha256: string };
  if (
    !source.equals(target) ||
    targetManifest.sha256 !== digest ||
    targetManifest.version !== manifest.version
  )
    throw new Error(
      "Producer/consumer contract drift; review the producer and run contract:sync",
    );
} else {
  await writeFile(path.join(targetRoot, "src/index.ts"), source);
  await writeFile(
    path.join(targetRoot, "contract_manifest.json"),
    JSON.stringify(
      {
        ...manifest,
        producer: "oracle",
        mode: "generated-copy",
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  JSON.stringify({
    version: manifest.version,
    sha256: digest,
    mode: process.argv.includes("--check") ? "verified" : "generated",
  }),
);
