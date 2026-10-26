---
id: ERR-5
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-NF-01
ac_reference: B-07-AC-1
severity: High
status: Closed
found_by: Claude (Playwright on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 38e6eea
retest_date: 2026-10-24
---

# ERR-5: Lead list – the newest lead is not at the top

## Brief description

With more than one lead, the list showed the oldest lead first, so a lead just created was not at the top of the list.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-1 · **Requirement:** FR-001 · **Test case:** B-07-TC-NF-01

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `38e6eea` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Create leads on three properties, then open the leads list.

## Expected result

The most recently created lead is the first row.

## Actual result

The first row was the oldest lead.

## Impact and severity

- **Impact:** AC-1 ("appears at the top of the lead list") and the 2 s p95 target could not be shown.
- **Severity:** High.

## Suggested investigation area

apps/api/src/adapters/leadRepo.ts list query.

## Evidence

- Playwright run on the hosted URL, `tests/e2e/B-07.spec.ts`; see `docs/evidence/B-07.md`.
- `specs/007-leads/run-log.md` records how and when it was found.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The assignee and status lookups queried the GSI in its natural ascending order of `createdAt`. TC-001 passed only because it ran with a single lead. |
| Fix | `38e6eea` on `007-leads`: `ScanIndexForward: false` on both lookups. Tests added first. TC-NF-01 p95 is now 727 ms. |
| Re-test | B-07-TC-NF-01 PASS on 2026-10-24 (hosted, 3 viewports) |
| Status | ☑ Closed ☐ Reopened |
