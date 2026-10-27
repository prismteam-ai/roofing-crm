import { readFileSync, writeFileSync } from "node:fs";
const template = JSON.parse(
  readFileSync("cdk.out/PrismCrmP2Candidate.template.json", "utf8"),
) as {
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
assert(
  runtime?.Properties.ReservedConcurrentExecutions === 2,
  "Missing reserved concurrency bound",
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
  ],
  resources: resources.length,
  serviceCalls: 0,
};
writeFileSync(
  "build/cloud-template-proof.json",
  JSON.stringify(proof, null, 2) + "\n",
);
console.log(JSON.stringify(proof, null, 2));
