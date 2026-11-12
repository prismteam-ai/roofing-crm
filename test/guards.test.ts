import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const repo = new URL("..", import.meta.url).pathname;
test("build outputs and secrets are never tracked by git", () => {
  const tracked = execFileSync(
    "git",
    [
      "ls-files",
      "--",
      ":(glob)**/cdk.out/**",
      ":(glob)**/cdk-outputs*.json",
      ":(glob)**/dist/**",
      ":(glob)**/.secrets/**",
      ":(glob)**/build/**",
    ],
    { cwd: repo, encoding: "utf8" },
  );
  expect(tracked.trim()).toBe("");
});
test("frontend never uses a relative fetch (the user:pass@ URL form would break)", () => {
  const files = execFileSync(
    "git",
    ["ls-files", "--others", "--cached", "--exclude-standard", "apps/crm/src"],
    { cwd: repo, encoding: "utf8" },
  )
    .trim()
    .split("\n");
  const bad = files.filter((f) =>
    /fetch\(\s*["'`](?!https?:)/.test(readFileSync(`${repo}${f}`, "utf8")),
  );
  expect(bad).toEqual([]);
});
test("vendored api-client matches UPSTREAM.json", () => {
  const up = JSON.parse(readFileSync(`${repo}vendor/UPSTREAM.json`, "utf8"));
  const sha = execFileSync("sha256sum", [`${repo}vendor/${up.tarball}`], {
    encoding: "utf8",
  }).split(" ")[0];
  expect(sha).toBe(up.sha256);
});
