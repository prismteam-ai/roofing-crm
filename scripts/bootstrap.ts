import { assertOperatorIdentity } from "../packages/hosted-runtime/src/operator-identity";
import { execFileSync } from "node:child_process";
import {
  cdkBootstrapArguments,
  bootstrapBindings,
} from "../packages/hosted-runtime/src/cdk-deploy";
const execute = process.argv.includes("--execute");
if (
  process.argv.slice(2).some((v) => !["--execute", "--dry-run"].includes(v)) ||
  (execute && process.argv.includes("--dry-run"))
)
  throw new Error("Use bootstrap [--execute|--dry-run]");
if (!execute) {
  console.log(
    JSON.stringify({
      mode: "plan",
      region: "us-east-2",
      qualifier: "prismrvw",
      toolkitStack: "PrismAssessmentReviewToolkit",
      requiresExactOperatorRole: true,
      standardCdkBootstrap: true,
      requiresExactScopedExecutionPolicies: [
        "prism-assessment-review-execution-storage",
        "prism-assessment-review-execution-runtime",
      ],
      accountWrites: 0,
    }),
  );
} else {
  if (process.env.PRISM_CLOUD_EXECUTION_APPROVED !== "yes")
    throw new Error("Explicit candidate-account cloud execution gate required");
  const account = process.env.PRISM_EXPECTED_ACCOUNT_ID ?? "";
  bootstrapBindings(account);
  const args = cdkBootstrapArguments(
    account,
    process.env.PRISM_BOOTSTRAP_EXECUTION_POLICY_ARNS ?? "",
  );
  const who = JSON.parse(
    execFileSync(
      "aws",
      [
        "--region",
        "us-east-2",
        "sts",
        "get-caller-identity",
        "--output",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  ) as { Account?: string; Arn?: string };
  assertOperatorIdentity(
    account,
    process.env.PRISM_EXPECTED_OPERATOR_ROLE_ARN ?? "",
    who,
  );
  execFileSync(process.execPath, ["node_modules/aws-cdk/bin/cdk", ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      AWS_REGION: "us-east-2",
      AWS_DEFAULT_REGION: "us-east-2",
    },
  });
}
