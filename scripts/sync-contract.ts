import { access, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot =
  process.env.PRISM_ORACLE_CONTRACT_DIR ??
  path.resolve(
    root,
    "../oracle-property-intelligence-platform-pipeline-oakland-mi/packages/contracts",
  );
const targetRoot = path.join(root, "packages/contracts");
type Manifest = {
  version: string;
  sha256: string;
  queryPredicateSha256: string;
};
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function verify(directory: string) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "contract_manifest.json"), "utf8"),
  ) as Manifest;
  const source = await readFile(path.join(directory, "src/index.ts"));
  const predicates = await readFile(
    path.join(directory, "src/query-predicates.ts"),
  );
  if (
    hash(source) !== manifest.sha256 ||
    hash(predicates) !== manifest.queryPredicateSha256 ||
    !source.toString().includes(`CONTRACT_VERSION = "${manifest.version}"`)
  )
    throw new Error(
      "Contract source/predicates do not match their pinned manifest",
    );
  return { manifest, source, predicates };
}
let producerAvailable = true;
try {
  await access(path.join(sourceRoot, "contract_manifest.json"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  producerAvailable = false;
}
if (process.argv.includes("--check")) {
  const target = await verify(targetRoot);
  if (producerAvailable) {
    const producer = await verify(sourceRoot);
    if (
      !target.source.equals(producer.source) ||
      !target.predicates.equals(producer.predicates) ||
      target.manifest.version !== producer.manifest.version
    )
      throw new Error(
        "Producer/consumer drift; review Oracle and run contract:sync",
      );
  }
  console.log(
    JSON.stringify({
      version: target.manifest.version,
      sha256: target.manifest.sha256,
      queryPredicateSha256: target.manifest.queryPredicateSha256,
      mode: producerAvailable
        ? "producer-and-consumer-verified"
        : "local-pinned-manifest-verified",
      producerAvailable,
    }),
  );
} else {
  if (!producerAvailable)
    throw new Error(
      "contract:sync requires the Oracle checkout or PRISM_ORACLE_CONTRACT_DIR; contract:check can verify a standalone pinned CRM clone",
    );
  const producer = await verify(sourceRoot);
  await writeFile(path.join(targetRoot, "src/index.ts"), producer.source);
  await writeFile(
    path.join(targetRoot, "src/query-predicates.ts"),
    producer.predicates,
  );
  await writeFile(
    path.join(targetRoot, "contract_manifest.json"),
    JSON.stringify(
      {
        ...producer.manifest,
        producer: "oracle",
        mode: "generated-copy",
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      version: producer.manifest.version,
      sha256: producer.manifest.sha256,
      queryPredicateSha256: producer.manifest.queryPredicateSha256,
      mode: "generated",
    }),
  );
}
