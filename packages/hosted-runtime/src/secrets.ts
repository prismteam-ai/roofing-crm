import { hostedSecretValue } from "./read-only-secrets-client";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { AccessService, type AccessConfig } from "./access.ts";
import { DomainError } from "../../contracts/src/index";
export function secretAccessProvider(
  secretId: string,
  client = new SecretsManagerClient({}),
  clock = Date.now,
) {
  let cached: { until: number; service: AccessService } | undefined;
  let loading: Promise<AccessService> | undefined;
  return async (signal?: AbortSignal, assertActive?: () => void) => {
    assertActive?.();
    if (signal?.aborted)
      throw new DomainError(
        "QUERY_TIMEOUT",
        "Access secret deadline exceeded before dispatch",
      );
    if (cached && cached.until > clock()) return cached.service;
    if (loading) return loading;
    loading = (async () => {
      const out = await hostedSecretValue(
        client,
        secretId,
        signal,
        assertActive,
      );
      const config = JSON.parse(out.SecretString ?? "null") as AccessConfig;
      const service = new AccessService(config, clock);
      cached = { service, until: clock() + 60000 };
      return service;
    })();
    try {
      return await loading;
    } finally {
      loading = undefined;
    }
  };
}
