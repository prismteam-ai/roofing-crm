---
id: ERR-1
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-005
ac_reference: B-07-AC-2
severity: High
status: Closed
found_by: Claude (Playwright on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: dabca22
retest_date: 2026-10-24
---

# ERR-1: Lead create – a duplicate shows a generic error instead of "Already a lead"

## Brief description

Create a lead for a property that already has one. The API returned the right conflict, but the browser showed "Lead could not be created" instead of "Already a lead".

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-2 · **Requirement:** FR-002 · **Test case:** B-07-TC-005

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `dabca22` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

On the sample, create a lead from the drawer of a property that already has a lead.

## Expected result

The drawer shows "Already a lead" with a link to the existing lead.

## Actual result

A generic "Lead could not be created" banner.

## Impact and severity

- **Impact:** Demo line D-6 second step and AC-2 would show a failure message for an expected outcome.
- **Severity:** High.

## Suggested investigation area

apps/api/src/trpc.ts errorFormatter; apps/web/src/routes/Leads/LeadCreateAction.tsx.

## Evidence

- Playwright run on the hosted URL, `tests/e2e/B-07.spec.ts`; see `docs/evidence/B-07.md`.
- `specs/007-leads/run-log.md` records how and when it was found.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The API used tRPC's default error format, which drops `cause`, so the domain code `ALREADY_EXISTS` never reached the browser. The web unit test had mocked an error shape the API never sends, so it passed. |
| Fix | `dabca22` on `007-leads`: Added `errorFormatter` + `withAppCode` (copies a string `cause.code` into `data.appCode`); the client reads `data.appCode`. Unit tests added for both sides. |
| Re-test | B-07-TC-005 PASS on 2026-10-24 (hosted, 3 viewports) |
| Status | ☑ Closed ☐ Reopened |
