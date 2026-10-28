import { it, expect } from "vitest";
import {
  mkdtemp,
  writeFile,
  chmod,
  symlink,
  link,
  mkdir,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  buildConcurrencyPolicy,
  validateConcurrencyProof,
} from "../packages/hosted-runtime/src/concurrency.ts";
import { loadConcurrencyProof } from "../packages/hosted-runtime/src/concurrency-file.ts";
const now = Date.parse("2026-10-27T21:00:00.000Z"),
  account = "234567890123";
const proof = {
  version: 1,
  observedAt: new Date(now).toISOString(),
  accountId: account,
  region: "us-east-1",
  concurrentExecutions: 10,
  unreservedConcurrentExecutions: 10,
  totalFunctionCount: 0,
  functions: [] as { functionName: string; functionArn: string }[],
};
it("defaults to bounded reserved5 and requires explicit exact historical shared opt-in", () => {
  expect(buildConcurrencyPolicy({})).toMatchObject({
    mode: "reserved",
    reservedConcurrentExecutions: 5,
    apiRatePerSecond: 5,
    apiBurst: 10,
  });
  for (const env of [
    { PRISM_CONCURRENCY_MODE: "other" },
    { PRISM_CONCURRENCY_MODE: "existing-account-shared" },
    {
      PRISM_CONCURRENCY_MODE: "existing-account-shared",
      PRISM_SHARED_ACCOUNT_CONCURRENCY_APPROVED: "yes",
      PRISM_EXISTING_ACCOUNT_CONCURRENCY: "11",
    },
  ])
    expect(() => buildConcurrencyPolicy(env)).toThrow();
  expect(
    buildConcurrencyPolicy({
      PRISM_CONCURRENCY_MODE: "existing-account-shared",
      PRISM_SHARED_ACCOUNT_CONCURRENCY_APPROVED: "yes",
      PRISM_EXISTING_ACCOUNT_CONCURRENCY: "10",
    }),
  ).toEqual({
    mode: "existing-account-shared",
    reservedConcurrentExecutions: null,
    existingAccountConcurrency: 10,
    apiRatePerSecond: 2,
    apiBurst: 6,
  });
});
it("strictly bounds explicit reserved/API knobs and rejects ambiguous numbers", () => {
  for (const [key, min, max] of [
    ["PRISM_RESERVED_CONCURRENCY", 2, 12],
    ["PRISM_API_RATE_PER_SECOND", 2, 10],
    ["PRISM_API_BURST", 6, 20],
  ] as const) {
    for (const raw of [
      "",
      String(min - 1),
      String(max + 1),
      "2.5",
      "1e1",
      "05",
      " 5",
      "5\n",
      "Infinity",
      "9007199254740992",
    ])
      expect(() => buildConcurrencyPolicy({ [key]: raw })).toThrow();
    expect(() => buildConcurrencyPolicy({ [key]: String(min) })).not.toThrow();
    expect(() => buildConcurrencyPolicy({ [key]: String(max) })).not.toThrow();
  }
  expect(
    buildConcurrencyPolicy({
      PRISM_RESERVED_CONCURRENCY: "12",
      PRISM_API_RATE_PER_SECOND: "10",
      PRISM_API_BURST: "20",
    }),
  ).toMatchObject({
    reservedConcurrentExecutions: 12,
    apiRatePerSecond: 10,
    apiBurst: 20,
  });
  expect(() =>
    buildConcurrencyPolicy({
      PRISM_CONCURRENCY_MODE: "existing-account-shared",
      PRISM_SHARED_ACCOUNT_CONCURRENCY_APPROVED: "yes",
      PRISM_EXISTING_ACCOUNT_CONCURRENCY: "10",
      PRISM_RESERVED_CONCURRENCY: "5",
    }),
  ).toThrow("cannot be selected");
});
it("accepts fresh empty or two exact task functions and returns no account or ARN", () => {
  expect(validateConcurrencyProof(proof, account, now)).toEqual({
    observedAt: proof.observedAt,
    concurrentExecutions: 10,
    unreservedConcurrentExecutions: 10,
    totalFunctionCount: 0,
  });
  const functions = [
    "PrismOracleReview-ReadApiB934CF2C-abc123",
    "PrismCrmP3Review-CrmHandler98FEA697-xyz456",
  ].map((functionName) => ({
    functionName,
    functionArn: `arn:aws:lambda:us-east-1:${account}:function:${functionName}`,
  }));
  expect(
    validateConcurrencyProof(
      { ...proof, totalFunctionCount: 2, functions },
      account,
      now,
    ).totalFunctionCount,
  ).toBe(2);
});
it("rejects stale/future, quota, account, inventory and unrelated-function proof", () => {
  const unrelated = {
    functionName: "OtherProduction",
    functionArn: `arn:aws:lambda:us-east-1:${account}:function:OtherProduction`,
  };
  for (const delta of [
    { observedAt: new Date(now - 900001).toISOString() },
    { observedAt: new Date(now + 30001).toISOString() },
    { accountId: "345678901234" },
    { region: "us-west-2" },
    { concurrentExecutions: 11 },
    { unreservedConcurrentExecutions: 9 },
    { totalFunctionCount: 1 },
    { extra: "raw" },
    { totalFunctionCount: 1, functions: [unrelated] },
  ])
    expect(() =>
      validateConcurrencyProof({ ...proof, ...delta }, account, now),
    ).toThrow();
  const functionName = "PrismOracleReview-ReadApiB934CF2C-abc123";
  const f = {
    functionName,
    functionArn: `arn:aws:lambda:us-east-1:${account}:function:${functionName}`,
  };
  expect(() =>
    validateConcurrencyProof(
      { ...proof, totalFunctionCount: 2, functions: [f, f] },
      account,
      now,
    ),
  ).toThrow();
  expect(() =>
    validateConcurrencyProof(
      {
        ...proof,
        totalFunctionCount: 1,
        functions: [{ ...f, functionArn: f.functionArn + ":alias" }],
      },
      account,
      now,
    ),
  ).toThrow();
});
it("loads owner0600 private metadata, rejects links/Return/Git/public permissions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "prism-capacity-"));
  const returned = path.join(root, "return"),
    file = path.join(root, "proof.json");
  await mkdir(returned);
  await writeFile(file, JSON.stringify(proof), { mode: 0o600 });
  expect(
    await loadConcurrencyProof(file, account, [returned], now),
  ).toMatchObject({
    totalFunctionCount: 0,
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  const soft = path.join(root, "soft.json");
  await symlink(file, soft);
  await expect(
    loadConcurrencyProof(soft, account, [returned], now),
  ).rejects.toThrow();
  await chmod(file, 0o644);
  await expect(
    loadConcurrencyProof(file, account, [returned], now),
  ).rejects.toThrow();
  await chmod(file, 0o600);
  const ret = path.join(returned, "proof.json");
  await writeFile(ret, JSON.stringify(proof), { mode: 0o600 });
  await expect(
    loadConcurrencyProof(ret, account, [returned], now),
  ).rejects.toThrow();
  await link(file, path.join(root, "hard.json"));
  await expect(
    loadConcurrencyProof(file, account, [returned], now),
  ).rejects.toThrow();
  const git = path.join(root, "repo");
  await mkdir(git);
  await mkdir(path.join(git, ".git"));
  const g = path.join(git, "proof.json");
  await writeFile(g, JSON.stringify(proof), { mode: 0o600 });
  await expect(
    loadConcurrencyProof(g, account, [returned], now),
  ).rejects.toThrow();
});

it("requires the private proof for shared synthesis configuration and reads actual deployed mode without new approval", async () => {
  const { deploymentConcurrency, deployedConcurrency } =
    await import("../packages/hosted-runtime/src/deployment-concurrency");
  expect(
    (await deploymentConcurrency({}, [])).policy.reservedConcurrentExecutions,
  ).toBe(5);
  expect(
    (
      await deploymentConcurrency(
        {
          PRISM_RESERVED_CONCURRENCY: "8",
          PRISM_API_RATE_PER_SECOND: "7",
          PRISM_API_BURST: "16",
        },
        [],
      )
    ).policy,
  ).toMatchObject({
    reservedConcurrentExecutions: 8,
    apiRatePerSecond: 7,
    apiBurst: 16,
  });
  const env = {
    PRISM_CONCURRENCY_MODE: "existing-account-shared",
    PRISM_SHARED_ACCOUNT_CONCURRENCY_APPROVED: "yes",
    PRISM_EXISTING_ACCOUNT_CONCURRENCY: "10",
    PRISM_EXPECTED_ACCOUNT_ID: account,
  };
  await expect(deploymentConcurrency(env, [])).rejects.toThrow("private");
  await expect(
    deploymentConcurrency({ ...env, PRISM_CONCURRENCY_MODE: "reserved" }, [], {
      mode: "existing-account-shared",
    }),
  ).rejects.toThrow("Mixed");
  const actual = deployedConcurrency({
    ConcurrencyMode: "existing-account-shared",
    FunctionReservedConcurrency: "none",
    ExistingAccountConcurrency: "10",
    FunctionMemoryMiB: "512",
    ConcurrencyProofSha256: "a".repeat(64),
    ApiRatePerSecond: "2",
    ApiBurst: "6",
  });
  expect(actual.reservedConcurrentExecutions).toBeNull();
  expect(actual.existingAccountConcurrency).toBe(10);
  expect(actual.deviation).toContain("no per-function");
  expect(() =>
    deployedConcurrency({
      ConcurrencyMode: "existing-account-shared",
      FunctionReservedConcurrency: "0",
      ExistingAccountConcurrency: "10",
      FunctionMemoryMiB: "512",
      ConcurrencyProofSha256: "a".repeat(64),
      ApiRatePerSecond: "2",
      ApiBurst: "6",
    }),
  ).toThrow();
});
it("verifies actual Lambda/API policy rather than trusting declared output metadata", async () => {
  const { deployedConcurrency, verifyRuntimeConcurrency } =
    await import("../packages/hosted-runtime/src/deployment-concurrency");
  const outputs = {
    ConcurrencyMode: "reserved",
    FunctionReservedConcurrency: "5",
    ExistingAccountConcurrency: "not-used",
    FunctionMemoryMiB: "512",
    ApiRatePerSecond: "5",
    ApiBurst: "10",
  };
  const policy = deployedConcurrency(outputs),
    observed = {
      reservedConcurrentExecutions: 5,
      memoryMiB: 512,
      apiRatePerSecond: 5,
      apiBurst: 10,
    };
  expect(verifyRuntimeConcurrency(policy, observed).actualVerified).toBe(true);
  for (const delta of [
    { reservedConcurrentExecutions: 2 },
    { reservedConcurrentExecutions: undefined },
    { memoryMiB: 1024 },
    { apiRatePerSecond: 6 },
    { apiBurst: 11 },
  ])
    expect(() =>
      verifyRuntimeConcurrency(policy, { ...observed, ...delta }),
    ).toThrow("Actual");
  for (const delta of [
    { FunctionReservedConcurrency: "13" },
    { ApiRatePerSecond: "11" },
    { ApiBurst: "21" },
    { ApiBurst: undefined },
  ])
    expect(() =>
      deployedConcurrency({ ...outputs, ...delta } as Record<string, string>),
    ).toThrow();
});
it("synthesizes reserved5/default API5/burst10, bounded custom capacity, and historical private shared10/API2/burst6", async () => {
  const { execFileSync } = await import("node:child_process"),
    { readFile, rm } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(os.tmpdir(), "prism-crm-shared-")),
    file = path.join(root, "proof.json");
  const baseEnv = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    PRISM_REGION: "us-east-1",
  };
  const synth = (env: Record<string, string>) => {
    execFileSync(process.execPath, ["--import", "tsx", "infra/cdk/app.ts"], {
      cwd: process.cwd(),
      env,
      stdio: "pipe",
    });
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/verify-cloud-template.ts"],
      {
        cwd: process.cwd(),
        env,
        stdio: "pipe",
      },
    );
  };
  const template = async () =>
    JSON.parse(
      await readFile("cdk.out/PrismCrmP3Review.template.json", "utf8"),
    ) as {
      Resources: Record<
        string,
        { Type: string; Properties: Record<string, unknown> }
      >;
      Metadata: { PrismConcurrency: Record<string, unknown> };
      Outputs: Record<string, { Value: unknown }>;
    };
  try {
    synth(baseEnv);
    const strict = await template();
    const fn = Object.values(strict.Resources).find(
      (r) => r.Type === "AWS::Lambda::Function",
    )!;
    expect(fn.Properties.ReservedConcurrentExecutions).toBe(5);
    expect(strict.Outputs.FunctionReservedConcurrency.Value).toBe("5");
    expect(strict.Outputs.ApiRatePerSecond.Value).toBe("5");
    expect(strict.Outputs.ApiBurst.Value).toBe("10");
    expect(fn.Properties.MemorySize).toBe(512);
    expect(JSON.stringify(strict.Metadata)).not.toContain(":null");
    synth({
      ...baseEnv,
      PRISM_RESERVED_CONCURRENCY: "12",
      PRISM_API_RATE_PER_SECOND: "10",
      PRISM_API_BURST: "20",
    });
    const custom = await template();
    expect(
      Object.values(custom.Resources).find(
        (r) => r.Type === "AWS::Lambda::Function",
      )!.Properties.ReservedConcurrentExecutions,
    ).toBe(12);
    expect(custom.Metadata.PrismConcurrency).toMatchObject({
      reservedConcurrentExecutions: 12,
      apiRatePerSecond: 10,
      apiBurst: 20,
    });
    expect(custom.Outputs.FunctionReservedConcurrency.Value).toBe("12");
    expect(custom.Outputs.ApiRatePerSecond.Value).toBe("10");
    expect(custom.Outputs.ApiBurst.Value).toBe("20");
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/verify-cloud-template.ts"],
      { cwd: process.cwd(), env: baseEnv, stdio: "pipe" },
    );
    await writeFile(
      file,
      JSON.stringify({ ...proof, observedAt: new Date().toISOString() }),
      { mode: 0o600 },
    );
    const shared = {
      ...baseEnv,
      PRISM_CONCURRENCY_MODE: "existing-account-shared",
      PRISM_EXISTING_ACCOUNT_CONCURRENCY: "10",
      PRISM_SHARED_ACCOUNT_CONCURRENCY_APPROVED: "yes",
      PRISM_EXPECTED_ACCOUNT_ID: account,
      PRISM_ACCOUNT_CONCURRENCY_PROOF: file,
    };
    synth(shared);
    const selected = await template(),
      sharedFn = Object.values(selected.Resources).find(
        (r) => r.Type === "AWS::Lambda::Function",
      )!;
    expect(
      Object.hasOwn(sharedFn.Properties, "ReservedConcurrentExecutions"),
    ).toBe(false);
    expect(sharedFn.Properties.MemorySize).toBe(512);
    expect(selected.Metadata.PrismConcurrency).toMatchObject({
      mode: "existing-account-shared",
      existingAccountConcurrency: 10,
      reservedConcurrentExecutions: "none",
      proofSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(selected.Metadata)).not.toContain(account);
    expect(
      Object.values(selected.Resources).some(
        (r) =>
          r.Type === "AWS::ApiGatewayV2::Stage" &&
          JSON.stringify(r.Properties.DefaultRouteSettings) ===
            JSON.stringify({ ThrottlingBurstLimit: 6, ThrottlingRateLimit: 2 }),
      ),
    ).toBe(true);
    expect(() =>
      synth({ ...shared, PRISM_SHARED_ACCOUNT_CONCURRENCY_APPROVED: "no" }),
    ).toThrow();
    expect(() =>
      synth({
        ...shared,
        PRISM_ACCOUNT_CONCURRENCY_PROOF: path.join(root, "missing"),
      }),
    ).toThrow();
  } finally {
    synth(baseEnv);
    await rm(root, { recursive: true, force: true });
  }
}, 15000);

it("supports a fresh checkout with absent protected Return paths while preserving canonical exclusions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "prism-fresh-proof-"));
  const file = path.join(root, "proof.json");
  await writeFile(file, JSON.stringify(proof), { mode: 0o600 });
  expect(
    await loadConcurrencyProof(
      file,
      account,
      [path.join(root, "not-created", "return")],
      now,
    ),
  ).toMatchObject({ totalFunctionCount: 0 });
  const excluded = path.join(root, "excluded");
  await mkdir(excluded);
  const inside = path.join(excluded, "proof.json");
  await writeFile(inside, JSON.stringify(proof), { mode: 0o600 });
  const alias = path.join(root, "excluded-alias");
  await symlink(excluded, alias);
  await expect(
    loadConcurrencyProof(inside, account, [alias], now),
  ).rejects.toThrow("outside repositories and Return");
});
