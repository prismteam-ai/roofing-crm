# Grounded selection protocol v2

The active architecture is `one-call-grounded-selection-v2`. It replaces the
v1 output of ordinal/reason objects after measured provider failures showed that
asking the model to assign rationale categories added a fragile protocol step.
Historical v1 attempts and their failures remain evidence of those attempts.
They are not acceptance or repair/Lite eligibility for v2.

The compositional intent, explicit constraint ledger, fixed snapshot, official
place binding, shared source predicates and authoritative source-order checks
run before the model. There is one Oracle search. A complete empty result has
zero model calls; a nonempty result permits one actual Converse call with the
same allowlisted minimized retrieved facts. The model still consumes retrieved
evidence and selects a bounded presentation. It cannot create source facts.

The sole presentation tool accepts exactly `{"ordinals":[0]}` in the one-row
example. Its dynamic JSON schema lists only the numeric ordinals actually in the
projected context, requires at least one and at most N entries, forbids additional
keys and declares uniqueness. Server validation additionally rejects strings,
floats, negative/out-of-range/unprojected values, duplicates, empty output,
old v1 objects, rationale/prose fields, extra/mixed tools and descending order.
All selections retain ascending authoritative order, even for a default sort.
The model may select fewer rows; actual total, retrieved page, projected context
and selected presentation counts remain distinct and explicitly labeled.

The server derives one category per selected row from those same minimized
facts: observed roof age, explicit observed open duration, literal business
license, BBB observation, unknown evidence, or `context_match` when no more
specific basis applies. A category is not an inferred active license, verified
contractor identity, roof replacement, tenure or current permit lifecycle.
The trace labels the rationale source `server-minimized-facts`, binds the v2
protocol, input selection digest, evidence digest and actual source rows.

The conservative input/output/cost/deadline guards, one-call limit, exact source
rows/citations, source-query semantics, privacy minimizer and zero-match policy
remain in force. A rejected model response can use the same validated cached
page as an explicitly labeled deterministic fallback; that is not model success.

Quality eligibility uses the versioned v2 gate. A fresh frozen36-case Micro BASE
campaign is required; v1 reports or an old unversioned gate cannot grant v2
repair or Lite permission. Versioning eligibility does not change, reset or
refund durable request, Converse, daily/session or cost counters. Exact active
limits and account usage are separate from this protocol description.

Local tests use synthetic transports and do not establish actual model quality.
A new measured v2 campaign and exact hosted source/package proof remain separate
release gates. No project, lead-review or media approval follows from this change.
