// Covers the thin DuckDB connection wrapper (apps/sync/src/engine/duckdb.ts) — the one place in
// apps/sync allowed to import @duckdb/node-api directly (ARD § 4, AD-19). It had zero test
// coverage: nothing proved it actually opens a usable, single-threaded, in-memory connection.
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInMemoryConnection, duckDbOptionsFromEnv } from "../src/engine/duckdb.js";

describe("createInMemoryConnection", () => {
  it("opens a fresh in-memory DuckDB connection that can run a query and read rows back", async () => {
    const connection = await createInMemoryConnection();
    try {
      const reader = await connection.runAndReadAll("SELECT 1 AS one, 'x' AS letter");
      const rows = reader.getRowObjectsJS();
      expect(rows).toEqual([{ one: 1, letter: "x" }]);
    } finally {
      connection.closeSync();
    }
  });

  it("is single-threaded (Lambda-sandbox sizing) — threads is pinned to 1", async () => {
    const connection = await createInMemoryConnection();
    try {
      const reader = await connection.runAndReadAll("SELECT current_setting('threads') AS threads");
      const rows = reader.getRowObjectsJS() as { threads: string | number }[];
      expect(String(rows[0]?.threads)).toBe("1");
    } finally {
      connection.closeSync();
    }
  });

  it("returns an independent connection each call (state from one does not leak into another)", async () => {
    const first = await createInMemoryConnection();
    const second = await createInMemoryConnection();
    try {
      await first.run("CREATE TABLE only_in_first (x INTEGER)");
      await expect(second.runAndReadAll("SELECT * FROM only_in_first")).rejects.toThrow();
    } finally {
      first.closeSync();
      second.closeSync();
    }
  });

  it("applies memory_limit and temp_directory so a full-county build spills to /tmp instead of OOM-ing", async () => {
    const spillDir = mkdtempSync(join(tmpdir(), "duckdb-spill-test-"));
    const connection = await createInMemoryConnection({
      memoryLimit: "256MB",
      tempDirectory: spillDir,
    });
    try {
      const reader = await connection.runAndReadAll(
        "SELECT current_setting('memory_limit') AS memory_limit, current_setting('temp_directory') AS temp_directory",
      );
      const [row] = reader.getRowObjectsJS() as { memory_limit: string; temp_directory: string }[];
      // DuckDB reports the limit back in its own unit rendering (256MB -> "244.1 MiB").
      expect(row?.memory_limit).toMatch(/MiB|MB/);
      expect(row?.memory_limit).not.toMatch(/GiB/);
      expect(row?.temp_directory).toBe(spillDir);
    } finally {
      connection.closeSync();
      rmSync(spillDir, { recursive: true, force: true });
    }
  });
});

describe("duckDbOptionsFromEnv", () => {
  it("reads DUCKDB_MEMORY_LIMIT and pins the spill directory to the given /tmp path", () => {
    expect(duckDbOptionsFromEnv({ DUCKDB_MEMORY_LIMIT: "1800MB" }, "/tmp/x/spill")).toEqual({
      memoryLimit: "1800MB",
      tempDirectory: "/tmp/x/spill",
    });
  });

  it("leaves DuckDB's own memory default when DUCKDB_MEMORY_LIMIT is unset (local/tests)", () => {
    expect(duckDbOptionsFromEnv({}, "/tmp/x/spill")).toEqual({ tempDirectory: "/tmp/x/spill" });
  });

  it("rejects a malformed DUCKDB_MEMORY_LIMIT rather than passing it to DuckDB", () => {
    expect(() => duckDbOptionsFromEnv({ DUCKDB_MEMORY_LIMIT: "lots" }, "/tmp/x")).toThrow(
      /DUCKDB_MEMORY_LIMIT/,
    );
  });
});
