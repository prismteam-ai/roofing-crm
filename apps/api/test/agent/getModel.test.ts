// CR finding 2 (gateway half): the Vercel AI Gateway key is not wired from Secrets Manager in
// this deployment, so the gateway path fails with a typed config error instead of a provider
// auth error at the first model call. Bedrock is unaffected.
import {
  GetSecretValueCommand,
  ResourceNotFoundException,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GatewayKeyNotWiredError,
  getModel,
  resetModelCacheForTest,
  resolveModel,
} from "../../src/agent/getModel.js";

const secretsMock = mockClient(SecretsManagerClient);
beforeEach(() => secretsMock.reset());
afterEach(() => resetModelCacheForTest());

describe("getModel", () => {
  it("builds the Bedrock model from AGENT_MODEL_ID", () => {
    const model = getModel({
      AI_PROVIDER: "bedrock",
      AGENT_MODEL_ID: "eu.anthropic.claude-sonnet-4-6",
    });
    expect(typeof model === "string" ? model : model.modelId).toBe(
      "eu.anthropic.claude-sonnet-4-6",
    );
  });

  it("fails typed on the gateway path when no Gateway key is available", () => {
    expect(() =>
      getModel({ AI_PROVIDER: "gateway", AGENT_MODEL_ID: "anthropic/claude-sonnet-4.6" }),
    ).toThrow(GatewayKeyNotWiredError);
  });
});

const ARN = "arn:aws:secretsmanager:eu-north-1:515618610572:secret:crm/ai-gateway-AbCdEf";
const GATEWAY_ENV = {
  AI_PROVIDER: "gateway",
  AGENT_MODEL_ID: "anthropic/claude-sonnet-4.6",
  AI_GATEWAY_SECRET_ARN: ARN,
};

describe("resolveModel (gateway key from Secrets Manager)", () => {
  it("reads the key once from the named secret, caches it for the sandbox, and builds the gateway model", async () => {
    secretsMock.on(GetSecretValueCommand).resolves({ SecretString: "vck_test_key" });
    const first = await resolveModel(GATEWAY_ENV);
    const second = await resolveModel(GATEWAY_ENV);
    expect(typeof first === "string" ? first : first.modelId).toBe("anthropic/claude-sonnet-4.6");
    expect(second).toBe(first);
    expect(secretsMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);
    expect(secretsMock.commandCalls(GetSecretValueCommand)[0]?.args[0].input).toEqual({
      SecretId: ARN,
    });
  });

  it("shares one in-flight read between concurrent callers", async () => {
    secretsMock.on(GetSecretValueCommand).resolves({ SecretString: "vck_test_key" });
    await Promise.all([resolveModel(GATEWAY_ENV), resolveModel(GATEWAY_ENV)]);
    expect(secretsMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);
  });

  it("accepts a JSON secret with an AI_GATEWAY_API_KEY field", async () => {
    secretsMock
      .on(GetSecretValueCommand)
      .resolves({ SecretString: JSON.stringify({ AI_GATEWAY_API_KEY: "vck_json_key" }) });
    await expect(resolveModel(GATEWAY_ENV)).resolves.toBeDefined();
  });

  it("fails typed, and does not cache the failure, when the secret cannot be read; the message never carries the key or the secret value", async () => {
    secretsMock
      .on(GetSecretValueCommand)
      .rejects(new ResourceNotFoundException({ message: "nope", $metadata: {} }));
    await expect(resolveModel(GATEWAY_ENV)).rejects.toBeInstanceOf(GatewayKeyNotWiredError);
    secretsMock.on(GetSecretValueCommand).resolves({ SecretString: "vck_test_key" });
    await expect(resolveModel(GATEWAY_ENV)).resolves.toBeDefined();
  });

  it("fails typed on an empty secret", async () => {
    secretsMock.on(GetSecretValueCommand).resolves({ SecretString: "" });
    await expect(resolveModel(GATEWAY_ENV)).rejects.toBeInstanceOf(GatewayKeyNotWiredError);
  });

  it("never writes the key to the log or the console", async () => {
    const spies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
    ];
    secretsMock.on(GetSecretValueCommand).resolves({ SecretString: "vck_super_secret_value" });
    await resolveModel(GATEWAY_ENV);
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain("vck_super_secret_value");
      spy.mockRestore();
    }
  });

  it("gateway without a secret ARN and without a local key still fails typed, and makes no Secrets Manager call", async () => {
    await expect(
      resolveModel({ AI_PROVIDER: "gateway", AGENT_MODEL_ID: "anthropic/claude-sonnet-4.6" }),
    ).rejects.toBeInstanceOf(GatewayKeyNotWiredError);
    expect(secretsMock.commandCalls(GetSecretValueCommand)).toHaveLength(0);
  });

  it("a local AI_GATEWAY_API_KEY still wins and needs no Secrets Manager call", async () => {
    await resolveModel({
      AI_PROVIDER: "gateway",
      AGENT_MODEL_ID: "anthropic/claude-sonnet-4.6",
      AI_GATEWAY_API_KEY: "vck_local",
    });
    expect(secretsMock.commandCalls(GetSecretValueCommand)).toHaveLength(0);
  });

  it("bedrock never touches Secrets Manager", async () => {
    await resolveModel({
      AI_PROVIDER: "bedrock",
      AGENT_MODEL_ID: "eu.anthropic.claude-sonnet-4-6",
      AI_GATEWAY_SECRET_ARN: ARN,
    });
    expect(secretsMock.commandCalls(GetSecretValueCommand)).toHaveLength(0);
  });
});
