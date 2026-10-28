# Roofing CRM: evaluator orientation

This CRM consumes Oracle's versioned property evidence and turns a geographic
search into a list, map, property details and session-isolated lead records. It
supports GPS or a manual pin, configurable radius and evidence filters, and a
retrieval-grounded assistant with a visible constraint ledger. The original
[assignment README](README.md) is preserved unchanged.

The current implementation uses contract 0.4.0, an official 63-feature Oakland
municipality index (62 eligible; Cass Lake quarantined), and shared predicates
with Oracle. Named radius searches use the official geometry-derived center;
they do not claim municipal-polygon containment. Every material interpreted
constraint must be applied or the assistant refuses before evidence/model use.
An accepted nonempty request performs one Oracle search and at most one Bedrock
call over minimized facts. The server validates source predicates/order and
renders facts and citations. Empty evidence and deterministic fallback are
explicitly distinguished from model success.

Local code proof is not proof that every original business outcome has source
evidence. Current source preparation includes 31 joined roof-qualified literal
CLOSED observations and zero canonical OPEN permits. Building-year roof proxies
are not verified roof replacement dates; reported sales do not establish tenure;
applicant names do not verify contractors; license observations do not establish
active eligibility. The source inventory is limited, not county-exhaustive.

Start with the [documentation index](docs/README.md),
[local development](docs/LOCAL_DEVELOPMENT.md),
[evaluator guide](docs/EVALUATOR_GUIDE.md), and
[current limitations](docs/KNOWN_LIMITATIONS.md). The returned assessment reports
bind the exact final source, package, snapshot and hosted identities. Historical
P1–P4 receipts remain evidence of their observed attempts, not current acceptance.
Final hosted/model/concurrency/security checks and lead review control readiness;
this document grants no deployment, publication, media or remote Git action.
