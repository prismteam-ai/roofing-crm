import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
const dir = ".data/tools";
const url =
  "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz";
const archiveSha =
  "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8";
export const ACTIONLINT_BINARY_SHA256 =
  "c872d6db8c6bf83a8eaa704fc93999f027d55dffbc63b8a6abdccb47df5f4cd4";
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error("This pinned CI tool build requires Linux x64");
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
await mkdir(dir, { recursive: true });
let valid = false;
try {
  valid =
    hash(await readFile(`${dir}/actionlint`)) === ACTIONLINT_BINARY_SHA256;
} catch {
  /* Exact verified download follows. */
}
if (!valid) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    redirect: "follow",
  });
  if (!response.ok) throw new Error("Pinned actionlint download unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 16 * 1024 ** 2 || hash(bytes) !== archiveSha)
    throw new Error("Actionlint archive identity mismatch");
  await writeFile(`${dir}/actionlint.tar.gz`, bytes);
  execFileSync(
    "tar",
    ["-xzf", `${dir}/actionlint.tar.gz`, "-C", dir, "actionlint"],
    { stdio: "pipe" },
  );
  await rm(`${dir}/actionlint.tar.gz`);
}
if (hash(await readFile(`${dir}/actionlint`)) !== ACTIONLINT_BINARY_SHA256)
  throw new Error("Actionlint binary identity mismatch");
await chmod(`${dir}/actionlint`, 0o755);
console.log(
  JSON.stringify({
    tool: "actionlint",
    version: "1.7.12",
    sha256: ACTIONLINT_BINARY_SHA256,
  }),
);
