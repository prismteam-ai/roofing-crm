---
id: ERR-7
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-NF-04
ac_reference: B-07-AC-3
severity: Medium
status: Closed
found_by: Claude (Playwright on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 9c25cb4
retest_date: 2026-10-24
---

# ERR-7: Lead detail – Status select does not use Atlas tokens

## Brief description

The Status dropdown on the lead page used the browser's default grey border instead of an Atlas token.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-3 · **Requirement:** FR-003 · **Test case:** B-07-TC-NF-04

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `9c25cb4` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Open a lead detail page and run the token audit (TC-NF-04).

## Expected result

Colour, font, spacing and radius come from Atlas tokens only.

## Actual result

32 audited properties used browser defaults (for example `border-top-color: rgb(118, 118, 118)`).

## Impact and severity

- **Impact:** Breaks the constitution rule "UI uses only Atlas tokens".
- **Severity:** Medium.

## Suggested investigation area

apps/web/src/routes/Leads/Leads.module.css.

## Evidence

- Playwright run on the hosted URL, `tests/e2e/B-07.spec.ts`; see `docs/evidence/B-07.md`.
- `specs/007-leads/run-log.md` records how and when it was found.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The select had no style class; the textarea next to it did. |
| Fix | `9c25cb4` on `007-leads`: Added a `.select` class built from the same tokens as the textarea. TC-NF-04 passes at 390, 768 and 1440. |
| Re-test | B-07-TC-NF-04 PASS on 2026-10-24 (hosted, 3 viewports) |
| Status | ☑ Closed ☐ Reopened |
