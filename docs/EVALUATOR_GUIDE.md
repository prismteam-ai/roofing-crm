# Evaluator guide

Obtain the exact CRM/Oracle URLs, review-access method and expiry from the final
hosted runtime/access report in the return packet. Do not use an old screenshot
or include the access code in an issue, command line or recording. The app's
health/evidence endpoints and release metadata must match that report's final
HEAD/tree/build, contract, snapshot and loaded asset hashes.

1. Open the workspace in a fresh session. Confirm the source mode and coverage
   caveats, then inspect the default Oakland search.
2. Use GPS or place a manual pin and set the radius. A denied GPS request must
   leave pin placement available. Confirm map and list belong to the same query.
3. Enable a roof-proxy age threshold. Observe low-confidence building-year
   labels and unknown inclusion; do not call this a roof replacement date.
4. Inspect acquired permit status, source dates and role/license/BBB observations.
   Current prepared data has closed roofing observations but no canonical OPEN
   records. An empty open search must not be turned into a positive example.
5. Create a lead, retry without duplicating, update status/note, inspect history,
   reload and archive it. Another session must not inherit that lead namespace.
6. Ask the original examples below. Inspect the accepted or rejected constraint
   ledger and the exact typed query. Apply an accepted search to the map and
   reload; manual movement must clear the old official-place binding.
7. Show disabled future sections. They are intentional placeholders, not working
   outreach, automation or campaign products.

Original query examples:

- “Which properties in Oakland County within five miles of Troy have roofs older
  than 15 years?”
- “Which properties near that area have open roofing permits that have been open
  for many years, and who is the listed contractor?”
- “Show me open roofing permits older than five years within five miles of Troy,
  Michigan.”

A named place resolves to an official geometry-derived center plus a radius,
not a municipal polygon. Bare Novi is ambiguous; specify City of Novi or Novi
Township. The Village of Clarkston official name is retained even though its
recorded type is City. “Local owners” needs clarification; regional/out-of-area
means Michigan/outside-Michigan recorded mailing state. True tenure and active
license eligibility are unsupported. The vague many-years example prioritizes
observed durations without inventing a numeric cutoff.

A nonempty grounded answer uses one source search and at most one model call.
The v2 model chooses only unique numeric ordinals from minimized facts, in
source order; the server derives explanations, facts and citations. Empty evidence says no model was called. Model unavailability produces
an explicit deterministic fallback from the same source query, never a model
success. Zero acquired matches do not prove absence in the county.

On failure, check expiry/access, exact current release identity, source mode and
coverage first. Preserve the safe error and query/build identities; never copy
credentials, raw provider bodies or private source rows into a report. A stale
answer must clear after query change, refusal, logout or outage. The final return
records which hosted/browser steps were actually observed and any source blocker.

For lead edits, wait for the saving indicator and disabled controls to finish.
The confirmed version appears immediately in the detail view. Changing status
preserves a draft note; saving a note clears only the submitted draft after the
server confirms it. A newer edit made during the save remains as the next draft.
An external version conflict preserves the draft and shows an error; it is not
automatically retried. Session changes close prior lead data and pending replies.
