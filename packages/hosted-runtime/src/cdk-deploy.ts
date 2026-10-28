import path from "node:path";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { validatedRegion, type ReleasePins } from "./release";

export const BOOTSTRAP_QUALIFIER = "prismrvw";
export const BOOTSTRAP_TOOLKIT_STACK = "PrismAssessmentReviewToolkit";

/** Standard bootstrap roles remain confined to the pinned candidate account/region. */
export function bootstrapBindings(account: string, region = "us-east-2") {
  validatedRegion(region);
  if (
    !/^\d{12}$/.test(account) ||
    ["000000000000", "111122223333", "123456789012"].includes(account)
  )
    throw new Error("Exact non-placeholder bootstrap account required");
  return {
    bucket: `cdk-${BOOTSTRAP_QUALIFIER}-assets-${account}-${region}`,
    executionRole: `arn:aws:iam::${account}:role/cdk-${BOOTSTRAP_QUALIFIER}-cfn-exec-role-${account}-${region}`,
  };
}

/** No shell parsing and no arbitrary app command, account, stack or parameter flags. */
export function cdkDeployArguments(input: {
  pins: ReleasePins;
  parameters: Readonly<Record<string, string>>;
  outputsFile: string;
}) {
  const p = input.pins;
  const expected = bootstrapBindings(p.expectedAccountId, p.region);
  if (
    p.stackName !== "PrismCrmAssessmentReview" ||
    p.stage !== "review" ||
    p.assetBucket !== expected.bucket ||
    !path.isAbsolute(input.outputsFile)
  )
    throw new Error("Exact review stack/bootstrap/output bindings required");
  const allowed = new Set([
    "LambdaArchiveSha256",
    "ReleaseBuildId",
    "OracleApiOrigin",
    "ReviewAccessSecretArn",
    "SharedSessionQuotaTableArn",
    "EnableModel",
    "EnableMap",
    "BedrockModelId",
    "ModelPromptRevision",
  ]);
  const keys = Object.keys(input.parameters).sort();
  if (
    keys.length !== allowed.size ||
    keys.some(
      (key) =>
        !allowed.has(key) ||
        /[\r\n]/.test(input.parameters[key]) ||
        input.parameters[key].includes(String.fromCharCode(0)),
    )
  )
    throw new Error("CDK deploy parameter inventory rejected");
  return [
    "--app",
    "cdk.out",
    "deploy",
    p.stackName,
    "--toolkit-stack-name",
    BOOTSTRAP_TOOLKIT_STACK,
    "--exclusively",
    "--no-lookups",
    "--require-approval",
    "never",
    "--concurrency",
    "1",
    "--asset-parallelism",
    "false",
    "--outputs-file",
    input.outputsFile,
    ...keys.flatMap((key) => [
      "--parameters",
      `${p.stackName}:${key}=${input.parameters[key]}`,
    ]),
  ];
}

export function cdkBootstrapArguments(account: string, policies: string) {
  bootstrapBindings(account);
  const expected = ["storage", "runtime"]
    .map(
      (scope) =>
        `arn:aws:iam::${account}:policy/prism-assessment-review-execution-${scope}`,
    )
    .join(",");
  if (policies !== expected)
    throw new Error(
      "Exact ordered pair of task-scoped CloudFormation execution policies required; broad defaults are forbidden",
    );
  return [
    "bootstrap",
    `aws://${account}/us-east-2`,
    "--toolkit-stack-name",
    BOOTSTRAP_TOOLKIT_STACK,
    "--qualifier",
    BOOTSTRAP_QUALIFIER,
    ...policies
      .split(",")
      .flatMap((arn) => ["--cloudformation-execution-policies", arn]),
    "--termination-protection",
  ];
}

export interface CdkDeployment {
  pins: ReleasePins;
  parameters: Readonly<Record<string, string>>;
  outputsFile: string;
}
export interface PrivateCdkFailure {
  status?: number;
  stdout: string;
  stderr: string;
}
const redactedCdkFailure = () =>
  new Error("CDK deploy failed; provider output retained privately");

/** Exact argument guards run before the only injected process boundary. */
export function executeCdkDeployment(
  input: CdkDeployment,
  invoke: (arguments_: readonly string[]) => void,
  retainPrivateFailure: (failure: PrivateCdkFailure) => void,
): void {
  const arguments_ = cdkDeployArguments(input);
  let failed = false;
  try {
    invoke(arguments_);
  } catch (error) {
    const detail = error as {
      status?: number;
      stdout?: unknown;
      stderr?: unknown;
    };
    retainPrivateFailure({
      status: detail?.status,
      stdout: String(detail?.stdout ?? ""),
      stderr: String(detail?.stderr ?? ""),
    });
    failed = true;
  }
  if (failed) throw redactedCdkFailure();
}

/** Process adapter used by the guarded operator after source/account/cost validation. Provider output stays in owner-only files. */
export function deployCdkAssembly(
  input: CdkDeployment,
  privateDirectory: string,
): void {
  if (!path.isAbsolute(privateDirectory))
    throw new Error("Absolute private operator directory required");
  executeCdkDeployment(
    input,
    (arguments_) => {
      const output = execFileSync(
        process.execPath,
        ["node_modules/aws-cdk/bin/cdk", ...arguments_],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            AWS_REGION: input.pins.region,
            AWS_DEFAULT_REGION: input.pins.region,
            CDK_DEFAULT_ACCOUNT: input.pins.expectedAccountId,
            CDK_DEFAULT_REGION: input.pins.region,
          },
        },
      );
      writeFileSync(
        path.join(privateDirectory, "crm-cdk-deploy.private.log"),
        output,
        { mode: 0o600 },
      );
    },
    (failure) =>
      writeFileSync(
        path.join(privateDirectory, "crm-cdk-deploy-failure.private.json"),
        JSON.stringify({ at: new Date().toISOString(), ...failure }, null, 2),
        { mode: 0o600 },
      ),
  );
}
