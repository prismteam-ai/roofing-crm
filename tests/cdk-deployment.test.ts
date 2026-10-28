import { expect, it, vi } from "vitest";
import {
  bootstrapBindings,
  cdkBootstrapArguments,
  cdkDeployArguments,
  executeCdkDeployment,
} from "../packages/hosted-runtime/src/cdk-deploy";
import type { ReleasePins } from "../packages/hosted-runtime/src/release";
const account = "234567890123";
const pins: ReleasePins = {
  expectedAccountId: account,
  region: "us-east-2",
  stage: "review",
  stackName: "PrismCrmAssessmentReview",
  assetBucket: bootstrapBindings(account).bucket,
  assetPrefix: "assessment/crm/",
  head: "a".repeat(40),
  tree: "b".repeat(40),
  archiveSha256: "c".repeat(64),
  publicManifestSha256: "d".repeat(64),
};
const parameters = {
  LambdaArchiveSha256: pins.archiveSha256,
  ReleaseBuildId: "f".repeat(64),
  OracleApiOrigin: "https://dsynthetic.cloudfront.net",
  ReviewAccessSecretArn: "synthetic-secret-reference",
  SharedSessionQuotaTableArn: "synthetic-table-reference",
  EnableModel: "false",
  EnableMap: "false",
  BedrockModelId: "us.amazon.nova-micro-v1:0",
  ModelPromptRevision: "base",
};
const input = {
  pins,
  parameters,
  outputsFile: "/tmp/synthetic-private-outputs.json",
};

it("executes one exact standard-CDK command, with argument boundaries and deterministic parameter inventory", () => {
  const invoke = vi.fn(),
    retain = vi.fn();
  executeCdkDeployment(input, invoke, retain);
  expect(invoke).toHaveBeenCalledTimes(1);
  const args = invoke.mock.calls[0][0] as string[];
  expect(args.slice(0, 4)).toEqual([
    "--app",
    "cdk.out",
    "deploy",
    "PrismCrmAssessmentReview",
  ]);
  expect(args).toContain("--exclusively");
  expect(args.filter((v) => v === "--parameters")).toHaveLength(9);
  expect(args).toContain(
    `PrismCrmAssessmentReview:LambdaArchiveSha256=${pins.archiveSha256}`,
  );
  expect(retain).not.toHaveBeenCalled();
  expect(
    cdkDeployArguments({
      ...input,
      parameters: Object.fromEntries(Object.entries(parameters).reverse()),
    }),
  ).toEqual(args);
});
it("rejects wrong region, account, stack, bootstrap binding, output and parameter injection before process invocation", () => {
  const invoke = vi.fn(),
    retain = vi.fn();
  for (const bad of [
    { ...input, pins: { ...pins, region: "us-east-1" } },
    { ...input, pins: { ...pins, expectedAccountId: "123456789012" } },
    { ...input, pins: { ...pins, stackName: "OtherStack" } },
    { ...input, pins: { ...pins, assetBucket: "unreviewed-bucket" } },
    { ...input, outputsFile: "public/outputs.json" },
    { ...input, parameters: { ...parameters, unapproved: "yes" } },
    { ...input, parameters: { ...parameters, EnableModel: "false\n--all" } },
  ])
    expect(() => executeCdkDeployment(bad, invoke, retain)).toThrow();
  expect(invoke).not.toHaveBeenCalled();
  expect(retain).not.toHaveBeenCalled();
});
it("retains provider output only through the private sink and raises a fixed public diagnostic", () => {
  const privateMarker = "synthetic-private-provider-identifier";
  const retain = vi.fn();
  const invoke = vi.fn(() => {
    throw Object.assign(new Error(privateMarker), {
      stdout: privateMarker,
      stderr: privateMarker,
      status: 1,
    });
  });
  let caught: unknown;
  try {
    executeCdkDeployment(input, invoke, retain);
  } catch (error) {
    caught = error;
  }
  expect(String(caught)).not.toContain(privateMarker);
  expect((caught as Error).cause).toBeUndefined();
  expect(retain).toHaveBeenCalledExactlyOnceWith({
    stdout: privateMarker,
    stderr: privateMarker,
    status: 1,
  });
});
it("bootstrap requires the exact scoped policy rather than the broad CDK default", () => {
  expect(
    cdkBootstrapArguments(
      account,
      `arn:aws:iam::${account}:policy/prism-assessment-review-cloudformation`,
    ),
  ).toEqual([
    "bootstrap",
    `aws://${account}/us-east-2`,
    "--qualifier",
    "prismrvw",
    "--cloudformation-execution-policies",
    `arn:aws:iam::${account}:policy/prism-assessment-review-cloudformation`,
    "--termination-protection",
  ]);
  for (const policy of [
    "arn:aws:iam::aws:policy/AdministratorAccess",
    `arn:aws:iam::${account}:policy/Other`,
    "",
  ])
    expect(() => cdkBootstrapArguments(account, policy)).toThrow("task-scoped");
});
