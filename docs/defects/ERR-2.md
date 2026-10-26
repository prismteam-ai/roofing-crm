---
id: ERR-2
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-001
ac_reference: B-07-AC-1
severity: Critical
status: Closed
found_by: Claude (Playwright on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 0f1a7a1
retest_date: 2026-10-24
---

# ERR-2: Lead index pointer – every lead call fails with HTTP 500 on the new table

## Brief description

Every request that read the current-run pointer returned HTTP 500: `ValidationException: The provided key element does not match the schema`.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-1 · **Requirement:** FR-001 · **Test case:** B-07-TC-001

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `0f1a7a1` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Deploy `CrmData`, then call any procedure that reads the index (`property.get`).

## Expected result

The pointer is read and the property is returned.

## Actual result

HTTP 500 from `property.get`; CloudWatch: `LeadIndex.indexInfo` ValidationException.

## Impact and severity

- **Impact:** Blocks the whole story: no lead can be created or listed.
- **Severity:** Critical.

## Suggested investigation area

apps/sync/handlers/promote.ts, validate.ts; apps/api/src/adapters/duckDbParquet.ts.

## Evidence

- Playwright run on the hosted URL, `tests/e2e/B-07.spec.ts`; see `docs/evidence/B-07.md`.
- `specs/007-leads/run-log.md` records how and when it was found.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | B-02's promote, validate and API reader addressed the pointer item `META#index` with the key `{pk}` only. The `crm-leads` table has a `pk` + `sk` key. B-02 had never run against a real `crm-leads` table (its T042 was blocked on it). |
| Fix | `0f1a7a1` on `007-leads`: All three sites now use `{ pk: "META#index", sk: "META" }`. A key-shape test added in each of the three suites. |
| Re-test | B-07-TC-001 PASS on 2026-10-24 (hosted, 3 viewports) |
| Status | ☑ Closed ☐ Reopened |
