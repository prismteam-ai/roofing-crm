---
id: ERR-18
type: defect
feature: FEAT-B03
story: B-03
test_case: B-03-TC-NF-01
ac_reference: B-03-AC-3
severity: Low
status: Closed
found_by: Claude (Playwright and CI on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 6ae4266
retest_date: 2026-10-24
---

# ERR-18: e2e perf spec – `getByLabel('Radius')` matches two controls

## Brief description

`perf.spec.ts` failed on all three viewports: strict mode violation, `getByLabel('Radius')` resolved to 2 elements.

## Related requirement

- **Story:** B-03 · **AC:** B-03-AC-3 · **Test case:** B-03-TC-NF-01

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `6ae4266` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Run perf.spec.ts.

## Expected result

The radius box is filled.

## Actual result

Strict mode violation.

## Impact and severity

- **Impact:** B-03's performance proof could not run.
- **Severity:** Low.

## Suggested investigation area

tests/e2e/perf.spec.ts.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The number box ("Radius") and the slider ("Radius (slider)") both match a substring label. B-03's own spec already used the unambiguous locator. |
| Fix | `6ae4266` on `007-leads`: `getByRole("spinbutton", { name: "Radius" })`. |
| Re-test | perf.spec.ts passes on 3 viewports in the final runs (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
