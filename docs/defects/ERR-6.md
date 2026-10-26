---
id: ERR-6
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-010
ac_reference: B-07-AC-3
severity: Medium
status: Closed
found_by: Claude (Playwright on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 07ec124
retest_date: 2026-10-24
---

# ERR-6: Lead detail – a note is shown with its storage wrapper

## Brief description

A saved note was displayed as `note: "…"` with JSON escapes, so a note with quotes or a line break showed backslashes.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-3 · **Requirement:** FR-003 · **Test case:** B-07-TC-010

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `07ec124` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

On a lead, save a note containing quotes and a line break, then read it in the Notes list.

## Expected result

The note shows exactly as typed.

## Actual result

`note: "He said \"…\"\n…"`.

## Impact and severity

- **Impact:** AC-3 (the note persists as typed) shown wrongly for any note with punctuation.
- **Severity:** Medium.

## Suggested investigation area

apps/web/src/routes/Leads/LeadDetail.tsx.

## Evidence

- Playwright run on the hosted URL, `tests/e2e/B-07.spec.ts`; see `docs/evidence/B-07.md`.
- `specs/007-leads/run-log.md` records how and when it was found.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The page rendered the stored event text instead of the note text. |
| Fix | `07ec124` on `007-leads`: `eventText()` unwraps a note (falls back to the stored text); white-space preserved in CSS. Unit tests added first. |
| Re-test | B-07-TC-010 PASS on 2026-10-24 (hosted, 3 viewports) |
| Status | ☑ Closed ☐ Reopened |
