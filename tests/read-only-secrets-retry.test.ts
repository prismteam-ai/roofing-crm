import { expect, it, vi } from "vitest";
import {
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { createHostedReadOnlySecretsClient } from "../packages/hosted-runtime/src/read-only-secrets-client";
import { secretAccessProvider } from "../packages/hosted-runtime/src/secrets";
import { accessCodeDigest } from "../packages/hosted-runtime/src/access";
import { TurnDeadline } from "../packages/hosted-runtime/src/turn-deadline";
const config = {
  signingKey: "synthetic-read-only-secret-signing-key-32",
  reviewCodeDigest: accessCodeDigest("synthetic-code"),
  keyVersion: "synthetic",
};
function client(responses: readonly { status: number; body: object }[]) {
  const targets: string[] = [];
  const sdk = createHostedReadOnlySecretsClient("us-east-2", {
    credentials: { accessKeyId: "SYNTHETIC", secretAccessKey: "SYNTHETIC" },
    requestHandler: {
      handle: async (request: { headers: Record<string, string> }) => {
        targets.push(request.headers["x-amz-target"]);
        const next =
          responses[Math.min(targets.length - 1, responses.length - 1)];
        return {
          response: {
            statusCode: next.status,
            headers: { "content-type": "application/x-amz-json-1.1" },
            body: new TextEncoder().encode(JSON.stringify(next.body)),
          },
        };
      },
    },
  });
  return { sdk, targets };
}
const transient = {
  status: 500,
  body: { __type: "InternalServiceError", Message: "synthetic-only" },
};
const success = { status: 200, body: { SecretString: JSON.stringify(config) } };
it("the actual installed SDK retries one transient GetSecretValue, then cache/dedup prevent extra reads", async () => {
  const { sdk, targets } = client([transient, success]);
  try {
    expect(await sdk.config.maxAttempts()).toBe(2);
    const read = secretAccessProvider("synthetic-secret", sdk);
    const results = await Promise.all([read(), read(), read()]);
    expect(results[0]).toBe(results[1]);
    expect(await read()).toBe(results[0]);
    expect(targets).toEqual([
      "secretsmanager.GetSecretValue",
      "secretsmanager.GetSecretValue",
    ]);
  } finally {
    sdk.destroy();
  }
});
for (const failure of [
  {
    status: 403,
    body: { __type: "AccessDeniedException", Message: "synthetic-only" },
  },
  {
    status: 400,
    body: { __type: "InvalidRequestException", Message: "synthetic-only" },
  },
  { status: 200, body: { SecretString: "{}" } },
])
  it(`fails closed without retrying nontransient/config-invalid ${failure.status}`, async () => {
    const { sdk, targets } = client([failure, success]);
    try {
      await expect(
        secretAccessProvider("synthetic-secret", sdk)(),
      ).rejects.toThrow();
      expect(targets).toHaveLength(1);
    } finally {
      sdk.destroy();
    }
  });
it("stops after exactly two transient attempts and permits a later independent recovery read", async () => {
  const { sdk, targets } = client([transient, transient, success]);
  const read = secretAccessProvider("synthetic-secret", sdk);
  try {
    await expect(read()).rejects.toThrow();
    expect(targets).toHaveLength(2);
    await read();
    expect(targets).toHaveLength(3);
  } finally {
    sdk.destroy();
  }
});
it("rejects secret mutations before transport and rejects preexpired reads", async () => {
  const { sdk, targets } = client([success]);
  try {
    await expect(
      sdk.send(
        new PutSecretValueCommand({
          SecretId: "synthetic-secret",
          SecretString: "synthetic-value",
        }),
      ),
    ).rejects.toThrow("GetSecretValue only");
    const controller = new AbortController();
    controller.abort();
    await expect(
      secretAccessProvider("synthetic-secret", sdk)(controller.signal),
    ).rejects.toThrow("deadline");
    expect(targets).toEqual([]);
    await sdk.send(new GetSecretValueCommand({ SecretId: "synthetic-secret" }));
    expect(targets).toHaveLength(1);
  } finally {
    sdk.destroy();
  }
});
it("the installed SDK does not dispatch a retry after the request signal expires", async () => {
  const controller = new AbortController();
  let attempts = 0;
  const sdk = createHostedReadOnlySecretsClient("us-east-2", {
    credentials: { accessKeyId: "SYNTHETIC", secretAccessKey: "SYNTHETIC" },
    requestHandler: {
      handle: async () => {
        attempts++;
        controller.abort();
        return {
          response: {
            statusCode: 500,
            headers: { "content-type": "application/x-amz-json-1.1" },
            body: new TextEncoder().encode(JSON.stringify(transient.body)),
          },
        };
      },
    },
  });
  try {
    await expect(
      sdk.send(new GetSecretValueCommand({ SecretId: "synthetic-secret" }), {
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  } finally {
    sdk.destroy();
  }
});
it("checks the command-local monotonic guard on an SDK retry before timer delivery", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let elapsed = 0,
    attempts = 0;
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const budget = new TurnDeadline(10);
  const sdk = createHostedReadOnlySecretsClient("us-east-2", {
    credentials: { accessKeyId: "SYNTHETIC", secretAccessKey: "SYNTHETIC" },
    requestHandler: {
      handle: async () => {
        attempts++;
        elapsed = 11;
        return {
          response: {
            statusCode: 500,
            headers: { "content-type": "application/x-amz-json-1.1" },
            body: new TextEncoder().encode(JSON.stringify(transient.body)),
          },
        };
      },
    },
  });
  try {
    const settled = secretAccessProvider("synthetic-secret", sdk)(
      budget.signal,
      () => budget.assertActive(),
    ).then(
      () => "resolved",
      (error: unknown) => error,
    );
    // Force zero SDK retry jitter and advance only1ms. The parent10ms abort
    // remains pending; only the command-local monotonic guard can stop retry.
    await vi.advanceTimersByTimeAsync(1);
    expect(budget.signal.aborted).toBe(false);
    expect(await settled).toMatchObject({ code: "QUERY_TIMEOUT" });
    expect(attempts).toBe(1);
  } finally {
    budget.dispose();
    sdk.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
