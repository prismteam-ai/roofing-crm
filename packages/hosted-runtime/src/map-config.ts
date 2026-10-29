import { hostedSecretValue } from "./read-only-secrets-client";
import { openStreetMapProvider } from "../../map-domain/src/basemap";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { z } from "zod";
import { DomainError } from "../../contracts/src/index";
export const LocationConfigSchema = z
  .object({
    apiKey: z.string().min(10).max(2048),
    allowedOrigin: z.string().url(),
    region: z.literal("us-east-2"),
    style: z.literal("Standard"),
    expiresAt: z.iso.datetime(),
    restrictionsDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export function mapConfiguration(
  secretId: string,
  client = new SecretsManagerClient({ region: "us-east-2", maxAttempts: 1 }),
  clock = Date.now,
) {
  let cached: { until: number; value: unknown } | undefined;
  return async (signal?: AbortSignal, assertActive?: () => void) => {
    assertActive?.();
    if (signal?.aborted)
      throw new DomainError(
        "QUERY_TIMEOUT",
        "Map secret deadline exceeded before dispatch",
      );
    if (cached && cached.until > clock()) return cached.value;
    const out = await hostedSecretValue(client, secretId, signal, assertActive);
    const root = JSON.parse(out.SecretString ?? "{}");
    if (root.publicRasterMap && root.locationMap)
      throw new Error("Conflicting map configurations rejected");
    if (root.publicRasterMap) {
      openStreetMapProvider(
        root.publicRasterMap,
        root.publicRasterMap.allowedOrigin,
        clock(),
      );
      const value = root.publicRasterMap;
      cached = {
        until: Math.min(clock() + 60000, Date.parse(value.expiresAt)),
        value,
      };
      return value;
    }
    if (!root.locationMap) return { kind: "offline" };
    const config = LocationConfigSchema.parse(root.locationMap),
      origin = new URL(config.allowedOrigin);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.origin !== config.allowedOrigin ||
      !/^d[a-z0-9]+\.cloudfront\.net$/.test(origin.hostname) ||
      Date.parse(config.expiresAt) <= clock()
    )
      throw new Error("Restricted map configuration unavailable");
    const value = { kind: "amazon-location", ...config };
    cached = {
      until: Math.min(clock() + 60000, Date.parse(config.expiresAt)),
      value,
    };
    return value;
  };
}
