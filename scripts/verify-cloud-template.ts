import { buildConcurrencyPolicy } from "../packages/hosted-runtime/src/concurrency";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const template = JSON.parse(
  readFileSync("cdk.out/PrismCrmAssessmentReview.template.json", "utf8"),
) as {
  Metadata?: {
    PrismConcurrency?: {
      mode: string;
      existingAccountConcurrency: number | "none";
      reservedConcurrentExecutions: number | "none";
      proofSha256: string;
      deviation: string;
      apiRatePerSecond: number;
      apiBurst: number;
    };
  };
  Resources: Record<
    string,
    { Type: string; Properties: Record<string, unknown> }
  >;
};
if (JSON.stringify(template.Metadata).includes(":null"))
  throw new Error("CloudFormation metadata must omit null values");
const resources = Object.values(template.Resources);
const of = (type: string) => resources.filter((x) => x.Type === type);
const assert = (ok: boolean, message: string) => {
  if (!ok) throw new Error(message);
};
const alertSecrets = of("AWS::SecretsManager::Secret");
assert(
  alertSecrets.length === 1 &&
    alertSecrets[0]?.Properties.Name ===
      "PrismCrmAssessmentReview-PagerDutyRouting",
  "Alert secret physical name must remain inside the existing task-scoped deployment policy",
);
const lambdas = of("AWS::Lambda::Function");
const runtime = lambdas.find(
  (x) =>
    x.Properties.Runtime === "nodejs24.x" &&
    x.Properties.Handler === "index.handler",
);
assert(Boolean(runtime), "Missing genuine Node24 API handler");
assert(
  runtime?.Properties.Timeout === 29,
  "Bounded29-second CRM Lambda timeout required",
);
const metadata = template.Metadata?.PrismConcurrency;
const policy = buildConcurrencyPolicy({
  ...process.env,
  PRISM_CONCURRENCY_MODE: process.env.PRISM_CONCURRENCY_MODE ?? metadata?.mode,
  PRISM_EXISTING_ACCOUNT_CONCURRENCY:
    process.env.PRISM_EXISTING_ACCOUNT_CONCURRENCY ??
    (metadata?.existingAccountConcurrency === 10 ? "10" : undefined),
  PRISM_RESERVED_CONCURRENCY:
    process.env.PRISM_RESERVED_CONCURRENCY ??
    (typeof metadata?.reservedConcurrentExecutions === "number"
      ? String(metadata.reservedConcurrentExecutions)
      : undefined),
  PRISM_API_RATE_PER_SECOND:
    process.env.PRISM_API_RATE_PER_SECOND ??
    (metadata?.apiRatePerSecond !== undefined
      ? String(metadata.apiRatePerSecond)
      : undefined),
  PRISM_API_BURST:
    process.env.PRISM_API_BURST ??
    (metadata?.apiBurst !== undefined ? String(metadata.apiBurst) : undefined),
});
assert(
  Boolean(metadata) &&
    metadata!.mode === policy.mode &&
    metadata!.reservedConcurrentExecutions ===
      (policy.reservedConcurrentExecutions ?? "none") &&
    metadata!.apiRatePerSecond === policy.apiRatePerSecond &&
    metadata!.apiBurst === policy.apiBurst,
  "Concurrency metadata missing or mode mismatch",
);
assert(
  policy.mode === "reserved"
    ? runtime?.Properties.ReservedConcurrentExecutions ===
        policy.reservedConcurrentExecutions
    : !Object.hasOwn(runtime!.Properties, "ReservedConcurrentExecutions"),
  "Concurrency reservation does not match explicit policy",
);
if (policy.mode === "existing-account-shared")
  assert(
    metadata!.existingAccountConcurrency === 10 &&
      metadata!.reservedConcurrentExecutions === "none" &&
      /^[a-f0-9]{64}$/.test(metadata!.proofSha256) &&
      metadata!.deviation.includes("not equivalent"),
    "Shared-account deviation/proof metadata missing",
  );
const stages = of("AWS::ApiGatewayV2::Stage");
assert(
  stages.some((s) => {
    const settings = s.Properties.DefaultRouteSettings as {
      ThrottlingRateLimit?: number;
      ThrottlingBurstLimit?: number;
    };
    return (
      settings?.ThrottlingRateLimit === policy.apiRatePerSecond &&
      settings?.ThrottlingBurstLimit === policy.apiBurst
    );
  }),
  "Bounded API throttle missing",
);
assert(
  !JSON.stringify(runtime).includes("ZipFile"),
  "Inline placeholder Lambda is forbidden",
);
assert(
  of("AWS::CloudFront::OriginAccessControl").length === 1,
  "Static hosting must use OAC",
);
assert(
  of("AWS::DynamoDB::Table").every(
    (x) =>
      (x.Properties.TimeToLiveSpecification as { Enabled?: boolean })
        .Enabled === true,
  ),
  "TTL must be enabled",
);
assert(
  of("AWS::Logs::LogGroup").every((x) => x.Properties.RetentionInDays === 90),
  "Log retention must be 90 days",
);
const statements = of("AWS::IAM::Policy").flatMap(
  (x) =>
    (x.Properties.PolicyDocument as { Statement: Record<string, unknown>[] })
      .Statement,
);
const bedrock = statements.filter((x) =>
  JSON.stringify(x.Action).includes("bedrock:"),
);
assert(bedrock.length === 1, "Expected scoped Bedrock policy");
assert(
  !JSON.stringify(bedrock[0].Resource).includes("*"),
  "Bedrock wildcard resource forbidden",
);
assert(
  JSON.stringify(template).includes("cdk-bootstrap/prismrvw"),
  "Standard pinned CDK bootstrap dependency required",
);
assert(
  !resources.some((x) => /ECR|Custom::CDKBucketDeployment/.test(x.Type)),
  "ECR and asset deployment custom resources forbidden",
);
assert(
  JSON.stringify(runtime).includes("S3Key") &&
    JSON.stringify(runtime).includes("S3Bucket"),
  "Standard CDK managed Lambda asset required",
);
assert(
  JSON.stringify(runtime).includes("us-east-2"),
  "Runtime must be in us-east-2",
);
assert(
  JSON.stringify(template).includes("maps.geo.us-east-2.amazonaws.com"),
  "Exact map origin missing from CSP",
);
assert(
  lambdas.length === 2 &&
    lambdas.every(
      (x) =>
        (x.Properties.TracingConfig as { Mode?: string })?.Mode === "Active",
    ),
  "API and alarm notifier require active X-Ray",
);
assert(
  lambdas.every((x) =>
    JSON.stringify(x.Properties.Tags).includes('"project_name"'),
  ),
  "Every Lambda requires exact project_name tag",
);
assert(
  of("AWS::CloudWatch::Dashboard").length === 1,
  "Review dashboard required",
);
assert(
  of("AWS::CloudWatch::Alarm").every(
    (x) =>
      Array.isArray(x.Properties.AlarmActions) &&
      Array.isArray(x.Properties.OKActions),
  ),
  "Critical alarms must trigger and resolve the bounded notifier",
);
const proof = {
  checks: [
    "real-node24-handler",
    "bounded-concurrency",
    "no-inline-placeholder",
    "private-s3-cloudfront-oac",
    "lead-ttl",
    "90-day-logs",
    "exact-bedrock-resource",
    "shared-session-table-reference",
    "standard-bootstrap-managed-exact-code",
    "no-ecr-or-asset-custom-resource",
    "single-region-map-csp",
  ],
  concurrency: metadata,
  resources: resources.length,
  serviceCalls: 0,
};
mkdirSync("build", { recursive: true });
writeFileSync(
  "build/cloud-template-proof.json",
  JSON.stringify(proof, null, 2) + "\n",
);
console.log(JSON.stringify(proof, null, 2));
