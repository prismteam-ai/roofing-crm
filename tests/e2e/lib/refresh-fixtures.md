# Refreshing the e2e fixtures for a new Task A run

`tests/e2e/lib/run-fixtures.ts` holds every data-dependent value of the hosted suite. When the app
serves a new run, `fixtures-valid.spec.ts` fails first and points here. Budget: about 10 minutes.

## What you need

- The API Lambda `crm-api-trpc` (profile `assess`, region eu-north-1), invoked with an API Gateway v2
  event that carries `requestContext.authorizer.jwt.claims.sub`. Examples of the event shape:
  the `ev-*.json` files used earlier in this branch's scratchpad; the query goes in
  `rawQueryString` as `input=` plus the URL-encoded JSON, the route key is
  `GET /trpc/{procedure}`. Alternatively call `/api/trpc/{procedure}?input=...` on the hosted app
  with the admin session's Bearer token (as `fixtures-valid.spec.ts` does).
- Procedures: `shell.indexInfo` (no input), `search.properties`, `search.permits`, `property.get`.

## Steps

1. Run id and manifest. Call `shell.indexInfo`. Copy `runId` to `FIXTURES_RUN_ID` and `manifestCid`
   to `FIXTURES_MANIFEST_CID`. Update the header comment of `run-fixtures.ts` (date read, run, CID).
2. East pin (`EAST_TRAVIS`, `LAYOUT_SEARCH_PATH`). Call `search.properties` with
   `{center, radiusMi, limit: 1}` and read `counts.afterRadius`. Keep the pin if 3 mi gives roughly
   500 to 2,000 properties and answers in under 3 s (the API costs about 0.5 s per thousand
   properties); otherwise slide the pin outward from the city until it does. Do not pick the dense
   core: 5 mi in Central Austin takes 15 s or times out, which is a product issue, not a fixture.
3. Empty pocket (`ZERO_THEN_WIDEN`). Scan a grid of points at the county edge (0.03 degree steps)
   with `radiusMi: 0.5`. Pick a point with `afterRadius` equal to 0 whose `radiusMi: 1.5` call gives
   a positive count (hundreds to a few thousand is fine). Record both counts in the comment.
4. Lead fixtures (`LEAD_FIXTURES`, `OPEN_PERMIT_NUMBER`). Call `search.permits` around the Central
   Austin point with `{center, radiusMi: 2, sort: "openDays"}`. From the rows with
   `statusClass: "open"`, `improvementType: "Roofing"` and a `permitNumber`, call `property.get` on
   each `propertyCid` and pick one whose `roofAgeYears` is 20 or more: that is `openPermit`
   (record `OPEN_PERMIT_NUMBER` from its open permits). If a new run fills roof dates, many more
   qualify; take the one with the fewest permits to keep the drawer small.
   For `roofOnly` and `third`, call `search.properties` near the same point with
   `roofAgeMinYears: 20, limit: 100`, then `property.get` each: keep two whose permits include no
   `open` or `stalled` status. Copy `propertyCid` and `requestIdentifier` for each.
5. Leads allow-list. Nothing to edit: `B-07.spec.ts` builds the clean-up keys
   (`48453:tcad:{requestIdentifier}`) from the fixtures it reads, and `leads-cleanup.ts` stays as it
   is. The `crm-ci` user can only delete those keys.
6. Old manifest for the "not in the current run" case. `OLD_MANIFEST_CID` must be a real published
   manifest that is not the served one; the previous run's manifest CID is the natural choice.
7. Check. Run `fixtures-valid.spec.ts` against the hosted URL, then the whole suite:
   `RUNTIME_URL=<hosted url> PW_PHASE=parallel pnpm exec playwright test` and again with
   `PW_PHASE=isolated`.

## If a run adds roof dates

The map now defaults to a roof age of 15 years or more (PO, 2026-10-26); the specs open the pins with `roof=any`, so the unfiltered pins and counts keep working. B-07 only needs the
three lead properties to keep a roof age of 20 or more (the open-permit one also needs an open
permit). Re-measure step 2 timings: more rows per radius can only get slower.
