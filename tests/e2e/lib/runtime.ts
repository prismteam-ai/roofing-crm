// Hosted-runtime helpers for the Playwright harness: RUNTIME_URL resolution, the repo/e2e
// root paths, and the deployed build SHA from `/build.json`. Stripped down from A-03's copy
// (071eb1b): the published-run / manifest-CID helpers (`fetchRunsIndex`, `fetchByCid`,
// `fetchManifest`, `readPublishedRun`, …) depended on Task A's `@crm/contract`/`@crm/publish`
// packages, which this story deliberately does not vendor — B-01 has no published data run to
// read. If a later story needs those, re-copy them from Oracle commit 071eb1b rather than
// reconstructing from this file.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { runtimeUrl } from "./runtime-url.js";

export {
  RUNTIME_URL_UNSET_TEXT,
  assertHostedRuntimeUrl,
  isLoopbackHost,
  runtimeUrl,
  runtimeUrlLocalhostText,
} from "./runtime-url.js";

/** Repository root: tests/e2e/lib → tests/e2e → tests → root. */
export const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
export const e2eRoot = resolve(repoRoot, "tests", "e2e");

// ---------------------------------------------------------------------------------------
// Build identity (`/build.json`, written by amplify.yml from AWS_COMMIT_ID / AWS_BRANCH).
// ---------------------------------------------------------------------------------------

export const BuildInfo = z.object({
  sha: z.string().regex(/^[0-9a-f]{40}$/, "a full git commit SHA"),
  branch: z.string().min(1),
});
export type BuildInfo = z.infer<typeof BuildInfo>;

const FETCH_TIMEOUT_MS = 30_000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

/** Step 0 of every build-time case: the deployed commit. */
export async function fetchBuildInfo(): Promise<BuildInfo> {
  return BuildInfo.parse(await getJson(`${runtimeUrl()}/build.json`));
}

/** The local checkout's HEAD, which must equal the deployed `sha` before any build-time case runs. */
export function localHeadSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
}
