---
id: ERR-20
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-017
ac_reference: B-07-AC-3
severity: Medium
status: Closed
found_by: Claude (Playwright and CI on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: cbb068f
retest_date: 2026-10-24
---

# ERR-20: Lead detail – an unknown lead id shows only a generic error, not "Lead not found"

## Brief description

Opening `/leads/does-not-exist` showed the generic "This lead could not be loaded" banner and retried the lookup before giving up.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-3 · **Test case:** B-07-TC-017

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `cbb068f` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Open /leads/does-not-exist when signed in.

## Expected result

A "Lead not found" page with a link back to the list.

## Actual result

The load-error banner with Retry, after a retry.

## Impact and severity

- **Impact:** Test case TC-017 passed only with a caveat; a rep sees a misleading error.
- **Severity:** Medium.

## Suggested investigation area

apps/web/src/routes/Leads/LeadDetail.tsx, leadsApi.ts.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The detail page did not tell a missing lead from a transient failure. |
| Fix | `cbb068f` on `007-leads`: A NOT_FOUND shows "Lead not found" with "Back to leads" and is not retried; other failures keep the banner with Retry. 6 unit tests written first. |
| Re-test | B-07-TC-017 passes on 3 viewports with the original wording (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
