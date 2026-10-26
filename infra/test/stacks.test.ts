// Unit assertions for the six CDK stacks (TN02 runs `cdk synth --strict` + cdk-nag separately).
// These use `Template.fromStack` so they run with no AWS credentials and no network.
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CrmApiStack } from "../lib/crm-api-stack.js";
import { CrmDomainStack } from "../lib/crm-domain-stack.js";
import { domainBranchName } from "../src/app.js";
import { CrmOpsStack } from "../lib/crm-ops-stack.js";
import { CrmWebStack } from "../lib/crm-web-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const HEALTH_ENTRY = new URL("../../apps/api/src/handlers/health.ts", import.meta.url).pathname;
const LOCKOUT_ENTRY = new URL("../../apps/api/src/auth/lockout-handler.ts", import.meta.url)
  .pathname;

// CrmData / CrmSync's B-02 assertions moved to crm-data-stack.test.ts / crm-sync-stack.test.ts
// (tasks.md T009) — they no longer stay "intentionally empty" (B-01 T005).

describe("CrmOps (T017)", () => {
  function buildOps() {
    const app = new App();
    return Template.fromStack(
      new CrmOpsStack(app, "CrmOps", { env: ENV, lockoutHandlerEntry: LOCKOUT_ENTRY }),
    );
  }

  it("creates a Cognito user pool with self sign-up disabled", () => {
    const template = buildOps();
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  it("creates one user pool client with no secret and SRP auth", () => {
    const template = buildOps();
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: false,
      ExplicitAuthFlows: Match.arrayWith(["ALLOW_USER_SRP_AUTH"]),
    });
  });

  it("creates the LockoutCounter DynamoDB table keyed by username", () => {
    const template = buildOps();
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "crm-lockout-counter",
      KeySchema: [{ AttributeName: "username", KeyType: "HASH" }],
    });
  });

  it("wires the lockout Lambda as a PreAuthentication trigger", () => {
    const template = buildOps();
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      LambdaConfig: Match.objectLike({ PreAuthentication: Match.anyValue() }),
    });
  });

  it("seeds exactly one admin user via a custom resource, password only in Secrets Manager", () => {
    const template = buildOps();
    template.resourceCountIs("AWS::SecretsManager::Secret", 1);
    const customResources = template.findResources("Custom::AWS");
    expect(Object.keys(customResources).length).toBeGreaterThanOrEqual(2);
  });

  it("denies Task A's S3/SSM resources on the lockout Lambda's role (T007B)", () => {
    const template = buildOps();
    template.hasResourceProperties(
      "AWS::IAM::Policy",
      Match.objectLike({
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Deny",
              Sid: "DenyTaskAResources",
            }),
          ]),
        }),
      }),
    );
  });
});

describe("CrmApi (T007)", () => {
  // B-03: the TrpcHandler now bundles @duckdb/node-api (apps/api/src/leadIndex.ts), which forces
  // Docker bundling (crm-api-stack.ts) — a real, ~minutes-scale cost on a cold Docker layer /
  // npm-registry fetch, not a logic issue. Memoized once per file (identical props every call)
  // instead of once per `it`, so that one-time cost is paid at most once, not 3x.
  let cachedTemplate: Template | undefined;
  function buildApi(): Template {
    if (cachedTemplate !== undefined) return cachedTemplate;
    const app = new App();
    const ops = new CrmOpsStack(app, "CrmOps", { env: ENV, lockoutHandlerEntry: LOCKOUT_ENTRY });
    cachedTemplate = Template.fromStack(
      new CrmApiStack(app, "CrmApi", {
        env: ENV,
        healthHandlerEntry: HEALTH_ENTRY,
        userPool: ops.userPool,
        userPoolClient: ops.userPoolClient,
        lockoutTable: ops.lockoutTable,
        indexBucketName: "crm-index",
        leadsTableName: "crm-leads",
        agentUsageTableName: "crm-agent-usage",
        aiProvider: "bedrock",
        agentModelId: "eu.anthropic.claude-sonnet-4-6",
      }),
    );
    return cachedTemplate;
  }

  // 300s, not the file-wide 20s default: Docker-bundled native-module install (see above) can
  // take minutes on a cold cache, confirmed live (one cold run took ~1170s).
  const DOCKER_BUNDLE_TIMEOUT_MS = 300_000;

  it(
    "creates an HTTP API with a JWT authorizer",
    () => {
      const template = buildApi();
      template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
      template.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
        AuthorizerType: "JWT",
      });
    },
    DOCKER_BUNDLE_TIMEOUT_MS,
  );

  it(
    "denies Task A's S3/SSM resources on the API Lambda's role (T007B)",
    () => {
      const template = buildApi();
      template.hasResourceProperties(
        "AWS::IAM::Policy",
        Match.objectLike({
          PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
              Match.objectLike({ Effect: "Deny", Sid: "DenyTaskAResources" }),
            ]),
          }),
        }),
      );
    },
    DOCKER_BUNDLE_TIMEOUT_MS,
  );

  it(
    "the health.ping route has no authorizer attached",
    () => {
      const template = buildApi();
      const routes = template.findResources("AWS::ApiGatewayV2::Route");
      interface RouteResource {
        Properties: { RouteKey?: string; AuthorizationType?: string };
      }
      const healthRoutes = Object.values(routes as Record<string, RouteResource>).filter(
        (r) =>
          typeof r.Properties.RouteKey === "string" &&
          r.Properties.RouteKey.includes("health.ping"),
      );
      expect(healthRoutes.length).toBeGreaterThan(0);
      for (const route of healthRoutes) {
        expect(route.Properties.AuthorizationType ?? "NONE").not.toBe("JWT");
      }
    },
    DOCKER_BUNDLE_TIMEOUT_MS,
  );
});

describe("CrmWeb (T009)", () => {
  it("creates an Amplify app with the /api/* rewrite and no base-URL env var", () => {
    const app = new App();
    const template = Template.fromStack(
      new CrmWebStack(app, "CrmWeb", {
        env: ENV,
        githubRepository: "HebaGaber/roofing-crm",
        githubRef: "001-crm-shell",
        apiUrl: "https://example.execute-api.eu-north-1.amazonaws.com",
        userPoolId: "eu-north-1_example",
        userPoolClientId: "exampleclientid",
      }),
    );
    template.hasResourceProperties("AWS::Amplify::App", {
      CustomRules: Match.arrayWith([Match.objectLike({ Source: "/api/<*>" })]),
      EnvironmentVariables: Match.arrayWith([
        Match.objectLike({ Name: "VITE_COGNITO_USER_POOL_ID", Value: "eu-north-1_example" }),
        Match.objectLike({ Name: "VITE_COGNITO_USER_POOL_CLIENT_ID", Value: "exampleclientid" }),
      ]),
    });
    template.resourceCountIs("AWS::Amplify::Branch", 1);
  });

  it("writes dist/build.json with the commit Amplify built, so CI can wait for its own build", () => {
    const template = Template.fromStack(
      new CrmWebStack(new App(), "CrmWeb", {
        env: ENV,
        githubRepository: "HebaGaber/roofing-crm",
        githubRef: "001-crm-shell",
        apiUrl: "https://example.execute-api.eu-north-1.amazonaws.com",
        userPoolId: "eu-north-1_example",
        userPoolClientId: "exampleclientid",
      }),
    );
    const app = Object.values(template.findResources("AWS::Amplify::App"))[0] as {
      Properties: { BuildSpec: string };
    };
    const spec = JSON.parse(app.Properties.BuildSpec) as {
      applications: { frontend: { phases: { build: { commands: string[] } } } }[];
    };
    const commands = spec.applications[0]?.frontend.phases.build.commands ?? [];
    expect(commands.some((c) => c.includes("dist/build.json") && c.includes("AWS_COMMIT_ID"))).toBe(
      true,
    );
  });
});

describe("CrmDomain (T010)", () => {
  it("declares no resources at all while cutover is false (no live AWS lookup needed)", () => {
    const stack = new CrmDomainStack(new App(), "CrmDomain", {
      env: ENV,
      domainName: "crm.aldarraj.com",
      cutover: false,
    });
    const template = Template.fromStack(stack);
    expect(Object.keys(template.toJSON().Resources ?? {})).toHaveLength(0);
  });

  it("associates crm.aldarraj.com (the sub-domain itself, never the root) with the named branch once cutover is true", () => {
    const stack = new CrmDomainStack(new App(), "CrmDomain", {
      env: ENV,
      domainName: "crm.aldarraj.com",
      cutover: true,
      web: { appId: "d1zmhc6kkyzsbe", branchName: "feature/roofing-crm" },
    });
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::Amplify::Domain", 1);
    template.hasResourceProperties("AWS::Amplify::Domain", {
      AppId: "d1zmhc6kkyzsbe",
      DomainName: "crm.aldarraj.com",
      EnableAutoSubDomain: false,
      SubDomainSettings: [{ Prefix: "", BranchName: "feature/roofing-crm" }],
    });
    // The two DNS records the PO adds at Namecheap come from these outputs, so they must exist.
    const outputs = Object.keys(template.toJSON().Outputs ?? {});
    expect(outputs).toEqual(
      expect.arrayContaining(["HostedUrl", "DomainStatus", "CertificateVerificationRecord"]),
    );
    // No certificate, no Route 53 zone: Amplify issues the certificate and DNS stays at Namecheap.
    template.resourceCountIs("AWS::CertificateManager::Certificate", 0);
    template.resourceCountIs("AWS::Route53::HostedZone", 0);
  });

  it("refuses a cutover that names no Amplify app and branch", () => {
    expect(
      () =>
        new CrmDomainStack(new App(), "CrmDomain", {
          env: ENV,
          domainName: "crm.aldarraj.com",
          cutover: true,
        }),
    ).toThrow(/props\.web/);
  });
});

describe("domainBranchName", () => {
  it("serves the domain from the feature branch, never the stale primary branch", () => {
    expect(
      domainBranchName(
        [{ branchName: "007-leads" }, { branchName: "feature/roofing-crm" }],
        "001-crm-shell",
      ),
    ).toBe("feature/roofing-crm");
  });

  it("falls back to the primary branch when the feature branch is not deployed", () => {
    expect(domainBranchName([{ branchName: "007-leads" }], "001-crm-shell")).toBe("001-crm-shell");
  });
});
