import { test, expect } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { withPrivateCliInput } from "../packages/hosted-runtime/src/private-cli-input";
test("AWS can reopen owner-only JSON without exposing payload in arguments", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "prism-cli-test-"));
  try {
    const input = JSON.stringify({ synthetic: "test-only-payload" });
    const result = withPrivateCliInput(
      directory,
      ["--cli-input-json", "file:///dev/stdin"],
      input,
      (args) => {
        expect(JSON.stringify(args)).not.toContain("test-only-payload");
        const filename = new URL(args[1]!);
        expect(statSync(filename).mode & 0o777).toBe(0o600);
        expect(statSync(path.dirname(filename.pathname)).mode & 0o777).toBe(
          0o700,
        );
        expect(readFileSync(filename, "utf8")).toBe(input);
        return "completed";
      },
    );
    expect(result).toBe("completed");
    expect(readdirSync(directory)).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("failed CLI calls also remove private input and unrelated input is refused", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "prism-cli-test-"));
  try {
    expect(() =>
      withPrivateCliInput(directory, ["file:///dev/stdin"], "{}", () => {
        throw new Error("synthetic failure");
      }),
    ).toThrow("synthetic failure");
    expect(readdirSync(directory)).toEqual([]);
    expect(() =>
      withPrivateCliInput(directory, ["get-item"], "{}", () => "unexpected"),
    ).toThrow("Explicit bounded");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
