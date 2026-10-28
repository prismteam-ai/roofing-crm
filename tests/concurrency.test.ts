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
  region: "us-east-2",
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
it("accepts fresh empty, the actual two Oracle types, or all four exact review types without returning identity fields", () => {
  expect(validateConcurrencyProof(proof, account, now)).toEqual({
    observedAt: proof.observedAt,
    concurrentExecutions: 10,
    unreservedConcurrentExecutions: 10,
    totalFunctionCount: 0,
  });
  const names = [
    "PrismOracleAssessmentReview-ReadApiB934CF2C-abc123",
    "PrismOracleAssessmentReview-AlertNotifier00EC01E7-alert123",
    "PrismCrmAssessmentReview-CrmHandler98FEA697-xyz456",
    "PrismCrmAssessmentReview-AlertNotifier00EC01E7-alert456",
  ];
  for (const count of [2, 4]) {
    const functions = names.slice(0, count).map((functionName) => ({
      functionName,
      functionArn: `arn:aws:lambda:us-east-2:${account}:function:${functionName}`,
    }));
    expect(
      validateConcurrencyProof(
        { ...proof, totalFunctionCount: count, functions },
        account,
        now,
      ),
    ).toEqual({
      observedAt: proof.observedAt,
      concurrentExecutions: 10,
      unreservedConcurrentExecutions: 10,
      totalFunctionCount: count,
    });
  }
});
it("rejects old, unrelated or changed logical types, repeated task types, wrong ARN and an over-four inventory", () => {
  const entry = (functionName: string) => ({
    functionName,
    functionArn: `arn:aws:lambda:us-east-2:${account}:function:${functionName}`,
  });
  for (const name of [
    "PrismOracleReview-ReadApiB934CF2C-old123",
    "PrismCrmReview-CrmHandler98FEA697-old123",
    "OtherProduction",
    "PrismOracleAssessmentReview-AnotherFunction00EC01E7-abc123",
    "PrismOracleAssessmentReview-AlertNotifierDEADBEEF-abc123",
    "PrismCrmAssessmentReview-AlertNotifierDEADBEEF-abc123",
    "PrismOracleAssessmentReview-ReadApiDEADBEEF-abc123",
  ])
    expect(() =>
      validateConcurrencyProof(
        { ...proof, totalFunctionCount: 1, functions: [entry(name)] },
        account,
        now,
      ),
    ).toThrow();
  const api = entry("PrismOracleAssessmentReview-ReadApiB934CF2C-abc123");
  const sameType = entry(
    "PrismOracleAssessmentReview-ReadApiB934CF2C-different123",
  );
  for (const functions of [
    [api, api],
    [api, sameType],
  ])
    expect(() =>
      validateConcurrencyProof(
        { ...proof, totalFunctionCount: 2, functions },
        account,
        now,
      ),
    ).toThrow("duplicate");
  for (const functionArn of [
    api.functionArn + ":alias",
    api.functionArn.replace("us-east-2", "us-east-1"),
    api.functionArn.replace(account, "345678901234"),
  ])
    expect(() =>
      validateConcurrencyProof(
        {
          ...proof,
          totalFunctionCount: 1,
          functions: [{ ...api, functionArn }],
        },
        account,
        now,
      ),
    ).toThrow();
  const functions = [
    api,
    entry("PrismOracleAssessmentReview-AlertNotifier00EC01E7-alert123"),
    entry("PrismCrmAssessmentReview-CrmHandler98FEA697-xyz456"),
    entry("PrismCrmAssessmentReview-AlertNotifier00EC01E7-alert456"),
    sameType,
  ];
  expect(() =>
    validateConcurrencyProof(
      { ...proof, totalFunctionCount: 5, functions },
      account,
      now,
    ),
  ).toThrow("inventory");
});
it("rejects stale/future, quota, account, inventory and unrelated-function proof", () => {
  const unrelated = {
    functionName: "OtherProduction",
    functionArn: `arn:aws:lambda:us-east-2:${account}:function:OtherProduction`,
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
  const functionName = "PrismOracleAssessmentReview-ReadApiB934CF2C-abc123";
  const f = {
    functionName,
    functionArn: `arn:aws:lambda:us-east-2:${account}:function:${functionName}`,
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
  await writeFile(
    path.join(root, "index.mjs"),
    'export const handler=async()=>({statusCode:200,body:"synthetic-synth-only"});',
  );
  execFileSync("zip", ["-X", "-q", "asset.zip", "index.mjs"], {
    cwd: root,
    stdio: "pipe",
  });
  const baseEnv = {
    PRISM_LAMBDA_ARCHIVE_PATH: path.join(root, "asset.zip"),
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    PRISM_REGION: "us-east-2",
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
      await readFile("cdk.out/PrismCrmAssessmentReview.template.json", "utf8"),
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
      (r) =>
        r.Type === "AWS::Lambda::Function" &&
        r.Properties.Handler === "index.handler",
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
        (r) =>
          r.Type === "AWS::Lambda::Function" &&
          r.Properties.Handler === "index.handler",
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
        (r) =>
          r.Type === "AWS::Lambda::Function" &&
          r.Properties.Handler === "index.handler",
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

it("verifies actual successful empty AWS CLI stdout as unreserved without masking reservation or transport failures", async () => {
  const { execFileSync } = await import("node:child_process");
  const {
    parseFunctionConcurrencyOutput,
    deployedConcurrency,
    verifyRuntimeConcurrency,
  } = await import("../packages/hosted-runtime/src/deployment-concurrency");
  // Replays the observed CLI transport boundary: successful process, zero stdout bytes.
  const observed = execFileSync(process.execPath, ["-e", "process.exit(0)"], {
    encoding: "utf8",
  });
  expect(observed.length).toBe(0);
  const policy = deployedConcurrency({
    ConcurrencyMode: "existing-account-shared",
    FunctionReservedConcurrency: "none",
    ExistingAccountConcurrency: "10",
    FunctionMemoryMiB: "512",
    ConcurrencyProofSha256: "a".repeat(64),
    ApiRatePerSecond: "2",
    ApiBurst: "6",
  });
  const readback = { memoryMiB: 512, apiRatePerSecond: 2, apiBurst: 6 };
  expect(
    verifyRuntimeConcurrency(policy, {
      ...readback,
      reservedConcurrentExecutions:
        parseFunctionConcurrencyOutput(observed).ReservedConcurrentExecutions,
    }).actualVerified,
  ).toBe(true);
  expect(parseFunctionConcurrencyOutput(" \r\n")).toEqual({});
  expect(parseFunctionConcurrencyOutput("{}\n")).toEqual({});
  for (const count of [0, 2, 10]) {
    const parsed = parseFunctionConcurrencyOutput(
      JSON.stringify({ ReservedConcurrentExecutions: count }),
    );
    expect(parsed.ReservedConcurrentExecutions).toBe(count);
    expect(() =>
      verifyRuntimeConcurrency(policy, {
        ...readback,
        reservedConcurrentExecutions: parsed.ReservedConcurrentExecutions,
      }),
    ).toThrow("Actual Lambda");
  }
  const reserved = deployedConcurrency({
    ConcurrencyMode: "reserved",
    FunctionReservedConcurrency: "2",
    ExistingAccountConcurrency: "not-used",
    FunctionMemoryMiB: "512",
    ApiRatePerSecond: "2",
    ApiBurst: "6",
  });
  expect(() =>
    verifyRuntimeConcurrency(reserved, {
      ...readback,
      reservedConcurrentExecutions:
        parseFunctionConcurrencyOutput(observed).ReservedConcurrentExecutions,
    }),
  ).toThrow("Actual Lambda");
  expect(() =>
    parseFunctionConcurrencyOutput(
      execFileSync(process.execPath, ["-e", "process.exit(9)"], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    ),
  ).toThrow();
});
it("rejects nonempty malformed or unexpected Lambda concurrency responses", async () => {
  const { parseFunctionConcurrencyOutput } =
    await import("../packages/hosted-runtime/src/deployment-concurrency");
  for (const raw of [
    "broken",
    "null",
    "[]",
    "0",
    "false",
    '""',
    '{"Unexpected":1}',
    '{"ReservedConcurrentExecutions":2,"Unexpected":1}',
    '{"ReservedConcurrentExecutions":null}',
    '{"ReservedConcurrentExecutions":"2"}',
    '{"ReservedConcurrentExecutions":-1}',
    '{"ReservedConcurrentExecutions":1.5}',
    '{"ReservedConcurrentExecutions":9007199254740992}',
  ])
    expect(() => parseFunctionConcurrencyOutput(raw)).toThrow(
      "Invalid Lambda concurrency response",
    );
});
