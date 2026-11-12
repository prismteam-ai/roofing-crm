/** Synth checks for RoofingCrmWeb (offline): the published app ID and the app-level settings every branch shares. */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { expect, test } from "vitest";
import { APP_ID_PARAM, CrmWebStack } from "../cdk/lib/crm-web-stack.ts";

const synth = () => {
  const siteDir = mkdtempSync(join(tmpdir(), "crm-site-"));
  writeFileSync(join(siteDir, "index.html"), "<!doctype html>");
  return Template.fromStack(
    new CrmWebStack(new cdk.App(), "RoofingCrmWeb", {
      env: { account: "123456789012", region: "eu-north-1" },
      siteDir,
      basicUser: "test-user",
      basicPass: "test-pass",
    }),
  );
};

test("publishes the app ID as /roofing-crm/web/app-id for the pipeline", () => {
  const t = synth();
  const [appId] = Object.keys(t.findResources("AWS::Amplify::App"));
  t.resourceCountIs("AWS::SSM::Parameter", 1);
  t.hasResourceProperties("AWS::SSM::Parameter", {
    Name: APP_ID_PARAM,
    Type: "String",
    Value: { "Fn::GetAtt": [appId, "AppId"] },
  });
  expect(APP_ID_PARAM).toBe("/roofing-crm/web/app-id");
});

test("app-level settings stay as the pipeline's Explorer branch expects, and main is the only branch created here", () => {
  const t = synth();
  t.resourceCountIs("AWS::Amplify::App", 1);
  t.resourceCountIs("AWS::Amplify::Branch", 1);
  t.hasResourceProperties("AWS::Amplify::Branch", {
    BranchName: "main",
    BasicAuthConfig: Match.objectLike({ EnableBasicAuth: true }),
  });
  const app = Object.values(t.findResources("AWS::Amplify::App"))[0]!
    .Properties as Record<string, unknown>;
  expect(app.BasicAuthConfig).toEqual({ EnableBasicAuth: false });
  expect(app.CustomRules).toEqual([
    { Source: "</^[^.]+$/>", Status: "200", Target: "/index.html" },
  ]);
  expect(app).not.toHaveProperty("AutoBranchCreationConfig");
  expect(app).not.toHaveProperty("EnableBranchAutoDeletion");
  expect(app.Platform).toBe("WEB");
});
