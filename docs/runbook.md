# Runbook: data sync, rollback and replay

Everything here runs from the PO's laptop with the `assess` profile (account 515618610572, `eu-north-1`). CI never deploys.

## Which data is served

`META#index` in the `crm-leads` DynamoDB table holds `current` (the served manifest CID) and `previous`. The API loads `index/{current}/crm_property.parquet` and `crm_permit.parquet` from the `crm-index` bucket.

## Move to a new Task A run

1. Set the GitHub variable `DATA_MANIFEST_CID` to the new manifest CID (`gh variable set DATA_MANIFEST_CID -R HebaGaber/roofing-crm --body <cid>`).
2. Deploy from a clean worktree: `cdk deploy --all` in `infra/` with `DATA_MANIFEST_CID`, `AI_PROVIDER`, `AGENT_MODEL_ID` set. The deploy starts one `crm-sync` execution named `{cid}-{nonce}`.
3. Watch the execution in Step Functions. Plan fetches and verifies every part by CID and SHA-256, BuildIndex writes the Parquet index, Validate checks it, Promote flips the pointer only when all checks pass.

## Roll back to the previous run

The previous index files stay in S3 under `index/{previous}/`, so a rollback does not rebuild anything.

```text
scripts/sync-ops.sh status            # served and previous CIDs, counts, DLQ depth
scripts/sync-ops.sh rollback          # dry run: names both CIDs and checks the files exist
scripts/sync-ops.sh rollback --yes    # swaps current and previous in META#index (conditional write)
```

Then set the GitHub variable `DATA_MANIFEST_CID` to the CID you rolled back to, so the next deploy does not move forward again. Warm API instances reload the index within their cache window; to force it bump `INDEX_SCHEMA_VERSION` in `infra/lib/crm-api-stack.ts` and deploy `CrmApi`. The old path still works: set `DATA_MANIFEST_CID` to the old CID and deploy, which rebuilds and promotes it (about 3 minutes plus the deploy).

## Rebuild the served run after a code change

`scripts/sync-ops.sh replay` starts a `crm-sync` execution with `{"manifestCidHint": "<current cid>", "forceRebuild": true}` and waits for it. The pointer stays; the Parquet files are rewritten. Then bump `INDEX_SCHEMA_VERSION` and redeploy `CrmApi`.

## Alarms (the sync alarm topic, emailed to the configured alarm address)

| Alarm | Meaning | What to do |
| --- | --- | --- |
| `crm-sync-fetch-part-dlq-depth` | A part could not be fetched or verified | Read the DLQ messages, fix or wait for the gateway, start a new execution. The run was held; the old index serves. |
| `crm-sync-execution-failed` / `-timed-out` / `-aborted` | A step crashed (for example BuildIndex out of memory) | Open the execution, read the failing step's error, fix, start a new execution. The old index serves. |
| `crm-sync-build-index-memory-high` | BuildIndex used more than 85 % of its 3,008 MB (2,560 MB) in one run, taken from Lambda's own REPORT line | The next larger run may run out of memory. Plan the move of BuildIndex to Fargate (below) before the next Task A run is adopted |
| `crm-sync-held-no-promotion` | Plan or Validate held the run (cost gate, profile digest, lineage fork, unverified part, unexplained diff) | The execution succeeded but did not promote. Read the `HeldNoPromotion` state input for the reason. |

## How failures show up

Plan, BuildIndex, Validate and Promote catch any error into one `SyncFailed` state, so a failed run reads `CrmSyncFailed` in the execution list; the failing step's error is in the execution history under that step. Lambda service errors are retried first (the default `LambdaInvoke` retry: 6 attempts, 2 s doubling). `crm-sync-execution-failed` fires on every such run. Alarm emails go to the address in `cdk.json` (`crm:alarmEmail`).

## Fetch rate limit

FetchPart limits requests per gateway with a token bucket inside each Lambda container. The Map runs 3 fetches in parallel, so the effective rate is up to 3 times one bucket. This is accepted: the gateways are public IPFS gateways with generous limits, a throttled request retries with backoff and falls back to the next gateway, and every part is verified by SHA-256 so a wrong or partial answer is never stored. Lowering `FETCH_PART_MAP_CONCURRENCY` to 1 makes the rate exact at the cost of a longer fetch phase (the whole Run 3.1 sync takes about 2.5 minutes today, most of it the build).

## Replaying the FetchPart DLQ

Messages in `crm-sync-fetch-part-dlq` are `{manifestCid, part}`. They are not redriven one by one (Step Functions writes them after a part fails, so there is no source queue to redrive into); `scripts/sync-ops.sh replay` starts a new execution for the served CID, which refetches only what is missing (already stored parts are skipped by their content-addressed key). Purge the queue after the new run succeeds so the alarm returns to OK: `aws sqs purge-queue --queue-url <DLQ url>`.

## BuildIndex memory

BuildIndex runs DuckDB at `memory_limit` 2600 MB inside a 3008 MB Lambda (the account cannot raise Lambda memory above 3008 MB). Run 3.1 builds in 51 to 88 seconds. `crm-sync-build-index-memory-high` warns at 2,560 MB used. If a later run grows past the limit the execution fails and `crm-sync-execution-failed` fires. The trigger to move BuildIndex to Fargate (architecture constitution section 10) is the memory alarm firing once, or a run that approaches the 12-minute build budget.

## Demo-project data policy

The leads table and the index bucket use `RemovalPolicy.DESTROY` so the demo stack can be torn down. Deleting the CrmData stack deletes the leads.
