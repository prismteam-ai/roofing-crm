# Delivered implementation and decisions

The CRM provides county-scale Oracle integration, synchronized map/list/detail views, GPS/pin/radius controls, typed evidence filters, versioned durable leads and a grounded natural-language retrieval workflow. The original [assignment](docs/history/ASSIGNMENT_README.md) remains the scope authority; safe empty-result handling does not satisfy an unavailable positive source outcome.

React and MapLibre present prepared evidence. API Gateway/Node 24 Lambda serves the authenticated read and lead plane; DynamoDB stores revocable sessions, atomic quotas and lead history. Vercel AI SDK and strict typed tools keep source facts and authorization in deterministic server code. [Architecture](docs/ARCHITECTURE.md) explains the major choices and rejected alternatives.

The accepted hosted release passed exact source/package/frontend binding and scoped runtime/access checks on 2026-10-29. Its source and receipt hashes are preserved in [release status](docs/RELEASE_STATUS.json). A later documentation commit is not automatically a deployed release: final promotion is established by an external receipt, without a self-referential source/build hash in this file.

Architecture, contract 0.5.0 and admitted data are frozen. The free-source campaign is complete; no paid source plan is required or purchased. See [coverage](docs/DATA_COVERAGE.md) and the canonical [known limitations](docs/KNOWN_LIMITATIONS.md) for the current/open-permit gap, building-year proxy and narrower current-PIN deed-index evidence.

The engineering path includes pinned least-privilege CI/manual verification, one canonical verification command, standard CDK assets, Powertools/X-Ray, 90-day logs and a secret-backed bounded alarm notifier. Final clean-clone checks, hosted first use, media and submission each retain their own dated evidence; [testing](docs/TESTING.md) and the [release checklist](docs/RELEASE_CHECKLIST.md) distinguish these gates.
