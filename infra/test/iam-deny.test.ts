// T037 (fixes G5 C-04): CrmSync's synthesized IAM policy document carries an explicit `Deny`
// statement for Task A's resource ARNs (architecture-constitution.md §7, constitution P0-1) on
// every role the stack creates — not just "at least one role," which the pre-existing assertion
// in crm-sync-stack.test.ts already covers. T038 fills infra/lib/crm-sync-stack.ts to make this
// pass — intentionally failing now (the stack is still B-01's empty stub).
//
// T054 (convergence fix): §7 names exactly two protected-resource categories — "Task A's buckets"
// (no `s3:GetObject` on them) and the "`/countylens/*` SSM parameters" namespace (no reading
// them). It is not enough that *some* Deny statement exists; this suite now asserts the Deny's
// own `Resource` list actually names both categories' ARN patterns, on every role, so a Deny that
// (say) only covered SSM and silently dropped the S3 bucket pattern would fail here.
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CrmSyncStack } from "../lib/crm-sync-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const PLAN_ENTRY = new URL("../../apps/sync/handlers/plan.ts", import.meta.url).pathname;
const FETCH_PART_ENTRY = new URL("../../apps/sync/handlers/fetchPart.ts", import.meta.url).pathname;
const BUILD_INDEX_ENTRY = new URL("../../apps/sync/handlers/buildIndex.ts", import.meta.url)
  .pathname;
const VALIDATE_ENTRY = new URL("../../apps/sync/handlers/validate.ts", import.meta.url).pathname;
const PROMOTE_ENTRY = new URL("../../apps/sync/handlers/promote.ts", import.meta.url).pathname;

function build() {
  // Skip Docker bundling: IAM statements don't depend on bundled code (CI bundles under QEMU, minutes per build).
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  return Template.fromStack(
    new CrmSyncStack(app, "CrmSync", {
      env: ENV,
      planHandlerEntry: PLAN_ENTRY,
      fetchPartHandlerEntry: FETCH_PART_ENTRY,
      buildIndexHandlerEntry: BUILD_INDEX_ENTRY,
      validateHandlerEntry: VALIDATE_ENTRY,
      promoteHandlerEntry: PROMOTE_ENTRY,
      indexBucketName: "crm-index",
      leadsTableName: "crm-leads",
      dataManifestCid: "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute",
      taskACloudFrontBaseUrl: "https://taska.example.test",
      deployNonce: "iamdenytest",
    }),
  );
}

interface IamPolicyResource {
  readonly Properties: {
    readonly Roles?: unknown[];
    readonly PolicyDocument?: { readonly Statement?: unknown[] };
  };
}

// CDK synthesizes an ARN built from pseudo-parameters (e.g. `arn:${stack.partition}:s3:::...`)
// as an `Fn::Join` of literal string segments and `Ref` intrinsics, not a plain string. This
// resolves it back into a matchable string for the regex checks below — any `Ref` (partition,
// region, account) is replaced with a short placeholder, which is fine since the §7 patterns
// below only need to match the literal service/resource-path segments, not the exact account ID.
function resolveArnLikeValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") {
    const fnJoin = (value as { "Fn::Join"?: [string, unknown[]] })["Fn::Join"];
    if (fnJoin !== undefined) {
      const [delimiter, parts] = fnJoin;
      return parts.map((part) => resolveArnLikeValue(part)).join(delimiter);
    }
    const ref = (value as { Ref?: string }).Ref;
    // The placeholder must not itself contain a literal `:` — pseudo-parameter names like
    // `AWS::Partition` do — or it breaks the `[^:]+` ARN-segment matching below.
    if (ref !== undefined) return `PSEUDO_${ref.replace(/:/g, "_")}`;
  }
  return "";
}

describe("CrmSync IAM Deny coverage (T037)", () => {
  it("every IAM::Role the stack creates has a Deny(DenyTaskAResources) policy attached", () => {
    const template = build();
    const roles = template.findResources("AWS::IAM::Role");
    const roleLogicalIds = Object.keys(roles);
    // Every NodejsFunction CDK creates its own default execution role — there should be exactly
    // five (Plan, FetchPart, BuildIndex, Validate, Promote), and none may be missing the Deny.
    expect(roleLogicalIds.length).toBeGreaterThanOrEqual(5);

    const policies = Object.values(
      template.findResources("AWS::IAM::Policy") as Record<string, IamPolicyResource>,
    );

    const roleLogicalIdHasDeny = new Map<string, boolean>(roleLogicalIds.map((id) => [id, false]));

    for (const policy of policies) {
      const statements = policy.Properties.PolicyDocument?.Statement ?? [];
      const hasDeny = statements.some(
        (statement) =>
          (statement as Record<string, unknown>).Effect === "Deny" &&
          (statement as Record<string, unknown>).Sid === "DenyTaskAResources",
      );
      if (!hasDeny) continue;
      for (const roleRef of policy.Properties.Roles ?? []) {
        // Each Roles entry is a { Ref: "<LogicalId>" } intrinsic.
        const ref = (roleRef as { Ref?: string } | undefined)?.Ref;
        if (ref !== undefined && roleLogicalIdHasDeny.has(ref)) {
          roleLogicalIdHasDeny.set(ref, true);
        }
      }
    }

    for (const [roleId, hasDeny] of roleLogicalIdHasDeny) {
      expect(hasDeny, `role ${roleId} is missing the DenyTaskAResources statement`).toBe(true);
    }
  }, 240_000);

  it(
    "the DenyTaskAResources statement's Resource list names both §7 protected-resource " +
      "categories (Task A's S3 buckets and the /countylens/* SSM parameter namespace) on " +
      "every role, not just a Deny statement with unrelated or incomplete resources",
    () => {
      const template = build();
      const roles = template.findResources("AWS::IAM::Role");
      const roleLogicalIds = Object.keys(roles);
      expect(roleLogicalIds.length).toBeGreaterThanOrEqual(5);

      const policies = Object.values(
        template.findResources("AWS::IAM::Policy") as Record<string, IamPolicyResource>,
      );

      // architecture-constitution.md §7's two named protected-resource categories, as ARN
      // patterns: Task A's S3 bucket(s) (the published CID-copy bucket) and the `/countylens/*`
      // SSM parameter namespace. A Deny statement that names neither — or only one of the two —
      // must fail this test even though *some* Deny statement with Sid "DenyTaskAResources"
      // exists on the role.
      const s3BucketArnPattern = /^arn:[^:]+:s3:::countylensdata[^/]*$/;
      const s3BucketObjectsArnPattern = /^arn:[^:]+:s3:::countylensdata[^/]*\/\*$/;
      const ssmCountylensArnPattern = /^arn:[^:]+:ssm:[^:]*:[^:]*:parameter\/countylens\/\*$/;

      const roleLogicalIdHasBothCategories = new Map<string, { s3: boolean; ssm: boolean }>(
        roleLogicalIds.map((id) => [id, { s3: false, ssm: false }]),
      );

      for (const policy of policies) {
        const statements = policy.Properties.PolicyDocument?.Statement ?? [];
        const denyStatement = statements.find(
          (statement) =>
            (statement as Record<string, unknown>).Effect === "Deny" &&
            (statement as Record<string, unknown>).Sid === "DenyTaskAResources",
        ) as { Resource?: unknown } | undefined;
        if (denyStatement === undefined) continue;

        const resources = Array.isArray(denyStatement.Resource)
          ? (denyStatement.Resource as unknown[])
          : denyStatement.Resource !== undefined
            ? [denyStatement.Resource]
            : [];
        // CDK synthesizes each ARN as an `Fn::Join` of literal strings and pseudo-parameter
        // `Ref`s (e.g. `AWS::Partition`), not a plain string — flatten those back into a string
        // so the §7 ARN-pattern regexes below can match them.
        const resourceStrings = resources.map((resource) => resolveArnLikeValue(resource));

        const hasS3 = resourceStrings.some(
          (resource) =>
            s3BucketArnPattern.test(resource) || s3BucketObjectsArnPattern.test(resource),
        );
        const hasSsm = resourceStrings.some((resource) => ssmCountylensArnPattern.test(resource));

        for (const roleRef of policy.Properties.Roles ?? []) {
          const ref = (roleRef as { Ref?: string } | undefined)?.Ref;
          if (ref === undefined || !roleLogicalIdHasBothCategories.has(ref)) continue;
          const current = roleLogicalIdHasBothCategories.get(ref);
          if (current === undefined) continue;
          roleLogicalIdHasBothCategories.set(ref, {
            s3: current.s3 || hasS3,
            ssm: current.ssm || hasSsm,
          });
        }
      }

      for (const [roleId, categories] of roleLogicalIdHasBothCategories) {
        expect(
          categories.s3,
          `role ${roleId}'s DenyTaskAResources statement is missing the §7 S3-bucket ARN pattern`,
        ).toBe(true);
        expect(
          categories.ssm,
          `role ${roleId}'s DenyTaskAResources statement is missing the §7 /countylens/* SSM ARN pattern`,
        ).toBe(true);
      }
    },
    240_000,
  );
});
