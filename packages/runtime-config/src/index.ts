import { CONTRACT_VERSION } from "../../contracts/src/index.ts";
import contractManifest from "../../contracts/contract_manifest.json" with { type: "json" };
export const REVIEW_REGION = "us-east-2" as const;
export const REVIEW_STAGE = "review" as const;
export const MICRO_MODEL = "us.amazon.nova-micro-v1:0" as const;
export const LITE_MODEL = "us.amazon.nova-lite-v1:0" as const;
export function reviewRegion(
  value: string = REVIEW_REGION,
): typeof REVIEW_REGION {
  if (value !== REVIEW_REGION)
    throw new Error("Review region must be us-east-2");
  return REVIEW_REGION;
}
export function reviewModel(
  value: string = MICRO_MODEL,
  qualityFailureApproved = false,
): string {
  if (value === MICRO_MODEL) return value;
  if (value === LITE_MODEL && qualityFailureApproved) return value;
  throw new Error(
    "Only approved US Nova Micro or quality-gated US Nova Lite inference profiles are authorized",
  );
}
export type { RuntimeIdentity as BuildIdentity } from "../../hosted-runtime/src/release.ts";
import type { RuntimeIdentity } from "../../hosted-runtime/src/release.ts";
declare const __PRISM_BUILD__: RuntimeIdentity | undefined;
export const BUILD_IDENTITY: RuntimeIdentity =
  typeof __PRISM_BUILD__ !== "undefined" && __PRISM_BUILD__
    ? __PRISM_BUILD__
    : {
        application: "crm",
        head: "unbuilt-local",
        tree: "unbuilt-local",
        buildId: "unbuilt-local",
        region: REVIEW_REGION,
        stage: "local",
        sourceDirty: true,
        contractVersion: CONTRACT_VERSION,
        contractSha256: contractManifest.sha256,
      };
