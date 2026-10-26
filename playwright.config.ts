import { defineConfig, devices, type Project } from "@playwright/test";
import { assertHostedRuntimeUrl } from "./tests/e2e/lib/runtime-url.js";
import { onboardingDismissedState } from "./tests/e2e/lib/onboarding.js";

// RUNTIME_URL: the Amplify preview for this branch (tasks.md) — never localhost in Phase Z. When
// it IS set, it must be a real hosted URL (constitution Article I "localhost is never evidence",
// config-guard.spec.ts's loopback cases) — validated at config-load time, found running
// config-guard.spec.ts itself: this file previously read RUNTIME_URL raw with no validation at
// all, so an explicit RUNTIME_URL=http://localhost:3000 silently ran against that instead of
// being refused. Pre-deploy (this phase), RUNTIME_URL is simply UNSET and tests run against the
// local Turborepo dev server instead (plan.md's Complexity Tracking row on Article XXI) — that
// case is intentionally exempt from the guard, which is why config-guard.spec.ts's own "unset"
// case doesn't apply to this story's design (disclosed deviation from the copied A-03 test: that
// story has no local-dev-server testing phase, this one does).
const baseURL =
  process.env.RUNTIME_URL === undefined
    ? "http://localhost:5173"
    : assertHostedRuntimeUrl(process.env.RUNTIME_URL);
const hosted = process.env.RUNTIME_URL !== undefined;

// Two CI phases, the same split as Task A's tests/e2e/playwright.config.ts (PW_PHASE):
//   PW_PHASE=parallel → every spec except ISOLATED, on 4 workers;
//   PW_PHASE=isolated → only ISOLATED, on 1 worker (so not even its own viewports overlap).
// Unset ("all") = every spec, as before this split: one worker against RUNTIME_URL, full
// parallelism against the local dev server. Both phases keep the three viewport project names
// (the responsive suite), so `--project desktop-1440` and specs that check the project name
// (B-01 AC-3) work the same in every phase. Each phase gets its own report and output folder,
// so the second invocation never clears the first.
//
// ISOLATED — each entry's reason. Everything not listed is read-only browsing of the hosted app
// as the one seeded admin (signed in once by the `setup` project) and is safe to overlap:
const ISOLATED = [
  // NFR-001 p95 timing: 20 timed radius changes; concurrent pages and Lambda contention would
  // skew the measurement it asserts on.
  "perf.spec.ts",
  // Calls the real agent (`agent.ask`): rate-limited to 5 asks/min/user and paid per call
  // (Bedrock). Three viewports × three asks must not run concurrently with each other or with
  // anything else asking as the same user.
  "responsive/ask.spec.ts",
  // One more paid ask per viewport (an answer with Matches, typed and sent), same limit.
  "responsive/ask-matches.spec.ts",
  // One paid ask on desktop-1440 only ("Ask about it" from the drawer), same limit.
  "responsive/drawer-content.spec.ts",
  // Mutates the shared admin's leads (beforeAll deletes and recreates the test leads) and is
  // `mode: "serial"` by design; two viewports at once would delete each other's leads. On CI it
  // runs with the `crm-ci` key (infra/lib/crm-ci-user.ts) and skips itself when that is unset.
  "B-07.spec.ts",
];
// Considered and left in the parallel phase, on purpose:
// - cid-copy / fallback / manifest / verify-manifest .spec.ts: unconditional `test.skip(true)`
//   stubs (out of scope for B-02, see their headers) — no IPFS gateway traffic at all today. If
//   one is ever revived against the rate-limited public gateways, move it into ISOLATED.
// - B-01.spec.ts AC-3 lockout: locks a throwaway `lockout-probe-…@roofing-crm.test` username,
//   never the shared admin (and ERR-21 keys every lockout path by that email), runs on
//   desktop-1440 only, so it cannot lock out a concurrent correct-password sign-in.
// - config-guard.spec.ts: spawns `playwright test --list` locally; never reaches the network.
const ISOLATED_GLOBS = ISOLATED.map((file) => `**/${file}`);
const SETUP_FILE = /auth\.setup\.ts$/;

const phase = process.env.PW_PHASE ?? "all";
if (!["all", "parallel", "isolated"].includes(phase)) {
  throw new Error(`PW_PHASE must be "parallel", "isolated" or unset, not: ${phase}`);
}

const VIEWPORTS: Project[] = [
  { name: "mobile-390", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  { name: "tablet-768", use: { viewport: { width: 768, height: 1024 } } },
  { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
];

/** The spec selection for this phase, applied to every viewport project. */
const phaseSelection: Pick<Project, "testMatch" | "testIgnore"> =
  phase === "parallel"
    ? { testIgnore: ISOLATED_GLOBS }
    : phase === "isolated"
      ? { testMatch: ISOLATED_GLOBS }
      : {};

// Workers against RUNTIME_URL:
// - parallel: 4, not more. This AWS account allows only 10 concurrent Lambda executions, shared
//   by the API and the B-02 sync job; more workers risk API Gateway 503 throttling (and cold
//   starts) that would read as product failures.
// - isolated and all: 1 (see ISOLATED's reasons).
// Pre-deploy local runs (no RUNTIME_URL) keep Playwright's default full parallelism.
const workers = !hosted ? undefined : phase === "parallel" ? 4 : 1;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers,
  retries: 0,
  outputDir: `test-results/${phase}`,
  reporter: [["list"], ["html", { outputFolder: `playwright-report/${phase}`, open: "never" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    // Every context starts with the first-visit card dismissed (tests/e2e/lib/onboarding.ts);
    // the saved sign-in session is taken from a context that has this too, so it carries over.
    storageState: onboardingDismissedState(baseURL),
  },
  projects: [
    // Signs the seeded admin in once per invocation and saves the session to
    // playwright/.auth/ (gitignored) for the specs that opt in (tests/e2e/lib/auth.ts). Skips
    // cleanly, writing an empty state, when CRM_TEST_PASSWORD is unset.
    { name: "setup", testMatch: SETUP_FILE, use: { viewport: { width: 1440, height: 900 } } },
    ...VIEWPORTS.map((project) => ({ ...project, ...phaseSelection, dependencies: ["setup"] })),
  ],
});
