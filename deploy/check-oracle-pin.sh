#!/usr/bin/env bash
# The CRM builds against the Oracle's `contract` export from the sibling checkout (link:). This
# checks that the checkout is the Oracle commit pinned in deploy/hosted.json (`oracleCommit`), the
# same commit CI builds against, so a local build or deploy can't use a different contract.
set -euo pipefail
cd "$(dirname "$0")/.."
want=$(node -p "require('./deploy/hosted.json').oracleCommit")
dir=../oracle-property-intelligence-platform-pipeline-broward-fl
have=$(git -C "$dir" rev-parse HEAD)
if [ "$have" != "$want" ]; then
  echo "Oracle checkout is at $have, but deploy/hosted.json pins oracleCommit $want." >&2
  echo "Check out the pinned commit in $dir, or update oracleCommit (and test) to move the pin." >&2
  exit 1
fi
if [ -n "$(git -C "$dir" status --porcelain -- src/contract src/client)" ]; then
  echo "Oracle checkout has uncommitted changes in src/contract or src/client." >&2
  exit 1
fi
echo "Oracle pinned at ${want:0:7}"
