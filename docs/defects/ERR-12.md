---
id: ERR-12
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-007
ac_reference: B-07-AC-2
severity: Low
status: Closed
found_by: Claude (Playwright and CI on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 4ee8e45
retest_date: 2026-10-24
---

# ERR-12: e2e concurrency check – a failed DNS lookup under 20 simultaneous requests failed the test

## Brief description

TC-007 once failed with `getaddrinfo ENOTFOUND` on a host that resolved a moment earlier.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-2 · **Test case:** B-07-TC-007

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `4ee8e45` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Run TC-007 (20 concurrent creates).

## Expected result

1 created, 19 "Already a lead".

## Actual result

`Error: apiRequestContext.post: getaddrinfo ENOTFOUND`, and the 12 later cases did not run.

## Impact and severity

- **Impact:** A false failure and a stopped run.
- **Severity:** Low.

## Suggested investigation area

tests/e2e/B-07.spec.ts TC-007.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The 20 simultaneous requests made the developer machine's DNS drop a lookup. The request never reached the server, so it is not an API answer. |
| Fix | `4ee8e45` on `007-leads`: A failed lookup is retried (it cannot duplicate anything, and the server dedupes anyway) and counted as `dnsRetried` in the output. |
| Re-test | TC-007 passed in every later run (1 created, 19 refused) (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
