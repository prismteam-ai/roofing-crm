/** Deployment references are private operator inputs; error messages never echo them. */
export function exactReviewOrigin(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.origin !== value ||
    !/^d[a-z0-9]+\.cloudfront\.net$/.test(u.hostname)
  )
    throw new Error("Exact CloudFront HTTPS origin required");
  return u.origin;
}
export function validateResourceBindings(input: {
  account: string;
  secretArn: string;
  tableArn?: string;
  executionRoleArn?: string;
  oracleOrigin?: string;
}) {
  if (
    !new RegExp(
      `^arn:aws:secretsmanager:us-east-1:${input.account}:secret:[A-Za-z0-9/_+=.@-]+$`,
    ).test(input.secretArn)
  )
    throw new Error(
      "Shared secret must belong to the exact approved account/region",
    );
  if (
    input.tableArn &&
    !new RegExp(
      `^arn:aws:dynamodb:us-east-1:${input.account}:table/[A-Za-z0-9_.-]+$`,
    ).test(input.tableArn)
  )
    throw new Error(
      "Shared table must belong to the exact approved account/region",
    );
  if (
    input.executionRoleArn &&
    !new RegExp(
      `^arn:aws:iam::${input.account}:role/prism-p3-[A-Za-z0-9_+=,.@/-]+$`,
    ).test(input.executionRoleArn)
  )
    throw new Error("Exact task-scoped execution role required");
  if (input.oracleOrigin) exactReviewOrigin(input.oracleOrigin);
}
export function enabledFlag(value: string | undefined) {
  if (value === undefined) return "false";
  if (value !== "true" && value !== "false")
    throw new Error("Enable flags must be explicitly true or false");
  return value;
}
