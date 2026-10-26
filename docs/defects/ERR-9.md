---
id: ERR-9
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-015b
ac_reference: B-07-AC-5
severity: High
status: Closed
found_by: Claude (Playwright on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 67234b1
retest_date: 2026-10-24
---

# ERR-9: Lead detail – "not in the current run" is shown for leads whose property is still in the run

## Brief description

A lead was flagged "not in the current run" whenever its captured manifest differed from the current one, even when its property is still in the new run.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-5 · **Requirement:** FR-005 · **Test case:** B-07-TC-015b

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `67234b1` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Create a lead on a property under one manifest, then serve a different manifest that still contains the property.

## Expected result

No flag; the lead shows its current values.

## Actual result

The lead is flagged and its signals withheld.

## Impact and severity

- **Impact:** After the full-county switch every sample lead would have been wrongly flagged.
- **Severity:** High.

## Suggested investigation area

packages/domain/src/leads.ts; apps/api/src/services/leads.ts.

## Evidence

- Playwright run on the hosted URL, `tests/e2e/B-07.spec.ts`; see `docs/evidence/B-07.md`.
- `specs/007-leads/run-log.md` records how and when it was found.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The rule compared manifest CIDs only. AC-5 says the flag applies when the source property is absent from a newer run. |
| Fix | `67234b1` on `007-leads`: Flag only when the manifest differs and the request identifier is absent from the current index (one batched presence query); show the real run id. Tests: TC-014, TC-015, TC-015b and five service tests. |
| Re-test | B-07-TC-015b PASS on 2026-10-24 (hosted, 3 viewports) |
| Status | ☑ Closed ☐ Reopened |
