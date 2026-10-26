---
id: ERR-3
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-001
ac_reference: B-07-NFR-001
severity: High
status: Closed
found_by: Claude (Playwright on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 1a02b12
retest_date: 2026-10-24
---

# ERR-3: Sync promote – first-ever promotion fails

## Brief description

The first `crm-sync` run on the new table reached Promote and failed: `The provided expression refers to an attribute that does not exist in the item`.

## Related requirement

- **Story:** B-07 · **AC:** B-07-NFR-001 · **Requirement:** FR-001 · **Test case:** B-07-TC-001

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `1a02b12` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Start `crm-sync` against the sample manifest on an empty `crm-leads` table.

## Expected result

The run SUCCEEDS and `META#index.current` is the sample manifest.

## Actual result

Execution `…-b07-1` FAILED at Promote.

## Impact and severity

- **Impact:** No run can ever be promoted on a fresh table, so no property data is served.
- **Severity:** High.

## Suggested investigation area

apps/sync/handlers/promote.ts UpdateExpression.

## Evidence

- Playwright run on the hosted URL, `tests/e2e/B-07.spec.ts`; see `docs/evidence/B-07.md`.
- `specs/007-leads/run-log.md` records how and when it was found.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The update expression `SET #previous = #current` reads `#current`, which does not exist on the first promotion. |
| Fix | `1a02b12` on `007-leads`: `#previous = if_not_exists(#current, :noPrevious)` with `:noPrevious` null. Test added first (failed, then passed). Re-run `…-b07-2` SUCCEEDED in 6.0 s: 14 properties, 35 permits. |
| Re-test | B-07-TC-001 PASS on 2026-10-24 (hosted, 3 viewports) |
| Status | ☑ Closed ☐ Reopened |
