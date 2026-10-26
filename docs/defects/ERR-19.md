---
id: ERR-19
type: defect
feature: FEAT-B01
story: B-01
test_case: B-01-TC-NF-04
ac_reference: B-01-AC-1
severity: Medium
status: Closed
found_by: Claude (Playwright and CI on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 46259f5
retest_date: 2026-10-24
---

# ERR-19: e2e token audit – CI caught the nav pill mid-fade

## Brief description

`responsive/coming-soon.spec.ts` token audit failed in CI on mobile and desktop with `span._pill` `background-color: rgba(211, 227, 253, 0)` (and 0.592).

## Related requirement

- **Story:** B-01 · **AC:** B-01-AC-1 · **Test case:** B-01-TC-NF-04

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `46259f5` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Run the responsive specs on CI.

## Expected result

Every audited value is an Atlas token value.

## Actual result

A violation on the nav pill (mid-fade alpha).

## Impact and severity

- **Impact:** CI red on a design check that is correct in the product.
- **Severity:** Medium.

## Suggested investigation area

tests/e2e/lib/atlas-tokens.ts.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The audit read computed colours while a CSS transition was running. A half-faded Atlas colour is not a token value. A slower browser catches this more often than a fast laptop. |
| Fix | `46259f5` on `007-leads`: The shared audit switches transitions off for the moment of measuring, so every value is its settled one. Fixes every screen that uses it. |
| Re-test | Responsive audits pass in CI (run 40083662207) and locally (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
