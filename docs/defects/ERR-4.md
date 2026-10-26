---
id: ERR-4
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-007
ac_reference: B-07-AC-2
severity: High
status: Closed
found_by: Claude (Playwright on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 7eb800d
retest_date: 2026-10-24
---

# ERR-4: Lead create – concurrent duplicates return HTTP 500 for some callers

## Brief description

With 20 simultaneous creates for one property, 5 of the 19 losing requests returned HTTP 500 `Transaction cancelled [TransactionConflict]` instead of "Already a lead".

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-2 · **Requirement:** FR-002 · **Test case:** B-07-TC-007

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `7eb800d` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Fire 20 simultaneous `leads.create` calls for one property (TC-007).

## Expected result

Exactly 1 call succeeds and 19 return "Already a lead" (HTTP 409).

## Actual result

1 success, 11 x 409, 5 x 500 TransactionConflict, 3 x 503 (Lambda throttle).

## Impact and severity

- **Impact:** NFR-001 (duplicate refused 100% including 20 concurrent creates) was not met for the user-visible answer. No duplicate row was ever written.
- **Severity:** High.

## Suggested investigation area

apps/api/src/adapters/leadRepo.ts create and append.

## Evidence

- Playwright run on the hosted URL, `tests/e2e/B-07.spec.ts`; see `docs/evidence/B-07.md`.
- `specs/007-leads/run-log.md` records how and when it was found.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | DynamoDB cancels a transaction with `TransactionConflict` when another in-flight transaction touches the same item, before any condition is evaluated. The code mapped only `ConditionalCheckFailed` to the friendly answer. |
| Fix | `7eb800d` on `007-leads`: A bounded, jittered retry (6 attempts) on `TransactionConflict` for create, status change and note. Three unit tests added first. TC-007 now: 1 created, 19 "Already a lead". |
| Re-test | B-07-TC-007 PASS on 2026-10-24 (hosted, 3 viewports) |
| Status | ☑ Closed ☐ Reopened |
