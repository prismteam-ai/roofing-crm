import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION } from "../packages/contracts/src/index";
import { sourceContext } from "../packages/hosted-runtime/src/source-context";
import { OracleClient } from "../packages/oracle-client/src/index";

const digest = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const localRegistry = path.resolve(
  "packages/hosted-runtime/src/source-context.ts",
);
const canonicalRegistry = path.resolve(
  process.env.PRISM_ORACLE_CONTRACT_DIR ??
    "../oracle-property-intelligence-platform-pipeline-oakland-mi/packages/contracts",
  "../hosted-runtime/src/source-context.ts",
);
const snapshotId = "report-context-regression-snapshot";
const reportId = "official-novi-residential-sales-pdf";

function clientWithSource(source: unknown) {
  return new OracleClient(
    "https://oracle.example.test",
    async () =>
      Response.json({
        version: "1",
        contractVersion: CONTRACT_VERSION,
        snapshotId,
        digest: "0".repeat(64),
        source,
      }),
    { approvedOrigins: ["https://oracle.example.test"] },
  );
}

describe("report metadata remains compatible across the Oracle boundary", () => {
  it("matches the canonical registry when available and the pinned registry standalone", () => {
    const bytes = readFileSync(localRegistry);
    expect(digest(bytes)).toBe(
      "dab329b0008c9e9f204d5f03fc2be72c2a47139f5bf15a48e07d91f6efdc0ac0",
    );
    if (existsSync(canonicalRegistry)) {
      expect(bytes.equals(readFileSync(canonicalRegistry))).toBe(true);
    }
  });

  it("accepts the current exact report metadata without weakening source identity", async () => {
    const expected = sourceContext(reportId, 3);
    expect(expected).not.toBeNull();
    await expect(
      clientWithSource(expected).sourceContext(reportId, snapshotId, 3),
    ).resolves.toEqual(expected);
  });

  it("rejects a changed caveat rather than silently accepting divergent metadata", async () => {
    const expected = sourceContext(reportId, 3)!;
    const changed = {
      ...expected,
      caveats: [...expected.caveats.slice(0, -1), "Different source policy"],
    };
    await expect(
      clientWithSource(changed).sourceContext(reportId, snapshotId, 3),
    ).rejects.toMatchObject({ code: "SNAPSHOT_UNAVAILABLE" });
  });
});
