---
id: ERR-17
type: defect
feature: FEAT-B03
story: B-03
test_case: B-03-TC-006
ac_reference: B-03-AC-1
severity: High
status: Closed
found_by: Claude (Playwright and CI on the hosted preview, orchestrated for the PO)
found_date: 2026-10-24
fix_branch: 007-leads
fix_commit: 6ae4266
retest_date: 2026-10-24
---

# ERR-17: Map – the "Widen to 1.5 mi" button cannot be clicked on a 1440×900 screen

## Brief description

On the desktop layout, the map canvas covered the "Widen to {n} mi" suggestion below the map and swallowed the click.

## Related requirement

- **Story:** B-03 · **AC:** B-03-AC-1 · **Test case:** B-03-TC-006

## Environment

| Item | Value |
| --- | --- |
| URL | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com |
| Build | fix commit `6ae4266` (found on an earlier build of the same branch) |
| Data snapshot | manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` |
| Browser / OS / device | Chromium via Playwright · macOS (local) and Ubuntu (CI) · 390, 768 and 1440 |
| Role | seeded test user (password from Secrets Manager, never printed) |

## Steps to reproduce

Sign in at 1440×900, drop a pin near Lago Vista, set the radius to 0.5 mi, click "Widen".

## Expected result

The radius becomes 1.5 mi.

## Actual result

Playwright: "<canvas> subtree intercepts pointer events" for 30 s. A real user could not click it either.

## Impact and severity

- **Impact:** A B-03 demo state was unreachable on desktop.
- **Severity:** High.

## Suggested investigation area

apps/web/src/routes/Map/Map.module.css `.mapArea`.

## Evidence

- Playwright and CI runs recorded in `specs/007-leads/run-log.md` and `docs/evidence/B-07.md`.

## Resolution

| Field | Value |
| --- | --- |
| Root cause | The map wrapper has a 480 px minimum height, while its container only guarantees 420 px, so the canvas spilled over the notice rendered after it. Found only now: the widen path had never run live, because the index was down until the lead table existed. |
| Fix | `6ae4266` on `007-leads`: `overflow: hidden` on `.mapArea`. Proven on the live site first (fails without the CSS, works with it). |
| Re-test | B-03-TC-006 and TC-001 pass on desktop in all later runs (2026-10-24) |
| Status | ☑ Closed ☐ Reopened |
