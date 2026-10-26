// B-09 review fixes: the alarm email comes from cdk.json context (`crm:alarmEmail`, metagross
// Major — never hard-coded in infra/src/app.ts), and every synth carries a deploy nonce so the
// deploy-time sync start re-runs on every deploy (/code-review Major). Both are validated here,
// fail-fast, like the other context values.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig, type ContextGetter, type LoadConfigEnv } from "../src/config.js";

const ENV: LoadConfigEnv = {
  AWS_REGION: "eu-north-1",
  DATA_MANIFEST_CID: "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i",
};

const CDK_JSON_CONTEXT = (
  JSON.parse(readFileSync(new URL("../cdk.json", import.meta.url), "utf8")) as {
    context: Record<string, unknown>;
  }
).context;

const contextFrom =
  (overrides: Record<string, unknown> = {}): ContextGetter =>
  (key) =>
    key in overrides ? overrides[key] : CDK_JSON_CONTEXT[key];

describe("loadConfig: crm:alarmEmail", () => {
  it("reads the alarm email from cdk.json context (same address as before the move)", () => {
    const config = loadConfig(ENV, contextFrom());
    expect(config.alarmEmail).toBe("eng.heba.gaber@gmail.com");
  });

  it("fails fast when it is missing, so the DLQ/groundedness alarms never silently lose their subscriber", () => {
    expect(() => loadConfig(ENV, contextFrom({ "crm:alarmEmail": undefined }))).toThrow(
      /crm:alarmEmail/,
    );
  });

  it("rejects a value that is not an email address", () => {
    expect(() => loadConfig(ENV, contextFrom({ "crm:alarmEmail": "not-an-email" }))).toThrow(
      /crm:alarmEmail/,
    );
  });
});

describe("loadConfig: deploy nonce", () => {
  it("uses CRM_DEPLOY_NONCE when set", () => {
    const config = loadConfig({ ...ENV, CRM_DEPLOY_NONCE: "ci-1234" }, contextFrom());
    expect(config.deployNonce).toBe("ci-1234");
  });

  it("otherwise generates a fresh one per synth (so each deploy re-attempts the sync start)", () => {
    const first = loadConfig(ENV, contextFrom(), () => 1_000_000).deployNonce;
    const second = loadConfig(ENV, contextFrom(), () => 1_000_001).deployNonce;
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{1,16}$/);
  });

  it("rejects a nonce Step Functions would refuse in an execution name", () => {
    expect(() => loadConfig({ ...ENV, CRM_DEPLOY_NONCE: "has space" }, contextFrom())).toThrow(
      /CRM_DEPLOY_NONCE/,
    );
    expect(() => loadConfig({ ...ENV, CRM_DEPLOY_NONCE: "x".repeat(17) }, contextFrom())).toThrow(
      /CRM_DEPLOY_NONCE/,
    );
  });
});

describe("loadConfig: hosts from cdk.json context", () => {
  it("reads the explorer, Task A CloudFront and domain values (same hosts as before the move)", () => {
    const config = loadConfig(ENV, contextFrom());
    expect(config.explorerBaseUrl).toBe("https://countylens.aldarraj.com");
    expect(config.taskACloudFrontBaseUrl).toBe("https://d2xsqoqv09bd0q.cloudfront.net");
    expect(config.domainName).toBe("crm.aldarraj.com");
  });

  it("fails fast when any of them is missing or malformed", () => {
    for (const key of ["crm:explorerBaseUrl", "crm:taskACloudFrontBaseUrl"]) {
      expect(() => loadConfig(ENV, contextFrom({ [key]: undefined }))).toThrow(key);
      expect(() => loadConfig(ENV, contextFrom({ [key]: "http://x.test/path" }))).toThrow(key);
    }
    expect(() => loadConfig(ENV, contextFrom({ "crm:domainName": "nope" }))).toThrow(
      /crm:domainName/,
    );
  });
});
