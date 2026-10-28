import { expect, it } from "vitest";
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
it("the actual standalone contract checker rejects module, metadata and inventory drift", async () => {
  const temp = await mkdtemp(
    path.join(os.tmpdir(), "prism-contract-inventory-"),
  );
  try {
    await writeFile(
      path.join(temp, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    await mkdir(path.join(temp, "scripts"));
    await mkdir(path.join(temp, "packages"));
    await cp(
      "scripts/sync-contract.ts",
      path.join(temp, "scripts/sync-contract.ts"),
    );
    const target = path.join(temp, "packages/contracts");
    await cp("packages/contracts", target, { recursive: true });
    const invoke = () =>
      spawnSync(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          path.join(temp, "scripts/sync-contract.ts"),
          "--check",
        ],
        {
          env: {
            ...process.env,
            PRISM_ORACLE_CONTRACT_DIR: path.join(temp, "absent-producer"),
          },
          encoding: "utf8",
          timeout: 10000,
        },
      );
    const valid = invoke();
    expect(valid.status, valid.stderr).toBe(0);
    expect(valid.stdout).toContain(
      '"mode":"standalone-three-module-lock-verified"',
    );
    const source = path.join(target, "src/source-observations.ts"),
      original = await readFile(source);
    await writeFile(
      source,
      Buffer.concat([original, Buffer.from("\n// drift\n")]),
    );
    expect(invoke().status).not.toBe(0);
    await writeFile(source, original);
    const extra = path.join(target, "src/unpinned-module.ts");
    await writeFile(extra, "export const injected = true;\n");
    expect(invoke().status).not.toBe(0);
    await rm(extra);
    const manifestFile = path.join(target, "contract_manifest.json"),
      manifest = await readFile(manifestFile);
    await writeFile(
      manifestFile,
      JSON.stringify({
        ...JSON.parse(manifest.toString()),
        moduleGraphSha256: "f".repeat(64),
      }),
    );
    expect(invoke().status).not.toBe(0);
    await writeFile(manifestFile, manifest);
    expect(invoke().status).toBe(0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
