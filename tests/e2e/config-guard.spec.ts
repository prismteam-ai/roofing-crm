// A-03-TC-060: Playwright config refuses an explicit loopback RUNTIME_URL (constitution Article I
// "localhost is never evidence"). The case spawns the real `playwright test --list` with the
// loopback values and asserts the exact fixed text, a non-zero exit and that nothing was listed.
// Deviation from the copied A-03 test, disclosed: that story's original "unset" case is dropped —
// A-03 has no local-dev-server testing phase, so it refuses RUNTIME_URL being unset at all; B-01
// intentionally runs pre-deploy tests against the local Turborepo dev server with RUNTIME_URL
// unset (plan.md's Complexity Tracking row on Article XXI), so playwright.config.ts exempts the
// unset case by design, not by omission — asserting it here would contradict that decision.
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import { runtimeUrlLocalhostText } from "./lib/runtime-url.js";
import { repoRoot } from "./lib/runtime.js";
import { childEnv, run, type RunResult } from "./lib/spawn.js";

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");

/**
 * `playwright test --list` with RUNTIME_URL set to `value` (or removed). cwd is the repo root
 * (playwright.config.ts lives there, not under tests/e2e — found running this spec: the Task A
 * copy assumed a different layout).
 */
function listTests(value: string | undefined): Promise<RunResult> {
  return run(
    process.execPath,
    [playwrightCli, "test", "--list", "--config", "playwright.config.ts", "--reporter=list"],
    { cwd: repoRoot, env: childEnv({ RUNTIME_URL: value }), timeoutMs: 180_000 },
  );
}

const CASES: { label: string; value: string | undefined; expected: string }[] = [
  {
    label: "localhost",
    value: "http://localhost:3000",
    expected: runtimeUrlLocalhostText("http://localhost:3000"),
  },
  {
    label: "127.0.0.1",
    value: "http://127.0.0.1:3000",
    expected: runtimeUrlLocalhostText("http://127.0.0.1:3000"),
  },
  {
    label: "[::1]",
    value: "http://[::1]:3000",
    expected: runtimeUrlLocalhostText("http://[::1]:3000"),
  },
];

test.describe("A-03-TC-060 Playwright config refuses localhost", () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test("@scenario:A-03-TC-060", async () => {
    const testInfo = test.info();
    for (const { label, value, expected } of CASES) {
      const result = await listTests(value);
      await testInfo.attach(`playwright-list-${label}.log`, {
        body: `$ RUNTIME_URL=${value ?? "<unset>"} ${result.command}\nexit ${result.code}\n\n${result.output}`,
        contentType: "text/plain",
      });
      expect(result.code, `${label}: --list must exit non-zero`).not.toBe(0);
      expect(result.output, `${label}: the exact fixed text`).toContain(expected);
      expect(result.output, `${label}: no test may be listed`).not.toMatch(
        /Total: \d+ tests? in \d+ files?/,
      );
      expect(result.output, `${label}: no test may be listed`).not.toContain("Listing tests:");
      expect(result.output, `${label}: no test may run`).not.toMatch(/Running \d+ tests?/);
    }
  });
});
