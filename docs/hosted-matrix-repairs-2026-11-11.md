# Hosted matrix harness repairs — 2026-11-11

Deployment under test: CRM `834837e`, pipeline `4dafad5`. These changes repair test interactions, not application code.

- The fixed `(80,80)` map click landed on the mobile legend. The corrected test clicks an unobscured real property marker, verifies its matching drawer PIN, then clicks open map canvas away from overlays. All nine browser/viewport variants passed in `matrix-harness-repair-two-workers`.
- Clearing geolocation permissions resets Firefox to `prompt`, not `denied`; an independent browser probe confirmed a pending prompt. `grantPermissions([])` alone also retains the earlier grant. The test now clears permissions, explicitly grants an empty set, and reloads the document so WebKit observes the new denial. Chromium/Firefox six variants passed in `gps-denial-retest-two-workers`; WebKit three variants passed after the reload in `gps-webkit-fresh-document`.
- Failed attempts remain in their original result directories. They are not relabelled as passes. All retests used two workers, isolated browser/workspace state, real public deployment and start/end SHA guards.
- Evidence is under this checkout's `apps/web/test-results/hosted/<run>/` and matching `apps/web/playwright-report/hosted/<run>/` directories. Original broad-run evidence remains in the primary checkout under `final-834837e-remaining-eight`.

ESLint and TypeScript checks passed for the repaired spec. Full corrected-suite integration and criterion/control reconciliation remain separate from these targeted passes.
