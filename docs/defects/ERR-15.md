---
id: ERR-15
type: defect
feature: FEAT-B03
story: B-03
test_case: B-03-TC-NF-01
ac_reference: B-03-AC-3
severity: High
status: Closed
found_by: Claude (Playwright and CI on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 1c8d151
retest_date: 2026-10-24
---

# ERR-15: CI hosted job red – a copied Oracle vitals spec cannot load

## Brief description

The hosted Playwright job failed before running any test: `Cannot find package '@countylens/shared' imported from tests/e2e/A-13-vitals.spec.ts`.

## Related requirement

- **Story:** B-03 · **AC:** B-03-AC-3 · **Test case:** B-03-TC-NF-01

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `1c8d151` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Push any branch; open the hosted Playwright job.

## Expected result

The job runs this repository's specs.

## Actual result

The job aborted on the import error.

## Impact and severity

- **Impact:** CI red; no hosted test ran.
- **Severity:** High.

## Suggested investigation area

tests/e2e/A-13-vitals.spec.ts.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | `A-13-vitals.spec.ts` came from the Oracle repo with B-03's copy step. It targets Oracle explorer pages (`/runs/log`, `/explore`, legal pages) that the CRM does not have, and it imports a package and helper files (`a13-*`) that do not exist here. |
| Fix | `1c8d151` on `007-leads`: The spec was removed (it could never run in this repo). Review finding 5 in `docs/reviews/CR-B-07.md` accepts this. |
| Re-test | Hosted CI job passes 74 tests, then (with the password) the full suite (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
