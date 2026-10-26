// T009: CrmSync now synthesizes the crm-sync Step Functions state machine (Plan → FetchPart(Map)
// → BuildIndex → Validate → Promote, architecture-constitution.md §2.3) and its Lambda handlers
// — no longer "intentionally empty" (B-01 T005). T038 (Phase 4, machamp) implements
// infra/lib/crm-sync-stack.ts to make this pass.
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { CrmSyncStack } from "../lib/crm-sync-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const PLAN_ENTRY = new URL("../../apps/sync/handlers/plan.ts", import.meta.url).pathname;
const FETCH_PART_ENTRY = new URL("../../apps/sync/handlers/fetchPart.ts", import.meta.url).pathname;
const BUILD_INDEX_ENTRY = new URL("../../apps/sync/handlers/buildIndex.ts", import.meta.url)
  .pathname;
const VALIDATE_ENTRY = new URL("../../apps/sync/handlers/validate.ts", import.meta.url).pathname;
const PROMOTE_ENTRY = new URL("../../apps/sync/handlers/promote.ts", import.meta.url).pathname;
/** Task A's Run 2 full-county manifest — the value `DATA_MANIFEST_CID` carries in config. */
const RUN_2_MANIFEST_CID = "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute";
const RUN_1_MANIFEST_CID = "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu";

/** `skipBundling` (default on) synthesizes without esbuild/Docker (CDK's own `aws:cdk:bundling-stacks`
 *  context): these tests only read CloudFormation properties, and CI bundles under QEMU. */
const DEPLOY_NONCE = "mh2k9x1a";

function build(
  dataManifestCid: string = RUN_2_MANIFEST_CID,
  skipBundling = true,
  deployNonce: string = DEPLOY_NONCE,
) {
  const app = new App(skipBundling ? { context: { "aws:cdk:bundling-stacks": [] } } : {});
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
      dataManifestCid,
      taskACloudFrontBaseUrl: "https://taska.example.test",
      deployNonce,
    }),
  );
}

type CfnResource = { Properties: Record<string, unknown> };

function functionByName(template: Template, functionName: string): Record<string, unknown> {
  const fns = template.findResources("AWS::Lambda::Function", {
    Properties: { FunctionName: functionName },
  }) as Record<string, CfnResource>;
  const [fn] = Object.values(fns);
  if (fn === undefined) throw new Error(`no Lambda named ${functionName}`);
  return fn.Properties;
}

function startSyncResource(template: Template): Record<string, unknown> {
  const resources = template.findResources("Custom::AWS") as Record<string, CfnResource>;
  const entries = Object.values(resources);
  expect(entries).toHaveLength(1);
  return (entries[0] as CfnResource).Properties;
}

/** Every statement of every IAM::Policy attached to the role a given Lambda runs as. */
function statementsForFunctionRole(template: Template, functionName: string): unknown[] {
  const role = functionByName(template, functionName).Role as { "Fn::GetAtt": [string, string] };
  const roleId = role["Fn::GetAtt"][0];
  const policies = template.findResources("AWS::IAM::Policy") as Record<
    string,
    { Properties: { Roles?: { Ref?: string }[]; PolicyDocument: { Statement: unknown[] } } }
  >;
  return Object.values(policies)
    .filter((p) => (p.Properties.Roles ?? []).some((r) => r.Ref === roleId))
    .flatMap((p) => p.Properties.PolicyDocument.Statement);
}

describe("CrmSync (T038)", () => {
  // Built once (not per test): each build() call synths and Docker-bundles BuildIndex's and
  // Validate's native DuckDB binding, which is expensive enough that five fresh builds started
  // timing out individual tests once a second function needed the same treatment. The template
  // is immutable, so every assertion below reads the same one.
  let template: Template;

  beforeAll(() => {
    template = build();
  }, 240_000);

  it("alarms on a failed, timed-out or aborted execution and on a held run", () => {
    for (const alarmName of [
      "crm-sync-execution-failed",
      "crm-sync-execution-timed-out",
      "crm-sync-execution-aborted",
      "crm-sync-held-no-promotion",
    ]) {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", { AlarmName: alarmName });
    }
    template.hasResourceProperties("AWS::Logs::MetricFilter", {
      MetricTransformations: [
        Match.objectLike({ MetricName: "HeldNoPromotion", MetricNamespace: "CrmSync" }),
      ],
    });
  });

  it("routes a failed BuildIndex, Validate, Promote or Plan step to one named Fail state", () => {
    const [machine] = Object.values(template.findResources("AWS::StepFunctions::StateMachine"));
    const body = JSON.stringify(machine);
    expect(body).toContain("SyncFailed");
    expect(body).toContain("CrmSyncFailed");
    // Plan, BuildIndex, Validate and Promote each catch States.ALL into it.
    expect(body.match(/"Next\\":\\"SyncFailed\\"/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("alarms when BuildIndex uses more than 85 percent of its memory", () => {
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      AlarmName: "crm-sync-build-index-memory-high",
      Threshold: 2560,
    });
    template.hasResourceProperties("AWS::Logs::MetricFilter", {
      MetricTransformations: [
        Match.objectLike({ MetricName: "BuildIndexMaxMemoryUsedMb", MetricValue: "$maxmem" }),
      ],
    });
  });

  it("creates the crm-sync Step Functions state machine", () => {
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      StateMachineName: "crm-sync",
    });
  });

  it("creates the five pipeline Lambdas (Plan, FetchPart, BuildIndex, Validate, Promote) plus the deploy-time sync starter", () => {
    for (const name of [
      "crm-sync-plan",
      "crm-sync-fetch-part",
      "crm-sync-build-index",
      "crm-sync-validate",
      "crm-sync-promote",
      "crm-sync-start-on-deploy",
    ]) {
      expect(functionByName(template, name)).toBeDefined();
    }
    template.resourceCountIs("AWS::Lambda::Function", 6);
  });

  it("runs Powertools on every app Lambda; the one accepted exception is CDK's AwsCustomResource framework Lambda (crm-sync-start-on-deploy), which runs no app code", () => {
    const fns = template.findResources("AWS::Lambda::Function") as Record<string, CfnResource>;
    const withoutPowertools = Object.values(fns)
      .map((fn) => fn.Properties)
      .filter((props) => {
        const vars = (props.Environment as { Variables?: Record<string, unknown> } | undefined)
          ?.Variables;
        return (
          vars?.POWERTOOLS_SERVICE_NAME === undefined ||
          vars.POWERTOOLS_METRICS_NAMESPACE !== "RoofingCrm"
        );
      })
      .map((props) => props.FunctionName);
    expect(withoutPowertools).toEqual(["crm-sync-start-on-deploy"]);
  });

  it("denies Task A's resources on every role the stack creates (constitution P0-1)", () => {
    const policies = template.findResources("AWS::IAM::Policy");
    const denyPolicies = Object.values(policies).filter((policy) => {
      const statements = (policy as Record<string, unknown>).Properties as {
        PolicyDocument?: { Statement?: unknown[] };
      };
      return (statements.PolicyDocument?.Statement ?? []).some(
        (statement) =>
          (statement as Record<string, unknown>).Effect === "Deny" &&
          (statement as Record<string, unknown>).Sid === "DenyTaskAResources",
      );
    });
    expect(denyPolicies.length).toBeGreaterThan(0);
  });

  it("reuses the existing crm-leads table — declares no new DynamoDB table", () => {
    template.resourceCountIs("AWS::DynamoDB::Table", 0);
  });

  it("wires FetchPart's Distributed Map with concurrency 2-3 (ADR-02)", () => {
    const stateMachines = template.findResources("AWS::StepFunctions::StateMachine");
    const [first] = Object.values(stateMachines);
    const definition = JSON.stringify((first as Record<string, unknown>).Properties);
    // Found implementing T038: DefinitionString embeds the ASL JSON text as literal string
    // fragments inside an Fn::Join (needed because the Map/Task states reference dynamic Lambda
    // ARNs and the DLQ's queue URL) — JSON.stringify-ing that structure necessarily escapes the
    // ASL text's own embedded quote characters (`\"MaxConcurrency\":3`, not `"MaxConcurrency":3`).
    // Tolerating one optional backslash keeps this assertion meaningful without over-fitting to
    // a single CDK rendering strategy.
    expect(definition).toMatch(/\\?"MaxConcurrency\\?":[23]/);
  });

  // --- B-09: full-county sizing (Task A Run 2: 441,961 properties, ~556 MB of table parts) ---

  it("sizes BuildIndex for the full county: 3008 MB, 4 GB /tmp, 15 min, DuckDB capped below the function memory", () => {
    const fn = functionByName(template, "crm-sync-build-index");
    expect(fn.MemorySize).toBe(3008);
    expect(fn.EphemeralStorage).toEqual({ Size: 4096 });
    expect(fn.Timeout).toBe(900);
    const env = (fn.Environment as { Variables: Record<string, string> }).Variables;
    expect(env.DUCKDB_MEMORY_LIMIT).toBe("2600MB");
  });

  it("sizes Validate (reads BuildIndex's full-county Parquet back): 2048 MB, 1 GB /tmp, 10 min", () => {
    const fn = functionByName(template, "crm-sync-validate");
    expect(fn.MemorySize).toBe(2048);
    expect(fn.EphemeralStorage).toEqual({ Size: 1024 });
    expect(fn.Timeout).toBe(600);
    const env = (fn.Environment as { Variables: Record<string, string> }).Variables;
    expect(env.DUCKDB_MEMORY_LIMIT).toBe("1200MB");
  });

  it("keeps the light handlers (Plan, FetchPart, Promote) at 1024 MB / 5 min / default /tmp", () => {
    for (const name of ["crm-sync-plan", "crm-sync-fetch-part", "crm-sync-promote"]) {
      const fn = functionByName(template, name);
      expect(fn.MemorySize, name).toBe(1024);
      expect(fn.Timeout, name).toBe(300);
      expect(fn.EphemeralStorage, name).toBeUndefined();
    }
  });

  it("gives the state machine a timeout that covers every step's own worst case", () => {
    const [sm] = Object.values(
      template.findResources("AWS::StepFunctions::StateMachine") as Record<string, CfnResource>,
    );
    const definition = JSON.stringify(sm?.Properties);
    const match = /\\?"TimeoutSeconds\\?":(\d+)/.exec(definition);
    expect(match).not.toBeNull();
    const timeoutSeconds = Number(match?.[1]);
    expect(timeoutSeconds).toBe(3600);
    const stepTimeouts = [
      "crm-sync-plan",
      "crm-sync-fetch-part",
      "crm-sync-build-index",
      "crm-sync-validate",
      "crm-sync-promote",
    ].reduce((sum, name) => sum + Number(functionByName(template, name).Timeout), 0);
    expect(timeoutSeconds).toBeGreaterThan(stepTimeouts);
  });

  // --- B-09: auto-sync on deploy when DATA_MANIFEST_CID changes ---

  it("pins the config manifest CID in a CDK-managed SSM parameter that Plan reads as authoritative", () => {
    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: "/crm/sync/data-manifest-cid",
      Type: "String",
      Value: RUN_2_MANIFEST_CID,
    });
    const env = (
      functionByName(template, "crm-sync-plan").Environment as {
        Variables: Record<string, unknown>;
      }
    ).Variables;
    expect(env.MANIFEST_CID_SSM_PARAM_NAME).toEqual({ Ref: expect.any(String) });
    expect(env.CRM_LEADS_TABLE_NAME).toBe("crm-leads");
  });

  it("grants Plan only ssm:GetParameter on that one parameter and dynamodb:GetItem on crm-leads", () => {
    const statements = statementsForFunctionRole(template, "crm-sync-plan") as {
      Effect: string;
      Action: string | string[];
      Resource: unknown;
    }[];
    const ssmAllow = statements.filter(
      (s) => s.Effect === "Allow" && JSON.stringify(s.Action).includes("ssm:"),
    );
    expect(ssmAllow).toHaveLength(1);
    expect(ssmAllow[0]?.Action).toBe("ssm:GetParameter");
    // CDK renders the parameter ARN as `...:parameter` + a Ref to the parameter's own name.
    const [paramId] = Object.keys(template.findResources("AWS::SSM::Parameter"));
    expect(JSON.stringify(ssmAllow[0]?.Resource)).toContain(`{"Ref":"${paramId}"}`);
    expect(JSON.stringify(ssmAllow[0]?.Resource)).toContain(":parameter");
    const ddbAllow = statements.filter(
      (s) => s.Effect === "Allow" && JSON.stringify(s.Action).includes("dynamodb:"),
    );
    expect(ddbAllow).toHaveLength(1);
    expect(ddbAllow[0]?.Action).toBe("dynamodb:GetItem");
    expect(JSON.stringify(ddbAllow[0]?.Resource)).toContain("table/crm-leads");
  });

  it("starts one crm-sync execution named {manifest CID}-{deploy nonce} on create/update, never on delete", () => {
    const props = startSyncResource(template);
    const create = JSON.stringify(props.Create);
    const update = JSON.stringify(props.Update);
    expect(props.Delete).toBeUndefined();
    for (const call of [create, update]) {
      expect(call).toContain("startExecution");
      // Unique per deploy: Standard execution names can't be reused for 90 days, so a name of
      // just the CID would make a failed first sync of a CID, or an A→B→A rollback, never run
      // again on a redeploy.
      expect(call).toMatch(
        new RegExp(String.raw`\\?"name\\?":\\?"${RUN_2_MANIFEST_CID}-${DEPLOY_NONCE}\\?"`),
      );
      expect(call).toContain(`manifestCidHint`);
    }
  });

  it("re-runs the start call on every deploy (new nonce), and with a changed DATA_MANIFEST_CID", () => {
    const deployA = startSyncResource(build(RUN_2_MANIFEST_CID, true, "deploya"));
    const deployAAgain = startSyncResource(build(RUN_2_MANIFEST_CID, true, "deploya"));
    const deployB = startSyncResource(build(RUN_2_MANIFEST_CID, true, "deployb"));
    const switched = startSyncResource(build(RUN_1_MANIFEST_CID, true, "deployc"));
    // Deterministic for a given nonce (a re-synth of the same deploy changes nothing)...
    expect(JSON.stringify(deployAAgain)).toBe(JSON.stringify(deployA));
    // ...but a new deploy changes the custom resource's properties, so CloudFormation re-invokes
    // it even when DATA_MANIFEST_CID is unchanged (Plan's AlreadyPromoted makes that a no-op).
    expect(JSON.stringify(deployB)).not.toBe(JSON.stringify(deployA));
    expect(JSON.stringify(deployB)).toContain(`${RUN_2_MANIFEST_CID}-deployb`);
    expect(JSON.stringify(switched)).toContain(`${RUN_1_MANIFEST_CID}-deployc`);
  }, 60_000);

  it("refuses a deploy nonce that would make an invalid or over-long execution name", () => {
    expect(() => build(RUN_2_MANIFEST_CID, true, "has space")).toThrow(/execution name/);
    expect(() => build(RUN_2_MANIFEST_CID, true, "x".repeat(30))).toThrow(/execution name/);
  });

  it("runs the start call only after the SSM parameter and the state machine are in place", () => {
    const resources = template.findResources("Custom::AWS") as Record<
      string,
      { DependsOn?: string[] }
    >;
    const [resource] = Object.values(resources);
    const dependsOn = resource?.DependsOn ?? [];
    const paramIds = Object.keys(template.findResources("AWS::SSM::Parameter"));
    const smIds = Object.keys(template.findResources("AWS::StepFunctions::StateMachine"));
    expect(dependsOn).toEqual(expect.arrayContaining([...paramIds, ...smIds]));
  });

  it("lets the deploy-time starter call only states:StartExecution on crm-sync", () => {
    const statements = statementsForFunctionRole(template, "crm-sync-start-on-deploy") as {
      Effect: string;
      Action: string | string[];
      Resource: unknown;
      Sid?: string;
    }[];
    const allows = statements.filter((s) => s.Effect === "Allow");
    expect(allows).toHaveLength(1);
    expect(allows[0]?.Action).toBe("states:StartExecution");
    expect(allows[0]?.Resource).toEqual({ Ref: expect.stringMatching(/^CrmSyncStateMachine/) });
    expect(statements.some((s) => s.Effect === "Deny" && s.Sid === "DenyTaskAResources")).toBe(
      true,
    );
  });

  it("routes an already-promoted manifest straight to a Succeed state (no fetch, no rebuild)", () => {
    const [sm] = Object.values(
      template.findResources("AWS::StepFunctions::StateMachine") as Record<string, CfnResource>,
    );
    const definition = JSON.stringify(sm?.Properties);
    expect(definition).toContain("AlreadyPromotedNoOp");
    expect(definition).toMatch(/AlreadyPromoted/);
  });
});
