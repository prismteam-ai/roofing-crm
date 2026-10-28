# Data coverage and source meanings

CRM consumes Oracle snapshots; these figures describe observed source preparation,
not county-wide completeness or a guarantee about a particular deployed package.
The final return pins source, observation window, snapshot digest and runtime.

The public baseline contains 490,799 property IDs. A later public observation is
kept separate from the earlier private 36-attribute county observation window.
Do not describe a public ID refresh as a fresh acquisition of private attributes.

The official municipality index retains 63 features, of which 62 are eligible.
Cass Lake is quarantined for identity/geometry issues. Ambiguous aliases require
clarification; place type, FIPS, geometry digest and source method are retained.

The Charter Township of Independence public source was fully acquired with
33,014 source features (19 attributes plus geometry); 31,525 join to the baseline
and 1,489 remain unassigned. This full cohort replaces the earlier 7,791-row
building subset; never sum the subset and full cohort. Literal CLOSED provides
2,298 closed observations across all types, including 31 joined roof-qualified
observations (32 before join). There are zero canonical OPEN observations.
FINALED, ISSUED, EXPIRED, CANCELED, HOLD (PREREQ) and SUSPENDED (FEE) remain unknown
unless explicit official lifecycle semantics are verified. Completion dates and
Name/Address/Contact fields are null; even literal CLOSED does not invent a
closed date or open-duration measurement.

Troy's issued report contributes 7,500 source records and 6,842 strict joins.
Issuance does not establish open status. The retained 907 reported business-license
attachments span ten reported names; an Applicant role is not a verified
contractor role. Neither those attachments nor a literal license status establish
current active eligibility. No accepted verified corporate identity or BBB
rating has been fabricated to fill those conditional gaps.

There are 668 official building-year proxy observations and 1,210 stored reported
sales in partial observed history. A building year is low-confidence roof-age
context, not a roof installation/replacement. A reported sale date is not a complete
transfer chain or uninterrupted ownership tenure. Missing acquired records are
unknown, not proof that no permit, sale, contractor, license or rating exists.

The safe return evidence includes
`return/evidence/source/independence_public_candidate_offline_validation.json`,
`independence_public_old_subset_comparison.json`, the official place-index
validation, and final source inventory/status/history receipts. Raw protected
rows and source bodies do not belong in Git, public artifacts or this guide.
Source terms/purpose restrictions and unacquired municipalities remain explicit;
limited discovery must not be described as county exhaustion.

Historical CID1/CID2 are assessment product snapshots. They are not current
Elephant Oracle/Atlas publication. An unmerged local Atlas page or CLI validation
must never be presented as global Atlas IPNS/MCP publication. Current publication
approval, independent gateway proof and IPNS status are recorded separately in
the final return; CRM does not create a new public effect.

P5 also integrates the twelve explicitly linked Rochester Hills April–September
2026 building reports: six issued and six applied. The exact cohort counts, PDF
identity, extraction fences, joins and unresolved printed footer discrepancies
are recorded in the final private-v6 source proof. These reports are a finite
cohort, not complete municipal permit or lifecycle history. Every acquired raw
record remains in protected DuckDB source views, including unmatched and ambiguous
addresses and unlabeled grouping-party/contact text. No unlabeled party receives
an owner, applicant or contractor role.

An explicitly labeled Owner field supplies a private source-reported observation
with its separate issued/applied event date, actual collection time, provenance
and uncertainty. Its ownership-effective date is unknown; it does not establish
current legal ownership, ownership at the permit event, a transfer, or uninterrupted
tenure. Assigned issued records may supply unknown-status permit observations;
applications remain separate report events and never establish issuance or OPEN.
The assignment requires exactly one normalized full site address in the exact
CITY OF ROCHESTER HILLS jurisdiction and is rechecked against the pinned snapshot
at runtime. Source phone/grouping text remains raw working data, outside typed
property responses and model input.

Private manifest v6 adds one report-source file while preserving all seven v5
files byte for byte. The runtime derives the typed observations from that pinned
file. All prior observation windows remain unchanged. Source GET timestamps
retain their original precision privately; canonical provenance normalizes the
same instant to UTC milliseconds. No report event date replaces collection time.

The final local v6 native proof reconciles 4,180 Rochester report records
(973 issued, 3,207 applied): 3,751 unique-address assignments and 429 unmatched
records. Exactly 915 assigned issued-report observations enter the permit view,
raising the combined normalized permit-observation count to 39,282; no unique
native-permit count is asserted because these PDFs print no native permit number.
There are 3,746 labeled Owner observations across 1,884 properties, with a maximum
of 103 per property. All raw-to-typed owner comparisons matched; seven earlier
v5 data files remain byte-identical. These are source-preparation measurements;
only final release-bound hosted receipts establish deployment status.

The private v7 extension retains all eight v6 data files byte for byte and adds
one official Troy Real Property Assessing Report case observed through the normal
public UI. All 39 displayed fields remain in its protected source table, with
manual-transcription provenance; there is no captured server body or bulk-source
claim. Explicit Owner Name 1/2 and Owner mailing fields are private observations,
with no known ownership-effective date or related permit event. These fields
remain excluded from model input and public publication.

This assessment association uses one exact normalized printed parcel number and
exact CITY OF TROY jurisdiction. Source and county street text differ: no number-
word/suffix equivalence or fuzzy address match is asserted. The source association
is medium confidence and does not verify a building, unit, roof, residence or
current legal ownership. Owner and roof views retain that limitation. The
separate owner-mailing-to-site comparison stays unknown. A reported Owner State
of MI supplies one spatially usable regional/in-state mailing observation with
source provenance, not a county-local or residence conclusion.

The source commercial-building summary year 2022 adds one low-confidence
building-year proxy. The raw slash-formatted sale string in 2012 has no observed format label:
the normalized sale date remains null, and the raw source value is retained. It
cannot prove uninterrupted tenure; the source also describes a later parcel split.
The local v7 proof reconciles 3,747 owner observations (3,746 prior Rochester
observations unchanged) and 39,282 normalized permit observations unchanged.
One current source case is not municipal coverage or evidence of source exhaustion.
