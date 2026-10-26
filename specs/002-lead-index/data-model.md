# Phase 1 data model: B-02 lead search index

Source fields are Task A's `contract/v1` (`packages/contract/src/columns.ts`, vendored read-only into `packages/oracle-contract` per ADR-07 — never redefined here). This file defines only the CRM's own index row shapes (`packages/index-schema`), which are a provenance-carrying, query-optimized projection of the source, not a re-derivation.

## `crm_property` (from Task A's `v_property`)

| Field | Type | Source | Notes |
| --- | --- | --- | --- |
| `propertyCid` | CID string | `v_property.property_cid` | Join key, carried verbatim |
| `requestIdentifier` | string | `v_property.request_identifier` | TCAD pID as printed; identity key material for B-07, not used here |
| `latitude`, `longitude` | double, nullable | `v_property.latitude`/`longitude` | Missing reason `no_coordinates` preserved when null |
| `coordinateSource` | enum | `v_property.coordinate_source` | Carried verbatim |
| `propertyType`, `propertyUsageType` | string, nullable | `v_property.property_type`/`property_usage_type` | Missing reason `source_missing` when null |
| `roofAgeYears` | integer, nullable | `v_property.roof_age_years` | Missing reason `no_roof_date` when null — **never guessed** (AC-3/FR-003) |
| `roofAgeBasis`, `roofAgeConfidence` | enum | `v_property.roof_age_basis`/`roof_age_confidence` | Carried verbatim, including the `missing` value itself |
| `isLongTenure`, `ownerKind`, `ownerAreaClass`, `ownerIsOutOfArea` | mixed, nullable | `v_property.*` | **`owner_name` is never copied into this index** — ADR-03, enforced at the schema level (no field for it exists) |
| `sourceManifestCid` | CID string | the sync run's manifest CID | Required on every row (AC-1/FR-001); this is the field every later story's "Now · Run n" and provenance display reads |
| `missingReasons` | `Missing[]` | `v_property`'s own provenance columns | Carried verbatim — the exact source reason list, never summarized or replaced |
| `capturedAt`, `cid`, `runId` | provenance | `v_property`'s own provenance columns | Carried verbatim per architecture-constitution.md §7 |

## `crm_permit` (from Task A's `v_roofing_permit`)

| Field | Type | Source | Notes |
| --- | --- | --- | --- |
| `propertyCid` | CID string | `v_roofing_permit.property_cid` | Join key back to `crm_property` |
| `permitCid` | CID string | `v_roofing_permit.cid` | Row identity |
| `jurisdiction` | string, nullable | `v_roofing_permit.jurisdiction` | Missing reason `needs_review` when null |
| `permitNumber` | string, nullable | `v_roofing_permit.permit_number` | Missing reason `source_missing` when null |
| `improvementType`, `improvementAction` | string | `v_roofing_permit.improvement_type`/`improvement_action` | Carried verbatim |
| `improvementStatus`, `statusClass` | string/enum, nullable | `v_roofing_permit.improvement_status`/`status_class` | Missing reason `enum_lacks_value`/`needs_review`; **a null `improvement_status` permit is "stalled", never "open"** (constitution P0-4 — enforced by the vendored `query-core` derivation this story calls, not re-derived here) |
| `issueDate`, `finalDate`, `permitCloseDate`, `finalInspectionDate` | date, nullable | `v_roofing_permit.*` | Missing reasons `source_missing`/`not_closed` as published |
| `openDays` | integer, nullable | `v_roofing_permit.open_days` | Missing reason `not_open` when null; this is the sort key for "long-open" in B-03/D-4 |
| `contractorResolution`, `contractorCompanyCid` | enum/CID, nullable | `v_roofing_permit.*` | Carried verbatim |
| `sourceManifestCid` | CID string | the sync run's manifest CID | Required on every row |
| `missingReasons`, `capturedAt`, `cid`, `runId` | provenance | `v_roofing_permit`'s own provenance columns | Carried verbatim |

## `index_meta` (the CRM's own record, not from Task A)

| Field | Type | Notes |
| --- | --- | --- |
| `manifestCid` | CID string | The run this metadata describes |
| `status` | enum: `Validating` \| `Validated` \| `Held` \| `Promoted` \| `Quarantined` | State machine mirrors architecture-constitution.md §2.3's `Plan → FetchPart → BuildIndex → Validate → Promote` diagram |
| `propertyCount`, `permitCount` | integer | Written by `Validate`, compared against the manifest's `coverage.parcels_published` |
| `reconcileDiff` | integer, nullable | Set when the count doesn't match exactly; drives AC-2's "or every difference is written to `docs/evidence/B-02.md`" path |
| `heldReason` | enum, nullable | e.g. `lineage_fork`, `stale_finished_at`, `cost_gate_exceeded`, `drop_over_5_percent`, `digest_mismatch` (ADR-05, ADR-07) |
| `finishedAt` | timestamp | From the manifest, used for lineage/staleness checks |

## `META#index` pointer (reuses the existing `crm-leads` DynamoDB table — no new table)

| Field | Type | Notes |
| --- | --- | --- |
| `pk` | `"META#index"` | Fixed partition key |
| `current` | CID string | The manifest CID currently served; flipped only by `Promote`, by a conditional write guarded on the previous value (atomic, never partial — P0-3) |
| `previous` | CID string, nullable | Enables the one-write rollback described in architecture-constitution.md §11 |

## State transitions (`index_meta.status`)

```text
[*] → Validating   (BuildIndex writes crm_property/crm_permit; FetchPart's parts all verified)
Validating → Validated  (counts reconcile within tolerance; 0 rows without provenance)
Validating → Held       (unexplained reconcile diff, drop > 5%, cost gate exceeded, lineage fork, or digest mismatch)
Validated → Promoted    (META#index.current flips atomically)
Held → [*]              (current run keeps serving; an operator resolves the hold)
```

## Validation rules carried from the spec/story (not re-stated as new rules)

- Every `crm_property`/`crm_permit` row MUST carry `sourceManifestCid` — zero rows without provenance (FR-001, constitution P0-3).
- A null field MUST carry its exact published `missing` reason — never invented (FR-003, constitution P0-4).
- A re-run of an already-indexed `manifestCid` MUST create zero new S3 objects (FR-004).
- `propertyCount` MUST equal the manifest's `coverage.parcels_published` exactly, or differ by at most 0.1% with the difference documented (FR-002, Round 1 decision 2026-10-23, tightened to match constitution §10's index-fidelity NFR) — a larger or undocumented difference is a `Held` run, never a silent pass.
