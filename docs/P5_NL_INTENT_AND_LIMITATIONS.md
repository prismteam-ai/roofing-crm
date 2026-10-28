# Natural-language intent and evidence boundaries

The assistant constructs a bounded typed search before reading source evidence
or calling a model. The staged grammar binds safety/evidence requirements, owner
classifications, numbers and statuses, result order, official places, and
descriptive projections. Each rule records the original span and its meaning in
a strict constraint ledger. Recognized request scaffolding is explicitly marked
non-filtering. Remaining text containing letters, numbers or comparisons blocks
execution instead of being discarded. This is a finite supported grammar, not a
claim to understand arbitrary natural language.

An accepted ledger carries the exact composed query. A rejected ledger has no
executable query and at least one material unsupported, ambiguous or conflicting
entry. Responses expose the ledger through the API and an accessible UI. The
110-case deterministic corpus includes the original example requests; additional
mutation, integration and browser checks cover supported conjunctions, rejected
qualifiers, query bounds and stale-answer behavior. Finite tests do not prove
universal language correctness.

`Only` is a material restriction: it must bind to an applied typed predicate in
its clause. It cannot make an unknown-only category or descriptive business
projection into an unrestricted search. Complete business phrases ending in
`where available` or `where observed` are conditional projections, consumed
before presence parsing; they do not add a must-have filter. An unsupported
listed-party/any-license presence request is refused rather than promoted to a
verified-company/high-confidence-license predicate.

## Places and current-map context

Named centers use the frozen official Oakland place index, its geometry digest,
source, method, type and FIPS. The index contains 63 source features, of which 62
are eligible for resolution; Cass Lake is quarantined. Ambiguous names require
an explicit municipality type, and the ledger shows candidate names/types/FIPS.
No coordinates are guessed and no paid geocoder is used.

`Within five miles of Troy` is a radius around the recorded official center.
Plain `in Troy` asks a different containment question and is refused for
clarification. The UI explicitly states that a center-radius search is not a
municipal-polygon filter. A contradictory conjunction of the current-map center
and another named center is refused. Explicit new radius and limit values are
honored within policy, never replaced with a smaller current-map value. The
model page limit is 50; requests above it are refused. The typed API's larger
maximum is not represented as a model capability. Non-mile radius units and
missing units currently require clarification.

The user can apply an accepted assistant search to the map. Named-place identity
and full coordinate precision persist in the URL. Manual pin or GPS movement
clears the old place ID and index digest. Fractional radii remain visible without
rounding the selected filter to a different value.

## Evidence meanings

- Roof age from building year remains a low-confidence proxy, not installation
  age. An explicit minimum age excludes unknown ages unless inclusion is
  explicitly requested. An only-unknown roof filter is not yet represented.
- Permit status means an acquired source observation. Issued-only evidence is
  unknown status; it does not become open or closed. Open duration requires a
  qualifying open roofing permit and a valid observed date. All combined
  status/duration/business predicates must hold on the same permit.
- `Open for many years` requests descending observed-duration priority without
  inventing a numeric cutoff. `Stalled` work is refused because elapsed open
  duration cannot establish progress or inactivity. Closed/unknown status with
  explicit open-duration ordering is conflicting.
- Regional/out-of-area owners mean recorded Michigan/outside-Michigan mailing
  state. They do not establish current residence. `Local owners` is ambiguous
  between city, county and state and is refused. Active owner-filter conflicts,
  unsupported exclusions and unclear anaphoric exclusions are refused.
- Last reported sale age uses partial observed history. True unchanged ownership
  tenure requires complete transfer evidence and is refused when unavailable;
  no sale proxy is substituted.
- A required contractor means a verified company edge, not an applicant name.
  A required verified license means a high-confidence official observation,
  not current active eligibility. A required BBB rating means an acquired
  observation. Numeric/grade thresholds and current license eligibility are
  unsupported. Requests to show details where available remain descriptive and
  do not remove properties missing those observations.

## Retrieval and model selection

Accepted requests use one snapshot-bound search. Before model context or a
cached deterministic fallback is constructed, the shared row predicate validates
radius, roof, confidence, owner, sale and qualifying-permit requirements. The
official place binding and authoritative source ordering must match as well.
Duration order ranks only the same qualifying permits. The model receives
minimized facts and returns a strict bounded subset of zero-based ordinals, with
fixed rationale categories. The server renders source facts and citations.
Explicit requested ordering cannot be rewritten by selected ordinals. When no
order was requested, model presentation order may differ from source order;
the original page still passes source-order validation before selection.

Empty source evidence returns an explicit no-model response. A model failure may
render the same validated cached page without a second Oracle search. Neither
empty evidence nor fallback is counted as model success. Source match totals,
retrieved-page size and selected presentation size remain separate. Existing
historical campaign evidence and counters are not reset by this parser change.

This implementation does not establish missing source coverage, current permit
statuses, verified contractor identity, active license eligibility, complete
transfer history or county-wide data completeness. Positive original-example
parsing is distinct from acquiring source facts that satisfy each predicate.

## Local browser verification

`playwright.p5.config.ts` serves only the local frontend and intercepts every API
response with clearly synthetic fixtures. External requests are blocked and
asserted absent. The fixture verifies ledger replacement after a refused
follow-up, named-center/filter persistence, manual movement clearing identity,
fractional radii, unknown status, business flags and mobile wrapping. It is not
hosted-backend, live-model or official-source evidence; those integration gates
are separate.
