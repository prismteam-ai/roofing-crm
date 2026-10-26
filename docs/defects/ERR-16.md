---
id: ERR-16
type: defect
feature: FEAT-B02
story: B-02
test_case: B-02-TC-NF-01
ac_reference: B-02-AC-1
severity: Medium
status: Closed
found_by: Claude (Playwright and CI on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 1c8d151
retest_date: 2026-10-24
---

# ERR-16: Unit test flake – the cold-load race test slept a fixed 50 ms

## Brief description

`duckDbParquet.test.ts` "discards a timed-out cold load's connection…" failed on the slower CI machine.

## Related requirement

- **Story:** B-02 · **AC:** B-02-AC-1 · **Test case:** B-02-TC-NF-01

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `1c8d151` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Run the unit tests on CI.

## Expected result

The stale connection is closed and the test passes.

## Actual result

1 failed of 108 on CI.

## Impact and severity

- **Impact:** CI red on unit tests.
- **Severity:** Medium.

## Suggested investigation area

apps/api/test/duckDbParquet.test.ts.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | After releasing the abandoned load, the test slept 50 ms and then expected the stale connection to have closed. A loaded machine needs longer. |
| Fix | `1c8d151` on `007-leads`: The test polls (`vi.waitFor`, up to 3 s) until the stale connection is closed. |
| Re-test | 5 of 5 repeat local runs; CI workspace job green (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
