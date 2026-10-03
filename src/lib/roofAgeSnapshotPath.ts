import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOF_AGE_SNAPSHOT_URL =
  "https://ipfs.filebase.io/ipfs/bafybeiejbzvkke5sygftcxqj75e6peh4e44xblrfzvxa7cm53xlyi4c5ve";

export const ROOF_AGE_SNAPSHOT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../oracle-property-intelligence-platform-pipeline-santa-clara-ca/fixtures/santa-clara-permits/san-jose-reroof-roof-age.json"
);
