# Quickstart validation: B-07 leads

Run against the hosted Amplify preview for branch `007-leads`, never localhost (constitution Article I, §12 P0-15).

## Prerequisites

- B-03 merged (map + `PropertyDetail` drawer live).
- Signed in as the seeded Cognito test user.
- A property near Manor, TX with an open roofing permit, visible on the map (the demo AC-1 scenario).

## Scenario 1 — Create a lead (AC-1)

1. Open the Manor, TX property's detail drawer.
2. Tap "Create lead".
3. **Expect**: within 2 s, the lead list shows the new lead at the top, status `new`, with the signals snapshot (roof age, permit id, contractor) and the source manifest reference visible on the detail view.

## Scenario 2 — Duplicate refusal (AC-2, NFR-001)

1. From the same property's drawer, tap "Create lead" again.
2. **Expect**: "Already a lead", no second row appears in the list.
3. Fire 20 concurrent `leads.create` calls for the same key (`tests/e2e/B-07.spec.ts`'s concurrency test). **Expect**: exactly 1 success, 19 `ALREADY_EXISTS`.

## Scenario 3 — Status + note persistence (AC-3)

1. Open the lead created in Scenario 1.
2. Change status to `contacted`, add the note "Spoke with homeowner, roof confirmed 22 years old."
3. Reload the page.
4. **Expect**: status still `contacted`, note still present.

## Scenario 4 — Combined filters, list/map agreement (AC-4)

Requires 50+ leads across Travis County already in the system (seed via repeated Scenario 1 against different properties, or a test fixture).

1. Open the Leads list.
2. Apply roof-age ≥ 20 years, permit status = open, 10 mi radius from Round Rock.
3. **Expect**: the list's count matches the map's count for the same filters; the URL contains the encoded filter combination; reopening that URL reproduces the same filtered view.

## Scenario 5 — "Not in Run {n}" (AC-5)

1. Open a lead whose source property is absent from the currently served manifest (simulate by pointing a test fixture's `META#index` at a manifest that doesn't include the lead's property).
2. **Expect**: the lead detail shows "not in Run {n}" instead of the signals snapshot rendered as current.

## Scenario 6 — Empty list (edge case)

1. With no leads created yet (fresh table / fresh filter combination matching nothing).
2. **Expect**: an explicit empty state, never an error or an infinite spinner.

See `specs/007-leads/contracts/leads.md` for the procedure contracts and `data-model.md` for the item shapes these scenarios exercise.
