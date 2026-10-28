import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const binary = ".data/tools/actionlint";
if (
  createHash("sha256")
    .update(await readFile(binary))
    .digest("hex") !==
  "c872d6db8c6bf83a8eaa704fc93999f027d55dffbc63b8a6abdccb47df5f4cd4"
)
  throw new Error(
    "Exact pinned actionlint is required; run pnpm tooling:install",
  );
const source = await readFile(".github/workflows/ci.yml", "utf8");
for (const match of source.matchAll(/uses:\s*(\S+)/g))
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/.test(match[1]))
    throw new Error("Every workflow action must have an immutable commit pin");
if (
  !source.includes("contents: read") ||
  /secrets\.|id-token:|contents: write|pull_request_target/.test(source)
)
  throw new Error("Least-privilege no-secret PR workflow required");
execFileSync(
  binary,
  ["-shellcheck=", "-pyflakes=", ".github/workflows/ci.yml"],
  { stdio: "inherit" },
);
console.log("PASS_NATIVE_ACTIONLINT_AND_PINNED_READ_ONLY_WORKFLOW");
