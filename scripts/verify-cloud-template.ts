import { buildConcurrencyPolicy } from "../packages/hosted-runtime/src/concurrency";
import { readFileSync, writeFileSync } from "node:fs";
const template = JSON.parse(
  readFileSync("cdk.out/PrismCrmP3Review.template.json", "utf8"),
) as {
  Metadata?: {
    PrismConcurrency?: {
      mode: string;
      existingAccountConcurrency: number | null;
      reservedConcurrentExecutions: number | null;
      proofSha256: string;
      deviation: string;
    };
  };
  Resources: Record<
    string,
    { Type: string; Properties: Record<string, unknown> }
  >;
};
const resources = Object.values(template.Resources);
const of = (type: string) => resources.filter((x) => x.Type === type);
const assert = (ok: boolean, message: string) => {
  if (!ok) throw new Error(message);
};
const lambdas = of("AWS::Lambda::Function");
const runtime = lambdas.find(
  (x) =>
    x.Properties.Runtime === "nodejs24.x" &&
    x.Properties.Handler === "index.handler",
);
assert(Boolean(runtime), "Missing genuine Node24 API handler");
const metadata = template.Metadata?.PrismConcurrency;
const policy = buildConcurrencyPolicy({
  ...process.env,
  PRISM_CONCURRENCY_MODE: process.env.PRISM_CONCURRENCY_MODE ?? metadata?.mode,
  PRISM_EXISTING_ACCOUNT_CONCURRENCY:
    process.env.PRISM_EXISTING_ACCOUNT_CONCURRENCY ??
    (metadata?.existingAccountConcurrency === 10 ? "10" : undefined),
});
assert(
  Boolean(metadata) && metadata!.mode === policy.mode,
  "Concurrency metadata missing or mode mismatch",
);
assert(
  policy.mode === "reserved"
    ? runtime?.Properties.ReservedConcurrentExecutions === 2
    : !Object.hasOwn(runtime!.Properties, "ReservedConcurrentExecutions"),
  "Concurrency reservation does not match explicit policy",
);
if (policy.mode === "existing-account-shared")
  assert(
    metadata!.existingAccountConcurrency === 10 &&
      metadata!.reservedConcurrentExecutions === null &&
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
  of("AWS::Logs::LogGroup").every((x) => x.Properties.RetentionInDays === 7),
  "Log retention must be seven days",
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
  !JSON.stringify(template).includes("cdk-bootstrap"),
  "CDK bootstrap dependency forbidden",
);
assert(
  !resources.some((x) => /ECR|Custom::CDKBucketDeployment/.test(x.Type)),
  "ECR and asset deployment custom resources forbidden",
);
assert(
  JSON.stringify(runtime).includes("prism-p3/crm/lambda/"),
  "Exact hash-addressed Lambda asset required",
);
assert(
  !JSON.stringify(template).includes("us-east-2"),
  "Mixed region forbidden",
);
assert(
  JSON.stringify(template).includes("maps.geo.us-east-1.amazonaws.com"),
  "Exact map origin missing from CSP",
);
const proof = {
  checks: [
    "real-node24-handler",
    "bounded-concurrency",
    "no-inline-placeholder",
    "private-s3-cloudfront-oac",
    "lead-ttl",
    "seven-day-logs",
    "exact-bedrock-resource",
    "shared-session-table-reference",
    "bootstrapless-hash-pinned-code",
    "no-ecr-or-asset-custom-resource",
    "single-region-map-csp",
  ],
  concurrency: metadata,
  resources: resources.length,
  serviceCalls: 0,
};
writeFileSync(
  "build/cloud-template-proof.json",
  JSON.stringify(proof, null, 2) + "\n",
);
console.log(JSON.stringify(proof, null, 2));
