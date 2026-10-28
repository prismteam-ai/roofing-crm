import { writeFileSync } from "node:fs";
import { writeReviewerAssetManifest } from "../packages/hosted-runtime/src/reviewer-assets";
import { buildConcurrencyPolicy } from "../packages/hosted-runtime/src/concurrency";
import {
  deploymentConcurrency,
  deployedConcurrency,
  verifyRuntimeConcurrency,
} from "../packages/hosted-runtime/src/deployment-concurrency";
import { CONTRACT_VERSION } from "../packages/contracts/src/index";
import { CAMPAIGN_PHASE } from "../packages/agent/src/campaign";
import {
  exactReviewOrigin,
  validateResourceBindings,
  enabledFlag,
} from "../packages/runtime-config/src/operations";
import { reviewModel } from "../packages/runtime-config/src/index";
import { OracleClient } from "../packages/oracle-client/src/index";
import { qualityFailure } from "../packages/agent/src/quality";
/** P3 operator entry point. Default is a local plan; cloud execution requires all exact release gates. */
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { sourceIdentity } from "../packages/hosted-runtime/src/source-identity";
import {
  validateReleasePins,
  validatedRegion,
  assertPinnedSource,
  assertCallerAccount,
  assertPackageIdentity,
  assertCostEnvelope,
  APPROVED_PUBLIC_MANIFEST_SHA256,
  type RuntimeIdentity,
} from "../packages/hosted-runtime/src/release";
import { authenticatedSmoke } from "../packages/hosted-runtime/src/smoke";
const action = process.argv[2] ?? "deploy",
  execute = process.argv.includes("--execute");
if (process.argv.includes("--execute") && process.argv.includes("--dry-run"))
  throw new Error("Conflicting execution modes");
if (
  !["deploy", "smoke", "evidence", "rotate-access", "destroy"].includes(
    action,
  ) ||
  process.argv.slice(3).some((x) => x !== "--execute" && x !== "--dry-run")
)
  throw new Error(
    "Expected deploy|smoke|evidence|rotate-access|destroy [--execute]",
  );
const required = [
  "PRISM_EXPECTED_ACCOUNT_ID",
  "PRISM_EXPECTED_HEAD",
  "PRISM_EXPECTED_TREE",
  "PRISM_EXPECTED_ARCHIVE_SHA256",
  "PRISM_DEPLOY_ASSET_BUCKET",
  "PRISM_PRIVATE_OPERATIONS_DIR",
  "PRISM_EXPECTED_SNAPSHOT_ID",
  "PRISM_EXPECTED_SNAPSHOT_DIGEST",
  "PRISM_AWS_ACTUAL_USD",
  "PRISM_AWS_PENDING_USD",
  "PRISM_P3_ACTUAL_USD",
  "PRISM_P3_PENDING_USD",
];
if (!execute) {
  console.log(
    JSON.stringify(
      {
        mode: "plan",
        action,
        region: "us-east-1",
        stage: "p3-review",
        concurrency: buildConcurrencyPolicy(process.env),
        source: sourceIdentity(),
        missing: required.filter((x) => !process.env[x]),
        steps:
          action === "deploy"
            ? [
                "Verify exact clean source, measured staging archive and frontend identity",
                "Check caller account, private asset bucket region/public-access block and cost envelope",
                "Upload exact hash-addressed Lambda archive; synthesize without lookups/bootstrap/ECR",
                "Deploy exact task stack through approved execution role; upload frontend; invalidate root/index",
              ]
            : action === "destroy"
              ? [
                  "Require evidence digest and teardown approval",
                  "Revoke shared access before exact stack deletion",
                  "Record retained buckets, tables, logs, versions, secret and map-key cleanup decisions",
                ]
              : [
                  "Verify exact deployed release and cost/account pins",
                  "Run bounded operation; redact secret values and private provider records",
                ],
        cloudServiceCalls: 0,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (process.env.PRISM_CLOUD_EXECUTION_APPROVED !== "yes")
  throw new Error("Explicit P3 cloud execution approval required");
if (
  process.env.PRISM_ENABLE_MODEL === "true" &&
  process.env.PRISM_LIVE_INFERENCE_APPROVED !== "yes"
)
  throw new Error("Separate model enablement approval required");
if (
  process.env.PRISM_ENABLE_MAP === "true" &&
  process.env.PRISM_LIVE_MAP_APPROVED !== "yes"
)
  throw new Error("Separate restricted map enablement approval required");
for (const field of [
  "PRISM_HUMAN_MFA_CONFIRMED",
  "PRISM_BUDGET_ALERTS_CONFIRMED",
  "PRISM_NO_PRODUCTION_RESOURCES_CONFIRMED",
]) {
  if (process.env[field] !== "yes")
    throw new Error(`Human readiness attestation required: ${field}`);
}
const get = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing private operator input: ${k}`);
  return v;
};
const expectedSnapshotId = get("PRISM_EXPECTED_SNAPSHOT_ID"),
  expectedSnapshotDigest = get("PRISM_EXPECTED_SNAPSHOT_DIGEST");
if (
  !/^[A-Za-z0-9._-]{1,200}$/.test(expectedSnapshotId) ||
  !/^[a-f0-9]{64}$/.test(expectedSnapshotDigest)
)
  throw new Error("Exact staged snapshot ID/digest required");
const pins = validateReleasePins({
  expectedAccountId: get("PRISM_EXPECTED_ACCOUNT_ID"),
  region: validatedRegion(process.env.PRISM_DEPLOY_REGION ?? "us-east-1", [
    process.env.AWS_REGION,
    process.env.AWS_DEFAULT_REGION,
  ]),
  stage: "p3-review",
  head: get("PRISM_EXPECTED_HEAD"),
  tree: get("PRISM_EXPECTED_TREE"),
  archiveSha256: get("PRISM_EXPECTED_ARCHIVE_SHA256"),
  publicManifestSha256: APPROVED_PUBLIC_MANIFEST_SHA256,
  assetBucket: get("PRISM_DEPLOY_ASSET_BUCKET"),
  assetPrefix: "prism-p3/crm/",
  stackName: "PrismCrmP3Review",
});
if (action === "deploy") {
  validateResourceBindings({
    account: pins.expectedAccountId,
    secretArn: get("PRISM_REVIEW_SECRET_ARN"),
    tableArn: get("PRISM_SHARED_TABLE_ARN"),
    executionRoleArn: get("PRISM_CFN_EXECUTION_ROLE_ARN"),
    oracleOrigin: get("PRISM_ORACLE_ORIGIN"),
  });
  enabledFlag(process.env.PRISM_ENABLE_MODEL);
  enabledFlag(process.env.PRISM_ENABLE_MAP);
  reviewModel(process.env.BEDROCK_MODEL_ID, true);
} else if (action === "rotate-access" || action === "destroy")
  validateResourceBindings({
    account: pins.expectedAccountId,
    secretArn: get("PRISM_REVIEW_SECRET_ARN"),
  });
assertPinnedSource(pins, sourceIdentity());
assertCostEnvelope({
  awsActual: Number(get("PRISM_AWS_ACTUAL_USD")),
  awsPending: Number(get("PRISM_AWS_PENDING_USD")),
  totalActual: Number(get("PRISM_P3_ACTUAL_USD")),
  totalPending: Number(get("PRISM_P3_PENDING_USD")),
});
const hash = (x: Uint8Array | string) =>
    createHash("sha256").update(x).digest("hex"),
  archive = await readFile("build/crm-lambda.zip"),
  report = JSON.parse(await readFile("build/release-package.json", "utf8")) as {
    identity: RuntimeIdentity;
    archiveSha256: string;
  };
if (report.archiveSha256 !== hash(archive))
  throw new Error("Measured archive changed");
assertPackageIdentity(pins, report.identity, hash(archive));
const operations = path.resolve(get("PRISM_PRIVATE_OPERATIONS_DIR"));
if (
  !path.isAbsolute(get("PRISM_PRIVATE_OPERATIONS_DIR")) ||
  operations.startsWith(process.cwd() + path.sep) ||
  /(?:^|\/)return(?:\/|$)|(?:^|\/)\.git(?:\/|$)/.test(operations)
)
  throw new Error(
    "Operations must use an absolute private directory outside source and returned evidence",
  );
await mkdir(operations, { recursive: true, mode: 0o700 });
for (let p = operations; ; p = path.dirname(p)) {
  if ((await lstat(p)).isSymbolicLink())
    throw new Error("Private operations path may not traverse symlinks");
  if (path.dirname(p) === p) break;
}
if ((await realpath(operations)) !== operations)
  throw new Error("Private path identity mismatch");
const concurrency =
  action === "deploy"
    ? await deploymentConcurrency(process.env, [
        process.cwd(),
        path.resolve(process.cwd(), "../..", "return"),
      ])
    : undefined;
const receiptFile = path.join(
    operations,
    `crm-${action}-${pins.archiveSha256.slice(0, 16)}.json`,
  ),
  receipt = {
    version: 1,
    application: "crm",
    action,
    head: pins.head,
    tree: pins.tree,
    archiveSha256: pins.archiveSha256,
    region: pins.region,
    stage: pins.stage,
    steps: [] as string[],
    status: "started",
    origin: "",
    retainedResources: [] as string[],
    concurrency: concurrency?.metadata as unknown,
  };
const save = () =>
  writeFile(receiptFile, JSON.stringify(receipt, null, 2) + "\n", {
    mode: 0o600,
  });
const aws = (args: string[], input?: string) => {
  try {
    return execFileSync("aws", ["--region", pins.region, ...args], {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        AWS_REGION: pins.region,
        AWS_DEFAULT_REGION: pins.region,
      },
    }).trim();
  } catch (error) {
    const failure = error as {
      message?: string;
      stdout?: unknown;
      stderr?: unknown;
      status?: number;
    };
    writeFileSync(
      path.join(operations, `aws-${args[0]}-${args[1]}-failure.private.json`),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          message: failure.message,
          stdout: String(failure.stdout ?? ""),
          stderr: String(failure.stderr ?? ""),
          status: failure.status,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    // eslint-disable-next-line preserve-caught-error -- The full cause is stored in the owner-only diagnostic above; do not print it through CLI error causes.
    throw new Error(
      `AWS ${args[0]}/${args[1]} failed; private arguments/provider output redacted`,
    );
  }
};
if (action === "deploy") {
  try {
    execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PRISM_STAGE: pins.stage,
        PRISM_REGION: pins.region,
        VITE_ORACLE_STUDIO_URL: get("PRISM_ORACLE_ORIGIN"),
      },
    });
  } catch {
    throw new Error(
      "Pinned frontend build failed; private build context redacted",
    );
  }
  const frontend = JSON.parse(
    await readFile("dist/release-identity.json", "utf8"),
  );
  if (JSON.stringify(frontend) !== JSON.stringify(report.identity))
    throw new Error(
      "Rebuilt frontend is not the exact measured staging identity",
    );
  if (
    !["base", "repair-1"].includes(
      process.env.PRISM_MODEL_PROMPT_REVISION ?? "base",
    )
  )
    throw new Error("Invalid model prompt revision");
  if (
    process.env.PRISM_ENABLE_MODEL === "true" &&
    (process.env.BEDROCK_MODEL_ID === "amazon.nova-lite-v1:0" ||
      process.env.PRISM_MODEL_PROMPT_REVISION === "repair-1")
  ) {
    qualityFailure(
      JSON.parse(
        await readFile(get("PRISM_MICRO_BASE_FAILURE_REPORT"), "utf8"),
      ),
      "base",
    );
    if (process.env.BEDROCK_MODEL_ID === "amazon.nova-lite-v1:0")
      qualityFailure(
        JSON.parse(
          await readFile(get("PRISM_MICRO_REPAIR_FAILURE_REPORT"), "utf8"),
        ),
        "repair-1",
      );
  }
}

assertCallerAccount(
  pins,
  (
    JSON.parse(aws(["sts", "get-caller-identity", "--output", "json"])) as {
      Account: string;
    }
  ).Account,
);
const outputs = () =>
  Object.fromEntries(
    (
      (
        JSON.parse(
          aws([
            "cloudformation",
            "describe-stacks",
            "--stack-name",
            pins.stackName,
            "--output",
            "json",
          ]),
        ) as {
          Stacks: { Outputs: { OutputKey: string; OutputValue: string }[] }[];
        }
      ).Stacks[0]?.Outputs ?? []
    ).map((x) => [x.OutputKey, x.OutputValue]),
  );
const assertDeployed = (o: Record<string, string>) => {
  if (
    o.ReleaseBuildId !== report.identity.buildId ||
    o.LambdaArchiveSha256 !== pins.archiveSha256 ||
    o.Region !== pins.region ||
    o.Stage !== pins.stage
  )
    throw new Error("Deployed release does not match exact pinned package");
  const actual = deployedConcurrency(o);
  if (
    concurrency &&
    (actual.mode !== concurrency.policy.mode ||
      actual.proofSha256 !== concurrency.metadata.proofSha256 ||
      actual.reservedConcurrentExecutions !==
        concurrency.policy.reservedConcurrentExecutions ||
      actual.apiRatePerSecond !== concurrency.policy.apiRatePerSecond ||
      actual.apiBurst !== concurrency.policy.apiBurst)
  )
    throw new Error(
      "Deployed concurrency policy/proof differs from approved release",
    );
  if (
    !/^PrismCrmP3Review-CrmHandler98FEA697-[A-Za-z0-9]+$/.test(
      o.RuntimeFunctionName ?? "",
    ) ||
    !/^[a-z0-9]{1,20}$/.test(o.HttpApiId ?? "") ||
    o.HttpApiStageName !== "$default"
  )
    throw new Error("Exact task runtime/API bindings missing");
  const functionSettings = JSON.parse(
    aws([
      "lambda",
      "get-function-configuration",
      "--function-name",
      o.RuntimeFunctionName,
      "--output",
      "json",
    ]),
  );
  if (
    functionSettings.FunctionName !== o.RuntimeFunctionName ||
    functionSettings.FunctionArn !==
      `arn:aws:lambda:${pins.region}:${pins.expectedAccountId}:function:${o.RuntimeFunctionName}`
  )
    throw new Error("Actual Lambda identity mismatch");
  const functionConcurrency = JSON.parse(
    aws([
      "lambda",
      "get-function-concurrency",
      "--function-name",
      o.RuntimeFunctionName,
      "--output",
      "json",
    ]),
  );
  const apiStage = JSON.parse(
    aws([
      "apigatewayv2",
      "get-stage",
      "--api-id",
      o.HttpApiId,
      "--stage-name",
      o.HttpApiStageName,
      "--output",
      "json",
    ]),
  );
  if (apiStage.StageName !== o.HttpApiStageName)
    throw new Error("Actual API stage identity mismatch");
  receipt.concurrency = verifyRuntimeConcurrency(actual, {
    reservedConcurrentExecutions:
      functionConcurrency.ReservedConcurrentExecutions,
    memoryMiB: functionSettings.MemorySize,
    apiRatePerSecond: apiStage.DefaultRouteSettings?.ThrottlingRateLimit,
    apiBurst: apiStage.DefaultRouteSettings?.ThrottlingBurstLimit,
  });
};
const step = async (name: string, f: () => unknown | Promise<unknown>) => {
  await f();
  receipt.steps.push(name);
  await save();
};
const privateCode = async () => {
  let code = "";
  for await (const chunk of process.stdin) {
    code += String(chunk);
    if (code.length > 1024) throw new Error("Private code too long");
  }
  code = code.trim();
  if (!code) throw new Error("Enter the review code privately on stdin");
  return code;
};
const exactOrigin = exactReviewOrigin;
const rotate = async () => {
  const secret = get("PRISM_REVIEW_SECRET_ARN");
  if (
    !new RegExp(
      `^arn:aws:secretsmanager:us-east-1:${pins.expectedAccountId}:secret:[A-Za-z0-9/_+=.@-]+$`,
    ).test(secret)
  )
    throw new Error("Exact shared secret reference required");
  const old = JSON.parse(
    aws([
      "secretsmanager",
      "get-secret-value",
      "--secret-id",
      secret,
      "--query",
      "SecretString",
      "--output",
      "text",
    ]),
  );
  const code = await privateCode();
  const merged = {
    ...old,
    signingKey: randomBytes(48).toString("base64url"),
    reviewCodeDigest: hash(code),
    keyVersion: randomBytes(12).toString("hex"),
  };
  aws(
    [
      "secretsmanager",
      "put-secret-value",
      "--cli-input-json",
      "file:///dev/stdin",
    ],
    JSON.stringify({ SecretId: secret, SecretString: JSON.stringify(merged) }),
  );
};
try {
  if (action === "deploy") {
    aws([
      "s3api",
      "head-bucket",
      "--bucket",
      pins.assetBucket,
      "--expected-bucket-owner",
      pins.expectedAccountId,
    ]);
    const location = JSON.parse(
      aws(["s3api", "get-bucket-location", "--bucket", pins.assetBucket]),
    ).LocationConstraint;
    if (location !== null && location !== pins.region)
      throw new Error("Deployment bucket region mismatch");
    const block = JSON.parse(
      aws(["s3api", "get-public-access-block", "--bucket", pins.assetBucket]),
    ).PublicAccessBlockConfiguration;
    if (Object.keys(block).length !== 4 || !Object.values(block).every(Boolean))
      throw new Error("All public access must be blocked on deployment bucket");
    const frontend = JSON.parse(
      await readFile("dist/release-identity.json", "utf8"),
    );
    if (frontend.buildId !== report.identity.buildId)
      throw new Error("Frontend identity differs from exact Lambda release");
    process.env.PRISM_FRONTEND_ASSET_MANIFEST_SHA256 =
      await writeReviewerAssetManifest("dist", report.identity.buildId);
    const role = get("PRISM_CFN_EXECUTION_ROLE_ARN");
    if (
      !new RegExp(
        `^arn:aws:iam::${pins.expectedAccountId}:role/prism-p3-[A-Za-z0-9_+=,.@/-]+$`,
      ).test(role)
    )
      throw new Error("Task-scoped execution role required");
    const upstreamOrigin = exactOrigin(get("PRISM_ORACLE_ORIGIN"));
    const upstream = await new OracleClient(upstreamOrigin, fetch, {
      allowLoopback: false,
      approvedOrigins: [upstreamOrigin],
      timeoutMs: 28000,
    }).health();
    const oracleBuildId = get("PRISM_ORACLE_EXPECTED_BUILD_ID");
    if (
      !/^[a-f0-9]{64}$/.test(oracleBuildId) ||
      upstream.buildId !== oracleBuildId ||
      upstream.region !== pins.region ||
      upstream.stage !== pins.stage ||
      upstream.snapshotId !== expectedSnapshotId ||
      (upstream.snapshotDigest ?? upstream.digest) !== expectedSnapshotDigest ||
      upstream.contractVersion !== CONTRACT_VERSION
    )
      throw new Error("Oracle is not the exact approved staged source/build");
    await step("archive_uploaded", () =>
      aws([
        "s3",
        "cp",
        "build/crm-lambda.zip",
        `s3://${pins.assetBucket}/${pins.assetPrefix}lambda/${pins.archiveSha256}.zip`,
        "--sse",
        "AES256",
        "--only-show-errors",
      ]),
    );
    execFileSync(process.execPath, ["--import", "tsx", "infra/cdk/app.ts"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PRISM_REGION: pins.region,
        PRISM_STAGE: pins.stage,
      },
    });
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/verify-cloud-template.ts"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const oracle = upstreamOrigin;
    const parameters = {
      DeploymentAssetBucket: pins.assetBucket,
      LambdaArchiveSha256: pins.archiveSha256,
      ReleaseBuildId: report.identity.buildId,
      OracleApiOrigin: oracle,
      ReviewAccessSecretArn: get("PRISM_REVIEW_SECRET_ARN"),
      SharedSessionQuotaTableArn: get("PRISM_SHARED_TABLE_ARN"),
      EnableModel: process.env.PRISM_ENABLE_MODEL ?? "false",
      EnableMap: process.env.PRISM_ENABLE_MAP ?? "false",
      BedrockModelId: process.env.BEDROCK_MODEL_ID ?? "amazon.nova-micro-v1:0",
      ModelPromptRevision: process.env.PRISM_MODEL_PROMPT_REVISION ?? "base",
    };
    if (
      parameters.EnableModel === "true" &&
      process.env.PRISM_LIVE_INFERENCE_APPROVED !== "yes"
    )
      throw new Error(
        "Separate live inference approval is required to enable model",
      );
    if (
      parameters.EnableMap === "true" &&
      process.env.PRISM_LIVE_MAP_APPROVED !== "yes"
    )
      throw new Error("Separate restricted live map approval required");
    if (
      parameters.EnableModel === "true" &&
      (parameters.BedrockModelId === "amazon.nova-lite-v1:0" ||
        parameters.ModelPromptRevision === "repair-1")
    ) {
      const baseFailureSha256 = qualityFailure(
        JSON.parse(
          await readFile(get("PRISM_MICRO_BASE_FAILURE_REPORT"), "utf8"),
        ),
        "base",
      );
      const repairFailureSha256 =
        parameters.BedrockModelId === "amazon.nova-lite-v1:0"
          ? qualityFailure(
              JSON.parse(
                await readFile(
                  get("PRISM_MICRO_REPAIR_FAILURE_REPORT"),
                  "utf8",
                ),
              ),
              "repair-1",
            )
          : undefined;
      const tableArn = parameters.SharedSessionQuotaTableArn;
      if (
        !new RegExp(
          `^arn:aws:dynamodb:us-east-1:${pins.expectedAccountId}:table/[A-Za-z0-9_.-]+$`,
        ).test(tableArn)
      )
        throw new Error("Exact shared table binding required");
      const item = {
        pk: { S: `campaign#${CAMPAIGN_PHASE}` },
        sk: { S: "quality-gate" },
        baseFailureSha256: { S: baseFailureSha256 },
        ...(repairFailureSha256
          ? { repairFailureSha256: { S: repairFailureSha256 } }
          : {}),
        repairAttempts: { N: "1" },
        measuredAt: { S: new Date().toISOString() },
      };
      await step("measured_quality_gate_recorded", () =>
        aws(
          ["dynamodb", "update-item", "--cli-input-json", "file:///dev/stdin"],
          JSON.stringify({
            TableName: tableArn.split("/")[1],
            Key: { pk: item.pk, sk: item.sk },
            UpdateExpression:
              "SET #base = :base, #attempts = :one, #measured = :at" +
              (repairFailureSha256 ? ", #repair = :repair" : ""),
            ConditionExpression: "attribute_not_exists(#base) OR #base = :base",
            ExpressionAttributeNames: {
              "#base": "baseFailureSha256",
              "#attempts": "repairAttempts",
              "#measured": "measuredAt",
              ...(repairFailureSha256
                ? { "#repair": "repairFailureSha256" }
                : {}),
            },
            ExpressionAttributeValues: {
              ":base": item.baseFailureSha256,
              ":one": item.repairAttempts,
              ":at": item.measuredAt,
              ...(repairFailureSha256
                ? { ":repair": item.repairFailureSha256 }
                : {}),
            },
            ReturnValues: "NONE",
          }),
        ),
      );
    }
    await step("stack_deployed", () =>
      aws([
        "cloudformation",
        "deploy",
        "--stack-name",
        pins.stackName,
        "--template-file",
        "cdk.out/PrismCrmP3Review.template.json",
        "--capabilities",
        "CAPABILITY_IAM",
        "--role-arn",
        role,
        "--parameter-overrides",
        ...Object.entries(parameters).map(([k, v]) => `${k}=${v}`),
        "--no-fail-on-empty-changeset",
      ]),
    );
    const o = outputs();
    assertDeployed(o);
    receipt.origin = exactOrigin(`https://${o.ProviderDomain}`);
    await step("frontend_uploaded", () =>
      aws([
        "s3",
        "sync",
        "dist",
        `s3://${o.AssetBucket}/`,
        "--sse",
        "AES256",
        "--only-show-errors",
        "--delete",
      ]),
    );
    await step("frontend_invalidated", () =>
      aws([
        "cloudfront",
        "create-invalidation",
        "--distribution-id",
        o.FrontendDistributionId,
        "--paths",
        "/",
        "/index.html",
        "/release-identity.json",
        "/assessment-asset-manifest.json",
        "/assessment-publication-manifest.json",
        "/assessment-gateway-proof.json",
        "/release-identity.json",
      ]),
    );
  } else {
    const o = outputs();
    assertDeployed(o);
    const origin = exactOrigin(`https://${o.ProviderDomain}`);
    receipt.origin = origin;
    if (action === "smoke")
      await step("authenticated_smoke", async () => {
        await authenticatedSmoke(origin, await privateCode(), {
          expectedBuildId: report.identity.buildId,
          expectedSnapshotId: get("PRISM_EXPECTED_SNAPSHOT_ID"),
          expectedSnapshotDigest: get("PRISM_EXPECTED_SNAPSHOT_DIGEST"),
        });
      });
    if (action === "evidence")
      await step("masked_browser_evidence", () =>
        execFileSync(
          process.execPath,
          ["--import", "tsx", "scripts/hosted-evidence.ts"],
          {
            stdio: ["inherit", "pipe", "pipe"],
            env: {
              ...process.env,
              PRISM_REVIEW_ORIGIN: origin,
              PRISM_PRIVATE_OPERATIONS_DIR: operations,
            },
          },
        ),
      );
    if (action === "rotate-access")
      await step("shared_access_rotated_preserving_map_config", rotate);
    if (action === "destroy") {
      if (
        process.env.PRISM_TEARDOWN_APPROVED !== "yes" ||
        !/^[a-f0-9]{64}$/.test(get("PRISM_ARCHIVED_EVIDENCE_SHA256"))
      )
        throw new Error(
          "Explicit teardown and archived evidence digest required",
        );
      await step("access_revoked", rotate);
      await step("exact_stack_deleted", () => {
        aws(["cloudformation", "delete-stack", "--stack-name", pins.stackName]);
        aws([
          "cloudformation",
          "wait",
          "stack-delete-complete",
          "--stack-name",
          pins.stackName,
        ]);
      });
      receipt.retainedResources = [
        "Frontend bucket and versions",
        "Lead table",
        "Seven-day log group",
        "Shared Oracle session/campaign table and review secret",
        "Deployment assets",
        "Oracle-owned restricted map key (revoke in Oracle teardown)",
      ];
    }
  }
  receipt.status = "completed";
  await save();
  console.log(
    JSON.stringify(
      {
        action,
        status: receipt.status,
        head: pins.head,
        tree: pins.tree,
        archiveSha256: pins.archiveSha256,
        origin: receipt.origin,
        concurrency: receipt.concurrency,
        steps: receipt.steps,
        retainedResources: receipt.retainedResources,
        privateReceiptSha256: hash(await readFile(receiptFile)),
      },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    path.join(operations, `crm-${action}-failure.private.json`),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : "non-error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  receipt.status = "failed_private_details_redacted";
  await save();
  // eslint-disable-next-line preserve-caught-error -- The full cause is stored in the owner-only diagnostic above; do not print it through CLI error causes.
  throw new Error(
    "Guarded operation failed; private receipt retained, secret/provider output redacted",
  );
}
