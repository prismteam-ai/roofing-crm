import { readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const scripts = (
  JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;
const categories: Record<string, readonly string[]> = {
  "long-lived-loopback-startup-exercised-by-browser": [
    "dev",
    "api",
    "test:oracle-fixture",
  ],
  "mutating-equivalent-read-check-or-explicit-operator-only": [
    "format",
    "contract:sync",
  ],
  "finite-effect-free-operator-plan": [
    "deploy",
    "bootstrap",
    "smoke",
    "evidence",
    "rotate-access",
    "destroy",
    "campaign",
  ],
  "canonical-orchestration": ["ci:verify"],
  "finite-local-quality-build-test": [
    "typecheck",
    "test",
    "lint",
    "format:check",
    "build",
    "test:browser",
    "cdk:synth",
    "benchmark",
    "contract:check",
    "lambda:package",
    "lambda:emulate",
    "lambda:alert:emulate",
    "test:map-browser",
    "tooling:install",
    "workflow:check",
    "security:scan",
    "dependency:audit",
    "docs:check",
    "scripts:check",
  ],
};
const declared = Object.values(categories).flat();
if (
  declared.length !== new Set(declared).size ||
  Object.keys(scripts).some((name) => !declared.includes(name)) ||
  declared.some((name) => !Object.hasOwn(scripts, name))
)
  throw new Error(
    "Every declared script needs an exact executable classification",
  );
for (const source of Object.values(scripts))
  for (const m of source.matchAll(/\btsx\s+([^\s;&]+)/g)) await access(m[1]);
for (const name of [
  "deploy",
  "bootstrap",
  "smoke",
  "evidence",
  "rotate-access",
  "destroy",
])
  execFileSync("pnpm", ["run", name, "--dry-run"], {
    stdio: "pipe",
    timeout: 30000,
  });
execFileSync("pnpm", ["run", "campaign"], { stdio: "pipe", timeout: 30000 });
execFileSync("pnpm", ["run", "campaign", "--source-closure"], {
  stdio: "pipe",
  timeout: 30000,
});
console.log(
  JSON.stringify({
    status: "PASS_DECLARED_SCRIPT_TARGETS_AND_GUARDED_OPERATOR_PLANS",
    scripts: Object.keys(scripts).length,
    categories,
    cloudServiceCalls: 0,
  }),
);
