import {
  GetSecretValueCommand,
  SecretsManagerClient,
  type SecretsManagerClientConfig,
} from "@aws-sdk/client-secrets-manager";
import { DomainError } from "../../contracts/src/index";
/** The guard is attached to this command, never to a shared current-request slot. */
export function hostedSecretValue(
  client: SecretsManagerClient,
  secretId: string,
  signal?: AbortSignal,
  assertActive?: () => void,
) {
  const command = new GetSecretValueCommand({ SecretId: secretId });
  command.middlewareStack.add(
    (next) => async (args) => {
      assertActive?.();
      if (signal?.aborted)
        throw new DomainError(
          "QUERY_TIMEOUT",
          "Secret read deadline exceeded before dispatch",
        );
      return next(args);
    },
    {
      step: "finalizeRequest",
      priority: "low",
      name: "prismSecretAttemptDeadline",
    },
  );
  return client.send(command, { abortSignal: signal });
}
/** Only hosted GetSecretValue reads may retry once. No other SecretsManager operation reaches transport. */
export function createHostedReadOnlySecretsClient(
  region: "us-east-2",
  transport: Pick<
    SecretsManagerClientConfig,
    "requestHandler" | "credentials"
  > = {},
) {
  const client = new SecretsManagerClient({
    ...transport,
    region,
    maxAttempts: 2,
  });
  // Check each SDK retry at the final transport boundary as well. An injected
  // handler may ignore cancellation; that cannot authorize a later dispatch.
  const handler = client.config.requestHandler;
  const send = handler.handle.bind(handler);
  handler.handle = (request, options) => {
    if (options && "abortSignal" in options && options.abortSignal?.aborted)
      return Promise.reject(
        Object.assign(new Error("Hosted secret read deadline exceeded"), {
          name: "AbortError",
        }),
      );
    return send(request, options);
  };
  client.middlewareStack.add(
    (next, context) => async (args) => {
      if (context.commandName !== "GetSecretValueCommand")
        throw new Error("Hosted secret client permits GetSecretValue only");
      return next(args);
    },
    {
      step: "initialize",
      name: "prismReadOnlySecretBoundary",
      priority: "high",
    },
  );
  return client;
}
