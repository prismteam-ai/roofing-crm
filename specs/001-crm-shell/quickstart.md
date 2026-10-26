# Quickstart validation: B-01 CRM shell

Run every check against **RUNTIME_URL** (the Amplify preview for this branch, `{NNN-slug}.{amplify-app-id}.amplifyapp.com`, printed by the Amplify build in Phase D) — never localhost (constitution Article I/X; the Playwright config fails fast if pointed at `localhost`).

## Prerequisites

- Amplify preview deployed (`git push origin 001-crm-shell`) → this becomes RUNTIME_URL
- `CrmApi`, `CrmWeb`, `CrmDomain`, `CrmOps` CDK stacks deployed (`pnpm --filter infra cdk deploy --all`; `CrmApi` depends on `CrmOps` for this story per `plan.md`'s Data Flow & Integration Points, resolved automatically by `cdk deploy --all`'s dependency graph)
- Seeded admin test credentials pulled from Secrets Manager (never printed to chat or logs beyond this private session)

## AC-1 — sign-in, no self sign-up

```bash
# In a private browser window:
open "https://{RUNTIME_URL}"
```
Submit the seeded credentials. Expect: lands on the Map screen centered on Travis County (≈30.2672°N, −97.7431°W); no self sign-up link anywhere on the page.

## AC-2 — pan/zoom + X-Ray trace

Pan and zoom freely; confirm the view never drops below the Travis County bounding box. Then:
```bash
aws xray get-trace-summaries --profile assess --region eu-north-1 \
  --time-range-type TraceId --start-time <page-load-epoch> --end-time <+5s>
```
Expect: a `health.ping` trace appears within 3 s of page load.

## AC-3 — lockout

Submit the wrong password 3 times, then a 4th. Expect: "Too many attempts — try again in 5 minutes", never a generic error or blank screen. Wait 5 minutes (or adjust the DynamoDB `lockedUntil` directly in a test-only path) and confirm sign-in succeeds again with the correct password.

## AC-4 — disabled rows

At 1440 px: open the nav rail, confirm Campaigns/Estimates/Jobs/Invoices/Outreach are `aria-disabled` with a "Coming soon" tooltip on hover/focus. At 390 px: open the "More" sheet, confirm the same five rows.

## AC-5 — Coming Soon page

Tap the disabled "Campaigns" row. Expect: a Coming Soon page with a "Back to Map" action — never a 404 or blank page.

## Expected outcome

All 5 Playwright specs in `tests/e2e/B-01.spec.ts` pass against the hosted URL; `smeargle` passes at 390/768/1440; evidence recorded in `docs/evidence/B-01.md`.
