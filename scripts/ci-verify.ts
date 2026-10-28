import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
if (
  Number(process.versions.node.split(".")[0]) !== 24 ||
  execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim() !== "11.25.0"
)
  throw new Error("CI requires Node24 and pnpm11.25.0");
const commands = [
  "format:check",
  "lint",
  "typecheck",
  "test",
  "contract:check",
  "security:scan",
  "workflow:check",
  "docs:check",
  "scripts:check",
  "dependency:audit",
  "build",
  "lambda:package",
  "lambda:emulate",
  "lambda:alert:emulate",
  "cdk:synth",
  "test:browser",
  "test:map-browser",
];
const results: { command: string; exit: number; durationMs: number }[] = [];
await mkdir("build", { recursive: true });
let failure: unknown;
for (const command of commands) {
  const start = Date.now();
  try {
    execFileSync("pnpm", ["run", command], {
      stdio: "inherit",
      timeout: 600000,
    });
    results.push({ command, exit: 0, durationMs: Date.now() - start });
  } catch (error) {
    results.push({ command, exit: 1, durationMs: Date.now() - start });
    failure = error;
    break;
  }
}
await writeFile(
  "build/ci-verification.json",
  JSON.stringify(
    {
      version: "assessment-ci-verify-v1",
      node: process.versions.node,
      pnpm: "11.25.0",
      status: failure ? "FAILED" : "PASS",
      commands: results,
      cloudServiceCalls: 0,
      hostedGitHubActionsExecuted: false,
    },
    null,
    2,
  ) + "\n",
);
if (failure)
  throw new Error(
    "CI-equivalent verification failed; see the named command and safe summary",
  );
