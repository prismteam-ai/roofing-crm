---
id: ERR-14
type: defect
feature: FEAT-B01
story: B-01
test_case: B-01-TC-004
ac_reference: B-01-AC-3
severity: High
status: Closed
found_by: Claude (Playwright and CI on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 734da50
retest_date: 2026-10-24
---

# ERR-14: CI hosted job red – the lockout e2e locks the shared admin account and CI cannot unlock it

## Brief description

The hosted Playwright job in CI failed on B-01's lockout test: attempt 1 already showed "Too many attempts".

## Related requirement

- **Story:** B-01 · **AC:** B-01-AC-3 · **Test case:** B-01-TC-004

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `734da50` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Run CI on two pushes within five minutes.

## Expected result

The 4th wrong password shows the lockout message; the next run starts clean.

## Actual result

"Too many attempts — try again in 5 minutes" on attempt 1.

## Impact and severity

- **Impact:** CI red on every push since B-01, hiding every other result.
- **Severity:** High.

## Suggested investigation area

tests/e2e/B-01.spec.ts AC-3.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The test genuinely locks the one shared, real admin account for five minutes. Its cleanup deletes the counter from DynamoDB, which CI cannot do (no AWS region or credentials: "Region is missing"), so the lock persisted into the next run. Recorded earlier in the B-01 evidence as a recurring flake. |
| Fix | `734da50` on `007-leads`: The lockout counter is keyed by the username string and the failures are reported by the client, so the test now locks a throwaway username unique to each run and never touches the shared account. The reset helper was removed. |
| Re-test | B-01 desktop 9 of 9 twice in a row; CI hosted job green on the final commit (run 40083662207) (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
