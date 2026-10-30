import { access, readFile, writeFile, readdir } from "node:fs/promises";
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
const moduleNames = [
  "index.ts",
  "official-parcel-observation.ts",
  "query-predicates.ts",
  "source-observations.ts",
] as const;
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
type Lock = {
  version: string;
  sha256: string;
  files: Record<string, string>;
  sha256Meaning: string;
  moduleGraphSha256: string;
};
/** The four-module lock is canonical; historical single-file manifests cannot override it. */
async function verify(directory: string) {
  const lock = JSON.parse(
    await readFile(path.join(directory, "contract.lock.json"), "utf8"),
  ) as Lock;
  if (
    lock.version !== "0.6.0" ||
    !lock.files ||
    Object.keys(lock.files).sort().join(",") !==
      [...moduleNames].sort().join(",") ||
    lock.sha256 !== lock.files["index.ts"]
  )
    throw new Error("Current canonical four-module contract lock required");
  const manifest = JSON.parse(
    await readFile(path.join(directory, "contract_manifest.json"), "utf8"),
  ) as Lock & { entryFile: string };
  const inventory = Object.fromEntries(
    Object.entries(lock.files).sort(([a], [b]) => a.localeCompare(b)),
  );
  const graph = hash(JSON.stringify(inventory));
  const actualSourceFiles = await readdir(path.join(directory, "src"), {
    withFileTypes: true,
  });
  if (
    actualSourceFiles.some(
      (entry) =>
        !entry.isFile() ||
        !moduleNames.includes(entry.name as (typeof moduleNames)[number]),
    ) ||
    actualSourceFiles.length !== moduleNames.length ||
    lock.sha256Meaning !== "compatibility_entry_file_sha256" ||
    lock.moduleGraphSha256 !== graph ||
    manifest.entryFile !== "src/index.ts" ||
    manifest.version !== lock.version ||
    manifest.sha256 !== lock.sha256 ||
    manifest.sha256Meaning !== lock.sha256Meaning ||
    manifest.moduleGraphSha256 !== graph ||
    JSON.stringify(
      Object.fromEntries(
        Object.entries(manifest.files ?? {}).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      ),
    ) !== JSON.stringify(inventory)
  )
    throw new Error("Contract manifest/lock/module graph inventory mismatch");
  const modules = await Promise.all(
    moduleNames.map(async (name) => {
      const bytes = await readFile(path.join(directory, "src", name));
      if (
        !/^[a-f0-9]{64}$/.test(lock.files[name]) ||
        hash(bytes) !== lock.files[name]
      )
        throw new Error(
          "Contract module content does not match its immutable lock",
        );
      return { name, bytes };
    }),
  );
  if (
    !modules[0].bytes
      .toString()
      .includes(`CONTRACT_VERSION = "${lock.version}"`)
  )
    throw new Error("Contract version differs from its lock");
  return { lock, manifest, modules };
}
let producerAvailable = true;
try {
  await access(path.join(sourceRoot, "contract.lock.json"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  producerAvailable = false;
}
if (process.argv.slice(2).some((arg) => arg !== "--check"))
  throw new Error("Use contract:sync or contract:check");
if (process.argv.includes("--check")) {
  const target = await verify(targetRoot);
  if (producerAvailable) {
    const producer = await verify(sourceRoot);
    if (
      JSON.stringify(target.lock) !== JSON.stringify(producer.lock) ||
      target.modules.some(
        (module, index) => !module.bytes.equals(producer.modules[index].bytes),
      )
    )
      throw new Error(
        "Producer/consumer drift; review the canonical Oracle contract before synchronization",
      );
  }
  console.log(
    JSON.stringify({
      version: target.lock.version,
      sha256: target.lock.sha256,
      files: target.lock.files,
      producerAvailable,
      mode: producerAvailable
        ? "producer-and-consumer-verified"
        : "standalone-four-module-lock-verified",
    }),
  );
} else {
  if (!producerAvailable)
    throw new Error(
      "contract:sync requires the Oracle checkout or PRISM_ORACLE_CONTRACT_DIR; contract:check verifies a standalone pinned clone",
    );
  const producer = await verify(sourceRoot);
  for (const module of producer.modules)
    await writeFile(path.join(targetRoot, "src", module.name), module.bytes);
  await writeFile(
    path.join(targetRoot, "contract.lock.json"),
    JSON.stringify(producer.lock, null, 2) + "\n",
  );
  await writeFile(
    path.join(targetRoot, "contract_manifest.json"),
    await readFile(path.join(sourceRoot, "contract_manifest.json")),
  );
  console.log(
    JSON.stringify({
      version: producer.lock.version,
      files: producer.lock.files,
      mode: "generated-four-module-copy",
    }),
  );
}
