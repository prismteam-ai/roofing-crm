---
id: ERR-8
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-003
ac_reference: B-07-AC-1
severity: High
status: Closed
found_by: Claude (Playwright on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 67234b1
retest_date: 2026-10-24
---

# ERR-8: Lead create – the permit is missing from the signals snapshot

## Brief description

A lead created from a property with an open permit stored only the roof age. The story requires the snapshot to hold roof age, permit id and contractor.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-1 · **Requirement:** FR-001 · **Test case:** B-07-TC-003

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `67234b1` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Create a lead on the property with an open permit (2026-119890 BP, open 28 days) and open the lead.

## Expected result

The snapshot shows the open permit id and its open days.

## Actual result

The snapshot showed no permit.

## Impact and severity

- **Impact:** AC-1 only half true; TC-003 could not assert the permit id.
- **Severity:** High.

## Suggested investigation area

apps/web/src/routes/Leads/LeadCreateAction.tsx; PropertyDetail.tsx.

## Evidence

- Playwright run on the hosted URL, `tests/e2e/B-07.spec.ts`; see `docs/evidence/B-07.md`.
- `specs/007-leads/run-log.md` records how and when it was found.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | `toCreateInput` sent `roofAgeYears` and `roofAgeBasis` only, although the schema already accepted `openPermitId` and `openDays`. |
| Fix | `67234b1` on `007-leads`: The open permit (or the permit whose row was used) is sent as `openPermitId` and `openDays`; each permit row has its own "Create lead from permit {n}". No contractor is invented. |
| Re-test | B-07-TC-003 PASS on 2026-10-24 (hosted, 3 viewports) |
| Status | ☑ Closed ☐ Reopened |
