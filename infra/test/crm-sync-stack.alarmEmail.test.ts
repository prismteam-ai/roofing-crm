// T050 (B-09, Phase 6/US3, AC-6): confirm `CrmSyncStack` is actually instantiated with the
// configured `alarmEmail` (cdk.json context `crm:alarmEmail`, read by infra/src/config.ts — see
// test/config.test.ts) wherever it's composed (infra/src/app.ts's `createCrmStacks`) — per agent-design.md porygon §2/contracts/observability.md, the DLQ +
// alarm + SNS-topic construct already exists (`addFetchPartDlqAndAlarm`,
// `CrmSyncStackProps.alarmEmail`); the only missing piece, if any, is this one prop value at the
// call site. This test reads the real app entrypoint (infra/src/app.ts) directly — not a
// locally-constructed CrmSyncStack fixture — so a regression at the call site is actually caught,
// not just the construct's own capability (already covered by crm-sync-stack.test.ts).
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { createCrmStacks } from "../src/app.js";
import type { CrmAppConfig } from "../src/config.js";

const CONFIG: CrmAppConfig = {
  region: "eu-north-1",
  account: "515618610572",
  githubRepository: "prismteam-ai/roofing-crm",
  githubRef: "feature/roofing-crm",
  additionalBranches: [],
  aiProvider: "bedrock",
  agentModelId: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
  dataManifestCid: "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute",
  alarmEmail: "eng.heba.gaber@gmail.com",
  explorerBaseUrl: "https://countylens.example.test",
  taskACloudFrontBaseUrl: "https://taska.example.test",
  domainName: "crm.example.test",
  deployNonce: "alarmtest",
};

describe("CrmSyncStack composition (T050/T052, AC-6)", () => {
  it("is instantiated with the SNS alarm-email subscriber wired to an actual email", () => {
    // Building the full app (every stack, including CrmSync/CrmApi's Docker-bundled native
    // DuckDB handlers) is slower than a single-stack fixture — same reason
    // crm-sync-stack.test.ts's own build() is hoisted into beforeAll.
    // Skip Docker bundling: this test reads CloudFormation only (CI bundles under QEMU, minutes per build).
    const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
    createCrmStacks(app, CONFIG);
    const template = Template.fromStack(
      app.node.findChild("CrmSync") as import("aws-cdk-lib").Stack,
    );

    template.hasResourceProperties("AWS::SNS::Subscription", {
      Protocol: "email",
      Endpoint: "eng.heba.gaber@gmail.com",
    });
  }, 240_000);

  it("takes the context-driven hosts into the synthesized templates (no literal hosts in code)", () => {
    const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
    createCrmStacks(app, CONFIG);
    const json = (id: string): string =>
      JSON.stringify(Template.fromStack(app.node.findChild(id) as import("aws-cdk-lib").Stack));
    expect(json("CrmSync")).toContain('"GATEWAY_CLOUDFRONT_BASE_URL":"https://taska.example.test"');
    expect(json("CrmApi")).toContain('"EXPLORER_BASE_URL":"https://countylens.example.test"');
    expect(json("CrmDomain")).toContain("crm.example.test");
  }, 240_000);
});
