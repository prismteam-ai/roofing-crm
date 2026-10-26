# Quickstart: validating B-02 end to end

Two validation layers, matching the espeon prototype-to-production discipline (`build-local-rag-pocs`): a cheap local check first, then the real proof on the hosted runtime. Neither substitutes for the other — the local check is for iteration speed; only the hosted-runtime check counts as evidence (constitution Article I).

## 1. Local prototype (before any AWS resource exists)

**Prerequisites**: `contract/v1/sample.parquet` reachable (vendored `packages/oracle-views`' `bindManifest()` over the sample manifest CID, read from `DATA_MANIFEST_CID` config — never hard-coded).

```bash
pnpm --filter @crm/local-rag-poc query --cid bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i
```

**Expected outcome**: prints property/permit row counts from the sample manifest (35 roofing rows) and confirms at least one row has `roof_age_basis = "missing"` with its exact reason intact (AC-3). This proves the vendored `query-core` binding and the row shape before any Lambda or Step Functions resource is created.

## 2. Deployed sync, against the sample manifest (AC-1, AC-3)

```bash
cd infra && cdk deploy CrmData CrmSync
```

Trigger the state machine (via its EventBridge schedule, or a manual `start-execution` with `executionName = DATA_MANIFEST_CID`) against the sample manifest. Then:

```bash
aws stepfunctions describe-execution --execution-arn <arn>   # status: SUCCEEDED
```

**Expected outcome**: `crm_property`/`crm_permit` Parquet written under `index/{manifestCid}/`; every row carries `sourceManifestCid`; `META#index.current` equals the sample manifest CID.

## 3. Count reconciliation (AC-2, in shape against the sample; repeated at full scale later)

Query the deployed API Lambda's `indexInfo()` (or read the Parquet directly) for `propertyCount`, and compare to the sample manifest's `coverage.parcels_published`. Have `donphan` independently confirm the same count through the Oracle MCP (never on the request path — cross-check only).

**Expected outcome**: counts match, or the difference is written to `docs/evidence/B-02.md` with a reason, per FR-002.

## 4. Idempotent re-run (AC-4)

```bash
aws s3 ls s3://crm-index/raw/<manifestCid>/ --recursive | wc -l   # note count N
# re-run the sync against the same manifestCid
aws s3 ls s3://crm-index/raw/<manifestCid>/ --recursive | wc -l   # expect the same N
```

**Expected outcome**: zero new S3 objects; the second `start-execution` for the same `manifestCid` is rejected by Step Functions (execution-name collision), giving a second, independent idempotency signal.

## 5. Evidence

Write `docs/evidence/B-02.md`: the manifest CID used, counts vs. Task A's published coverage, `donphan`'s MCP cross-check, the idempotent-rerun proof (before/after S3 listing), and the Step Functions execution ARN/trace ID.
