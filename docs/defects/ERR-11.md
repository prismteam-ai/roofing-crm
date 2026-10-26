---
id: ERR-11
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
fix_commit: 6e1a163
retest_date: 2026-10-24
---

# ERR-11: e2e latency check – create-to-top-of-list samples inflated in steps (p95 2214 ms in one run)

## Brief description

TC-NF-01 reported p95 values of 1206, 1207 and 2214 ms in some runs and about 600 ms in others. One run exceeded the 2000 ms target.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-1 · **Test case:** B-07-TC-NF-01

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `6e1a163` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Run TC-NF-01 (20 creates) on the hosted preview.

## Expected result

p95 at most 2000 ms, near the real latency.

## Actual result

p95 1206 to 2214 ms in some runs.

## Impact and severity

- **Impact:** A false failure of the 2 s NFR.
- **Severity:** Low.

## Suggested investigation area

tests/e2e/B-07.spec.ts TC-NF-01.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The check used `toContainText`, which rechecks on a coarse back-off schedule, so a lead that arrived just after a check was noticed one step later. The product was fast: the list API showed the new lead on the first poll, 413 to 534 ms after the create (14 of 14 trials), and the Lambda p50 / p95 / p99 were 17 / 80 / 249 ms. |
| Fix | `6e1a163` on `007-leads`: The wait polls on every animation frame (`waitForFunction`, `polling: raf`). |
| Re-test | p95 613, 590 and 591 ms on 3 viewports in the final run (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
