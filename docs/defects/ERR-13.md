---
id: ERR-13
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-NF-01
ac_reference: B-07-AC-1
severity: Low
status: Closed
found_by: Claude (Playwright and CI on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 60ad4d2
retest_date: 2026-10-24
---

# ERR-13: e2e latency check – one unexplained failure after 2.7 s in a full run

## Brief description

In one full three-viewport run, TC-NF-01 failed on desktop after only 2.7 seconds, far too early to be a latency result.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-1 · **Test case:** B-07-TC-NF-01

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `60ad4d2` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Run the full suite on 3 viewports.

## Expected result

TC-NF-01 passes.

## Actual result

A fast failure on desktop in one run.

## Impact and severity

- **Impact:** None found after the fix; recorded so it is not forgotten.
- **Severity:** Low.

## Suggested investigation area

tests/e2e/B-07.spec.ts TC-NF-01.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | Not established. It passed 6 of 6 times when run alone and in every later run. Expired temporary credentials were ruled out (they last 15 minutes). The test now reports the failing iteration and the samples so a repeat explains itself. |
| Fix | `60ad4d2` on `007-leads`: Closed as **not reproduced**: iteration reporting added; cause unproven. |
| Re-test | TC-NF-01 passed in all later runs (6 of 6 alone, and 3 viewports in each of 4 full runs) (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
