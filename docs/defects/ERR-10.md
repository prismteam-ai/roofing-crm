---
id: ERR-10
type: defect
feature: FEAT-B07
story: B-07
test_case: B-07-TC-008, B-07-TC-010
ac_reference: B-07-AC-3
severity: Medium
status: Closed
found_by: Claude (Playwright and CI on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 294bf63
retest_date: 2026-10-24
---

# ERR-10: e2e note tests – "note is saved" passed on the text just typed, then the page reloaded mid-save

## Brief description

TC-008 and TC-010 failed intermittently: the note was saved on the server, but after a reload the Notes list sometimes did not show it.

## Related requirement

- **Story:** B-07 · **AC:** B-07-AC-3 · **Test case:** B-07-TC-008, B-07-TC-010

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `294bf63` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Run the note tests repeatedly on the hosted preview.

## Expected result

The check waits until the note appears in the saved list.

## Actual result

The check passed on the typed text; after the reload the list sometimes showed the old notes.

## Impact and severity

- **Impact:** Intermittent red in the AC-3 proof; an earlier theory (Lambda throttling) was wrong and is withdrawn.
- **Severity:** Medium.

## Suggested investigation area

tests/e2e/B-07.spec.ts note tests.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The test asserted on the whole Notes region. That region also contains the textarea, and React renders the typed text as content, so the check passed before anything was saved. The test then reloaded while the save was still in flight. The server data was always correct (API logs). |
| Fix | `294bf63` on `007-leads`: Assertions look at the saved list only (`savedNotes`), and the reload happens after the note is saved. A later commit (`7607e3c`) restored the helper that the first change removed by mistake. |
| Re-test | TC-008, TC-010 passed in 3 full runs on 3 viewports (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
