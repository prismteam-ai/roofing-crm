# Implementation Plan: Lead search index from Task A's published data

**Branch**: `002-lead-index` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-lead-index/spec.md`

## Summary

Build the Step Functions sync pipeline (`Plan → FetchPart → BuildIndex → Validate → Promote`) that reads Task A's pinned manifest CID, fetches `v_property`/`v_roofing_permit` by CID with sha256 verification (CloudFront → Filebase → Pinata, ADR-02), writes `crm_property`/`crm_permit` Parquet to a private S3 bucket, and atomically flips the `META#index` pointer only after validation passes. The search/retrieval store is DuckDB over Parquet inside the API Lambda — no OpenSearch domain (ADR-01, accepted deviation). Task A's `query-core`/`contract` packages are vendored and digest-guarded (ADR-07), never re-implemented. Built and proven first against Task A's already-published sample manifest (`bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`); the full-county switch is a config change, not a code change.

## Technical Context

**Language/Version**: TypeScript (Node.js, matching the existing `apps/api`/`infra` toolchain)

**Primary Dependencies**: AWS CDK (TypeScript), AWS Step Functions + Lambda, `@duckdb/node-api` (DuckDB over Parquet, in-Lambda), Zod, vendored `packages/oracle-contract` + `packages/oracle-views` (pinned copies of Task A's `contract` + `query-core`, ADR-07)

**Storage**: S3 (private bucket `crm-index`, content-addressed keys under `raw/{manifestCid}/` and `index/{manifestCid}/`) + DynamoDB (`META#index` pointer item, reusing the existing `crm-leads` table per architecture-constitution.md §9's module boundary — no new table). No OpenSearch domain (ADR-01).

**Testing**: Vitest (unit, contract), a query-only local CLI prototype against `contract/v1/sample.parquet` (build-local-rag-pocs discipline, proven before any AWS resource), Step Functions execution checks against the deployed `eu-north-1` state machine (no Playwright — this story has no UI, per constitution Article XXII: tests run against the hosted runtime, here meaning the deployed sync, not localhost)

**Target Platform**: AWS Lambda + Step Functions, region `eu-north-1` (read from `CDK_DEFAULT_REGION`/`AWS_REGION` via `packages/config`, never hard-coded — constitution Article III, ADR from `docs/architecture-constitution.md` §13)

**Project Type**: Backend batch pipeline + API read-path addition (no new UI; `apps/sync` + `apps/api` adapter), inside the existing Turborepo monorepo

**Performance Goals**: Sync duration ≤ 5 min end to end for an A-03-sized (sample) run, ≤ 30 min for the full county (NFR-001, ARD-B §10); API search path latency targets belong to B-03, not this story, but the index this story builds must support them (DuckDB over Parquet, ADR-01)

**Constraints**: Gateway politeness — concurrency 2–3 (deployed: 3, within the Operations row's range below), ≤ 30 requests/min per gateway, backoff + jitter, ≤ 5 retries before switching gateway (NFR-002); zero rows without provenance; index fidelity — property count = manifest `coverage.parcels_published`, rejects ≤ 0.1% (0 for the sample); idempotent re-run — zero new S3 objects on a repeat of the same manifest CID (AC-4); cost gate — hold promotion above $1.00 predicted spend / 600,000 documents / 2 GB (ADR-05)

**Scale/Scope**: Sample manifest: 35 roofing rows (Austin permits, September 2026). Full county (deferred to the later "S · Data switch" step, not built here): Travis County TCAD roll, 493,246 accounts (A-01 measurement); this story's code is written so the full-county switch is a `DATA_MANIFEST_CID` config change, never a code change.

## Kit Agent Ownership *(mandatory, constitution XIII–XVII)*

Copied from `stories/B-02-lead-index.md` front matter and `specs/002-lead-index/agent-design.md`.

| Role | Agent(s) | Skills loaded | What it decided (cite agent-design.md) |
|------|----------|---------------|----------------------------------------|
| Design consult | `alakazam`, `espeon`, `machamp` | `build-local-rag-pocs`, `build-rag-systems`, `build-batch-workflows`, `unify-metrics`, `use-elephant-mcp` + `apply-engineering-guidelines` | alakazam: `packages/index-schema`, the `LeadIndex` port over DuckDB/Parquet with a per-sandbox, per-manifest `/tmp` cache (not per-request), and a digest guard that is a real byte comparison, never a comment. espeon: the `Plan → FetchPart → BuildIndex → Validate → Promote` pipeline, the local query-only CLI prototype, atomic `META#index` promotion via a run-id-guarded conditional write. machamp: `FetchPart`'s token-bucket gateway policy, content-addressed idempotency key (`sha256(manifestCid + partPath)`), DLQ + self-resolving alarm, and the cost gate sized from the manifest's declared byte size (not a live HEAD request). All three converge: no disagreement blocks B2 (see agent-design.md's Disagreements table). |
| Builder | `espeon` (index: `Plan`/`BuildIndex`/`Validate`/`Promote`, `crm_property`/`crm_permit` schema) + `machamp` (sync/batch: `FetchPart`'s queue, DLQ, backoff, idempotency, cost gate) | `build-local-rag-pocs`, `build-rag-systems` (espeon); `build-batch-workflows`, `unify-metrics` (machamp) + `apply-engineering-guidelines` | Patterns below |
| Reviewer(s) | `espeon`, `alakazam`, `machamp`, `porygon`, `donphan` | — | espeon/alakazam/machamp: their own patterns followed; `porygon`: index count = Oracle count reconciliation; `donphan`: independent count confirmation through the Oracle MCP |
| Verify | index doc count = Oracle `v_property` count (checked by `donphan` through the Oracle MCP), ± documented difference | — | Proven on the deployed Step Functions execution in `eu-north-1`, not local |

**Patterns the code must show** (from the builders' answers):
- Prototype-to-production migration: `scripts/local-rag-poc/query.ts` (local, query-only, proven first) → `infra/lib/crm-sync-stack.ts` + `apps/sync/handlers/*.ts` (production)
- Index provenance: every row in `packages/index-schema`'s `crm_property`/`crm_permit` Zod schema carries `sourceManifestCid`
- Idempotent batch: `apps/sync/handlers/fetchPart.ts` — content-addressed S3 keys (`sha256(manifestCid + partPath)`), `If-None-Match` writes, Step Functions execution name = manifest CID
- Throttling + DLQ + alarm: `packages/config/gatewayPolicy.ts` (token-bucket, ≤30 req/min, backoff+jitter) + an SQS DLQ with one self-resolving CloudWatch alarm
- Cost control: `apps/sync/handlers/costGate.ts` inside `Plan`, sized from the manifest's declared byte size
- Vendor, never re-implement (ADR-07): `packages/oracle-contract`, `packages/oracle-views` — literal copies with a source-commit header, digest-checked against `profiles[].sha256` in `Plan`, holding (not failing) the sync on drift
- No OpenSearch, ever (ADR-01): the only query surface is `apps/api/src/adapters/duckDbParquet.ts` implementing the `LeadIndex` port over S3 Parquet, cached in `/tmp` per sandbox per manifest

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design. Mark each ✅ / ❌ / N/A; every ❌ needs a row in Complexity Tracking.*

| # | Article | Check for this plan | Status |
|---|---------|---------------------|--------|
| I | Outcome first | AC-1 and AC-4 are proven on the deployed Step Functions execution in `eu-north-1` (execution ARN, CloudWatch logs, S3 listing before/after a repeat run), never localhost. The local DuckDB prototype is a cheap-iteration step only (build-local-rag-pocs), never itself evidence. | ✅ |
| II–IV | Stack | TypeScript throughout (`apps/sync` handlers, CDK). Region read from `packages/config` (`CDK_DEFAULT_REGION`/`AWS_REGION`), validated against the `eu-north-1` allow-list, never hard-coded (ADR, §13). Turborepo layout: new `apps/sync`, extends `packages/index-schema` (new), `packages/oracle-contract`/`oracle-views` (new, vendored), reuses the one `packages/api-client`. Every resource tagged `project_name=roofing-crm` per existing CDK convention. | ✅ |
| V–VI | Contracts and LLM | Every manifest, part, and `SyncReport` is Zod-validated before promotion (constitution Article V, architecture-constitution.md §6). No LLM calls in this story — N/A for Article VI. | ✅ (VI: N/A) |
| VII–IX | Operations | `FetchPart` is the queued external boundary: bounded concurrency (2–3), ≤30 req/min per gateway, backoff+jitter on 429/5xx, an SQS DLQ with one self-resolving CloudWatch alarm (constitution Article VII, ARD-B §8). Every Lambda uses Powertools Logger/Tracer/Metrics with X-Ray (Article VIII). Alerting via SNS (the recorded ADR-B deviation from PagerDuty, §13) — a documented substitute, not a gap. | ✅ |
| X | Quality gates | Vitest unit/contract tests first (tests first, Article XXI); no Playwright here (no UI; this story's "hosted runtime" proof is the deployed Step Functions execution, not a browser). Lint/tsc/format in the existing CI pipeline (`justfile`/`.github/workflows/ci.yml`, the recorded ADR-B deviation from the shared caller workflows, §13). | ✅ |
| XI | Data honesty | Every row carries `sourceManifestCid`, `cid`, `captured_at`, `run_id`. A null field always carries its exact published `missing` reason (AC-3/FR-003) — never guessed or interpolated. BBB/owner-name rules are out of scope for this story (no UI, no owner field indexed — ADR-03 applies vacuously since this story never indexes owner name at all). | ✅ |
| XII | Secrets | No secrets in git, logs, or this plan. Any pinned-CID SSM parameter or AWS credential stays in SSM/Secrets Manager, never in code or CDK context. | ✅ |
| XIII–XV | Owner agents | Kit Agent Ownership section above filled from the story front matter; `specs/002-lead-index/agent-design.md` exists with all three design consults recorded word for word; builder patterns listed above map to concrete file paths. | ✅ |
| XVI | Owner review | Reviewers `espeon`, `alakazam`, `machamp`, `porygon`, `donphan` plus `/code-review medium` score the branch in `docs/reviews/CR-B-02.md`; the 75-point threshold blocks merge until fixed or justified there (Phase E). | ✅ (planned, not yet executed) |
| XVIII–XXIII | Delivery | G4 passed; both meaning-affecting findings resolved at the Round 1 stop (2026-10-23): AC-2 tightened to ≤0.1% (constitution §10's index-fidelity NFR); the eval-point/slicing question left as recorded (B-02 is the shared data foundation under B2/B3/B6, not a vertical slice itself). G5/G6 pre-checks ran, FAILed, and were fixed (see tasks.md's Revision history, testplans/B-02-test-cases.md). Tests written and shown failing first (Article XXI). Branch is `002-lead-index` (constitution Article XX's `NNN-slug` form). Any hosted test failure gets a `docs/defects/ERR-{n}.md` record (Article XXIII). | ✅ |
| Addendum | Task B (B1–B3) | B1: data comes only from Task A's published CIDs (CloudFront/Filebase/Pinata) or its MCP (donphan, cross-check only) — no scraping, no ingestion, no Query DB/bucket/SSM access (hard P0, architecture-constitution.md §12.1). B2: this story's output (the index) is read-only infrastructure for leads, not the lead store itself — `crm-leads` DynamoDB table (B-07) is untouched here except for the shared `META#index` pointer item. B3: N/A — no agent in this story. | ✅ (B2: N/A beyond the pointer item) |

## Project Structure

### Documentation (this feature)

```text
specs/002-lead-index/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
├── agent-design.md      # Phase "Agents design" output (already written)
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/sync/                          # NEW — the Step Functions sync pipeline (espeon + machamp)
├── handlers/
│   ├── plan.ts                     # Plan: pinned manifest CID, profiles[].sha256 digest guard, cost gate
│   ├── fetchPart.ts                # FetchPart: CID fetch + sha256 verify, CloudFront→Filebase→Pinata
│   ├── buildIndex.ts               # BuildIndex: writes crm_property/crm_permit Parquet (local, network-free)
│   ├── validate.ts                 # Validate: count reconciliation, ≤5% drop gate, 0-rows-without-provenance
│   └── promote.ts                  # Promote: atomic META#index pointer flip (DynamoDB conditional write)
├── test/                           # Vitest unit/contract tests, written first
└── package.json

scripts/local-rag-poc/
└── query.ts                        # NEW — espeon's local, query-only CLI over contract/v1/sample.parquet
                                     # (build-local-rag-pocs discipline; proven before any AWS resource)

packages/index-schema/              # NEW — Zod + TS: crm_property, crm_permit, index_meta, Provenanced<T>
├── src/index.ts
└── test/

packages/oracle-contract/           # NEW — vendored, pinned copy of Task A's packages/contract (ADR-07)
packages/oracle-views/              # NEW — vendored, pinned copy of Task A's packages/query-core (ADR-07)
                                     # each with a source-commit header; digest-checked in apps/sync/handlers/plan.ts

packages/config/src/index.ts        # EXTEND — add DATA_MANIFEST_CID (Zod-validated, never a constant)

apps/api/src/adapters/
└── duckDbParquet.ts                # NEW — implements the LeadIndex port over S3 Parquet via DuckDB,
                                     # /tmp-cached per sandbox per manifest (ADR-01's whole cost argument,
                                     # must be explicit in code, not just a comment)

infra/lib/crm-sync-stack.ts         # FILL IN — currently an intentional empty stub (T005, B-01) for this story
infra/lib/crm-data-stack.ts         # FILL IN — currently an intentional empty stub (T005, B-01) for the S3 bucket
                                     # (crm-leads DynamoDB table for the META#index pointer item already exists
                                     # from B-01/CrmOps per architecture-constitution.md §9 — no new table)

tests/e2e/manifest.spec.ts          # COPIED from Task A (A-03), per WALKTHROUGH-B-sample-first.md §3 reuse table
tests/e2e/cid-copy.spec.ts          # COPIED from Task A
tests/e2e/fallback.spec.ts          # COPIED from Task A
tests/e2e/verify-manifest.spec.ts   # COPIED from Task A
apps/api/test/query.test.ts         # COPIED from Task A (adapted to this project's LeadIndex port)
apps/api/test/duckdb-node.test.ts   # COPIED from Task A
```

**Structure Decision**: Backend-only addition to the existing monorepo (no new "frontend"/"backend" split — this story has `ui: false`). One new app (`apps/sync`), three new packages (`index-schema`, `oracle-contract`, `oracle-views`), one extended package (`config`), one new adapter in the existing `apps/api`, and two previously-stubbed CDK stacks (`CrmSync`, `CrmData`) filled in. `CrmOps`'s existing DynamoDB table is reused for the `META#index` pointer item — no new table, per architecture-constitution.md §9's module-boundary table.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| G4 (XVIII–XXIII), resolved at Round 1 (2026-10-23) | Two G4 pre-check findings (AC-2's testability wording re: sample-vs-full-county scope; the eval-point/slicing primary-point question) would have changed what an AC means if resolved unilaterally, so they were held for a consolidated Round 1 `AskUserQuestion` rather than guessed mid-pipeline. The user tightened AC-2 to ≤0.1% (matching constitution §10) and confirmed the eval-point recording needs no change. | This row is kept for traceability (not deleted) to show the deviation was deliberate and user-resolved, not silently dropped — per constitution Governance's "A plan that breaks an article either changes or records a justification ... which you approve." |
| G5 C-02: `tasks.md`'s Phase 3/4 are grouped by builder (INDEX/SYNC), not strict priority order | The story's own front matter names exactly two builders (`espeon`, `machamp`); the run script explicitly directs "Exactly two groups ... one build wave" (constitution XV: one subagent per group). | A strict-priority restructure would split each builder's work across multiple phases, defeating the one-subagent-per-group delegation, or force an unneeded sequential INDEX-then-SYNC build — `agent-design.md`'s consults converge that `BuildIndex` and `FetchPart` are architecturally independent, so sequencing them would add wall-clock time for no correctness benefit. |
| G5 C-05: Phase Z is not split into `TZ01`–`TZ06` IDs, and does not include the review round or close-out docs as tasks | `tasks.md`'s stated scope (see its header) is the build wave (Phases 1–5, Z); Phase E (review: `espeon`/`alakazam`/`machamp`/`porygon`/`donphan` + `/code-review medium` → `CR-B-02.md`) and Phase F (close-out: G7, merge, `docs/traceability.md`/`docs/kit-usage.md`, `scripts/progress.sh`) are the walkthrough's own run-book stages (§3, Phase E/F), run directly against this file's completed tasks. | Duplicating the review/close-out steps as `tasks.md` entries would create two sources of truth for the same gate (the walkthrough's Progress checklist already tracks them) and risks the two drifting out of sync under this story's cost-mode time pressure. |
| G5 C-08: `plan.md`'s builder patterns list does not separately name "historical backfill" or "refresh" (espeon's constitution-roster patterns) | This story is a fresh, sample-first build against Task A's already-published A-03 slice, not a backfill of previously-indexed history. "Refresh" is realized by `Promote`'s re-run-safe design (T021/T022 in tasks.md): re-running the sync against a newer manifest CID is the refresh path, already covered by AC-4's idempotency proof plus `Validate`'s lineage/staleness checks (ADR-05) — it does not need a separately named task. | Adding a standalone "backfill" task would be invented work: there is no prior CRM-owned index to backfill from: this is run 1. |
| T004 (`scripts/local-rag-poc/query.ts`) imports vendored `packages/oracle-views`, which architecture-constitution.md §9 scopes to `apps/sync` and the agent's place resolver only | `espeon`'s own `build-local-rag-pocs` discipline (and this story's explicit rule 5) requires a local, query-only prototype against real vendored data, proven before any AWS resource exists — it cannot prove anything meaningful against invented data. | Scoping the vendored package strictly to `apps/sync` would force the prototype to either duplicate `query-core`'s binding logic (violating ADR-07's "never re-implement") or skip the prototype step entirely (violating the story's own required discipline). The deviation is narrow: a standalone, non-deployed dev script, never shipped or run in production. |
