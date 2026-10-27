import { runtimeIdentity } from "../packages/hosted-runtime/src/release.ts";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  REVIEW_REGION,
  REVIEW_STAGE,
  reviewRegion,
  type BuildIdentity,
} from "../packages/runtime-config/src/index.ts";
export function buildIdentity(): BuildIdentity {
  const git = (...args: string[]) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();
  const region = reviewRegion(process.env.PRISM_REGION ?? REVIEW_REGION),
    stage = process.env.PRISM_STAGE ?? "local";
  if (![REVIEW_STAGE, "local"].includes(stage))
    throw new Error("Unexpected P3 stage");
  const source = {
    head: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    dirty: Boolean(git("status", "--porcelain")),
  };
  return runtimeIdentity(
    "crm",
    source,
    {
      version: "0.2.1",
      sha256: createHash("sha256")
        .update(readFileSync("packages/contracts/src/index.ts"))
        .digest("hex"),
    },
    stage as "local" | typeof REVIEW_STAGE,
    region,
  );
}
