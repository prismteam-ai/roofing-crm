import { execFileSync } from "node:child_process";
import { buildIdentity } from "./build-identity";
const identity = buildIdentity();
/** These are hashed Turbo inputs, not pass-through values. Metadata-only commits therefore change build inputs. */
execFileSync(
  process.execPath,
  ["node_modules/turbo/bin/turbo", "run", "build"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PRISM_BUILD_HEAD: identity.head,
      PRISM_BUILD_TREE: identity.tree,
      PRISM_BUILD_ID: identity.buildId,
    },
  },
);
