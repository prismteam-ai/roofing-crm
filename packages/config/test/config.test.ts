import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/index.js";

const SAMPLE_MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const AI_FIELDS = { AI_PROVIDER: "bedrock", AGENT_MODEL_ID: "eu.anthropic.claude-sonnet-4-6" };
const DEFAULT_AI_FIELDS = { aiProvider: "bedrock", agentModelId: "eu.anthropic.claude-sonnet-4-6" };

describe("loadConfig", () => {
  it("resolves region from CDK_DEFAULT_REGION", () => {
    expect(
      loadConfig({
        CDK_DEFAULT_REGION: "eu-north-1",
        DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
        ...AI_FIELDS,
      }),
    ).toEqual({ region: "eu-north-1", dataManifestCid: SAMPLE_MANIFEST_CID, ...DEFAULT_AI_FIELDS });
  });

  it("falls back to AWS_REGION", () => {
    expect(
      loadConfig({
        AWS_REGION: "eu-north-1",
        DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
        ...AI_FIELDS,
      }),
    ).toEqual({ region: "eu-north-1", dataManifestCid: SAMPLE_MANIFEST_CID, ...DEFAULT_AI_FIELDS });
  });

  it("prefers CDK_DEFAULT_REGION over AWS_REGION", () => {
    expect(
      loadConfig({
        CDK_DEFAULT_REGION: "eu-north-1",
        AWS_REGION: "us-east-2",
        DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
        ...AI_FIELDS,
      }),
    ).toEqual({ region: "eu-north-1", dataManifestCid: SAMPLE_MANIFEST_CID, ...DEFAULT_AI_FIELDS });
  });

  it("fails fast when no region is set", () => {
    expect(() => loadConfig({})).toThrow(/no region resolved/);
  });

  it("fails fast on a disallowed region (region-lock, CLAUDE.md)", () => {
    expect(() => loadConfig({ AWS_REGION: "us-east-2" })).toThrow(/not an allowed region/);
  });

  it("reads DATA_MANIFEST_CID from the environment, never a hard-coded constant", () => {
    expect(
      loadConfig({
        AWS_REGION: "eu-north-1",
        DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
        ...AI_FIELDS,
      }),
    ).toEqual({
      region: "eu-north-1",
      dataManifestCid: SAMPLE_MANIFEST_CID,
      ...DEFAULT_AI_FIELDS,
    });
  });

  it("fails fast when DATA_MANIFEST_CID is missing", () => {
    expect(() => loadConfig({ AWS_REGION: "eu-north-1" })).toThrow(/DATA_MANIFEST_CID/);
  });

  it("fails fast when DATA_MANIFEST_CID is not a CIDv1 string", () => {
    expect(() =>
      loadConfig({ AWS_REGION: "eu-north-1", DATA_MANIFEST_CID: "not-a-cid", ...AI_FIELDS }),
    ).toThrow(/DATA_MANIFEST_CID/);
  });

  // AI_PROVIDER/AGENT_MODEL_ID no longer default inside loadConfig itself (every other field
  // here fails fast with no default); the Bedrock-default selection moved to the CDK composition
  // layer (infra/src/config.ts's withAiProviderDefaults), tested there instead.
  it("fails fast when AI_PROVIDER is missing", () => {
    expect(() =>
      loadConfig({ AWS_REGION: "eu-north-1", DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID }),
    ).toThrow(/AI_PROVIDER/);
  });

  it("fails fast when AGENT_MODEL_ID is missing", () => {
    expect(() =>
      loadConfig({
        AWS_REGION: "eu-north-1",
        DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
        AI_PROVIDER: "bedrock",
      }),
    ).toThrow(/AGENT_MODEL_ID/);
  });

  it("reads AI_PROVIDER=gateway with an explicit AGENT_MODEL_ID", () => {
    const config = loadConfig({
      AWS_REGION: "eu-north-1",
      DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
      AI_PROVIDER: "gateway",
      AGENT_MODEL_ID: "anthropic/claude-sonnet-4.6",
    });
    expect(config.aiProvider).toBe("gateway");
    expect(config.agentModelId).toBe("anthropic/claude-sonnet-4.6");
  });

  it("reads an explicit AGENT_MODEL_ID", () => {
    const config = loadConfig({
      AWS_REGION: "eu-north-1",
      DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
      AI_PROVIDER: "bedrock",
      AGENT_MODEL_ID: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    });
    expect(config.agentModelId).toBe("eu.anthropic.claude-haiku-4-5-20251001-v1:0");
  });

  it("fails fast on an unsupported AI_PROVIDER", () => {
    expect(() =>
      loadConfig({
        AWS_REGION: "eu-north-1",
        DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
        AI_PROVIDER: "openai",
        AGENT_MODEL_ID: "whatever",
      }),
    ).toThrow(/AI_PROVIDER/);
  });
});
