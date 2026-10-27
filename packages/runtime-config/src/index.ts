export const REVIEW_REGION = "us-east-1" as const;
export const REVIEW_STAGE = "p3-review" as const;
export const MICRO_MODEL = "amazon.nova-micro-v1:0" as const;
export const LITE_MODEL = "amazon.nova-lite-v1:0" as const;
export function reviewRegion(
  value: string = REVIEW_REGION,
): typeof REVIEW_REGION {
  if (value !== REVIEW_REGION)
    throw new Error("P3 review region must be us-east-1");
  return REVIEW_REGION;
}
export function reviewModel(
  value: string = MICRO_MODEL,
  qualityFailureApproved = false,
): string {
  if (value === MICRO_MODEL) return value;
  if (value === LITE_MODEL && qualityFailureApproved) return value;
  throw new Error(
    "Only direct regional Nova Micro, or quality-gated Nova Lite, is authorized",
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
        contractVersion: "0.2.1",
        contractSha256:
          "ef0334150b553825338180bde8e2c07cc7753229b2c105b0966e545cb965ac4f",
      };
