/**
 * Access-boundary guard: API and web source must not fetch IPFS/Filebase directly.
 *
 * Allowed: elephant-mcp-env.ts (MCP child env maps) and this test file.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const monorepoRootPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const SCAN_ROOTS = [
  path.join(monorepoRootPath, "apps/api/src"),
  path.join(monorepoRootPath, "apps/web/src"),
] as const;

const ALLOWED_RELATIVE_PATHS = new Set([
  "apps/api/src/elephant-mcp-env.ts",
  "apps/api/src/access-boundary-guard.test.ts",
]);

const FORBIDDEN_PATTERNS = [/ipfs\.filebase\.io/i, /\/ipns\//i, /\/ipfs\//i] as const;

function listSourceFiles(directoryPath: string): string[] {
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativeFromMonorepo(absolutePath: string): string {
  return path.relative(monorepoRootPath, absolutePath).split(path.sep).join("/");
}

describe("access boundary guard", () => {
  it("does not embed IPFS/Filebase gateway URLs outside MCP env config", () => {
    const violations: string[] = [];

    for (const scanRoot of SCAN_ROOTS) {
      for (const filePath of listSourceFiles(scanRoot)) {
        const relativePath = relativeFromMonorepo(filePath);
        if (ALLOWED_RELATIVE_PATHS.has(relativePath)) {
          continue;
        }
        if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) {
          continue;
        }
        const contents = readFileSync(filePath, "utf8");
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(contents)) {
            violations.push(`${relativePath} matches ${pattern.source}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
