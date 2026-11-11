# Hosted matrix harness repairs — 2026-11-11

Deployment under test: CRM `834837e`, pipeline `4dafad5`. These changes repair test interactions, not application code.

- The fixed `(80,80)` map click landed on the mobile legend. The corrected test clicks an unobscured real property marker, verifies its matching drawer PIN, then clicks open map canvas away from overlays. All nine browser/viewport variants passed in `matrix-harness-repair-two-workers`.
- Clearing geolocation permissions resets Firefox to `prompt`, not `denied`; an independent browser probe confirmed a pending prompt. `grantPermissions([])` alone also retains the earlier grant. The test now clears permissions, explicitly grants an empty set, and reloads the document so WebKit observes the new denial. Chromium/Firefox six variants passed in `gps-denial-retest-two-workers`; WebKit three variants passed after the reload in `gps-webkit-fresh-document`.
- Failed attempts remain in their original result directories. They are not relabelled as passes. All retests used two workers, isolated browser/workspace state, real public deployment and start/end SHA guards.
- Evidence is under this checkout's `apps/web/test-results/hosted/<run>/` and matching `apps/web/playwright-report/hosted/<run>/` directories. Original broad-run evidence remains in the primary checkout under `final-834837e-remaining-eight`.

ESLint and TypeScript checks passed for the repaired spec. Full corrected-suite integration and criterion/control reconciliation remain separate from these targeted passes.

## Save/filter synchronization retest

The original broad run completed with55passed/17failed (plus the separate desktop9/9). It also exposed WebKit reload cancelling an unacknowledged notes update and rapid filter changes racing the expected response. The harness now awaits each changed status, the notes-save response before reload, and each pin/confidence/radius query before continuing. All six affected WebKit cases passed at390/768/1440 with two workers in `webkit-save-and-filter-retest` (3.6minutes), against the unchanged deployed834837e. One original Firefox initial-load timeout did not reproduce in the successful targeted map retest; its failed evidence remains retained.

These successful retests do not erase baseline failures or constitute a claim of exhaustive UI coverage. They also do not replace verification of the separate r3 product fixes on their new deployment.
