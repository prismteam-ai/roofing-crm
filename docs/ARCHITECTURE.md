# Architecture

The CRM consumes prepared Oracle data. It never invokes county, PermitStack, deed-index or license ingestion from the browser or a public application endpoint. Private working intake, protected authenticated projections, public-safe immutable artifacts and CRM operational records are separate data planes.

The web application separates the session/lead/query controller, opportunities view and property drawer while retaining the existing DOM, mutation gate, session epochs and revision-preserved note drafts. The API uses DynamoDB for shared sessions, atomic quotas and versioned leads. A pinned shared contract controls all Oracle responses.

Deterministic intent interpretation first applies or explicitly refuses every material constraint. A maximum of one preflight confirms source eligibility and empty results. Nonempty evidence permits one AI SDK call with a strict Zod `retrieveProperties` tool containing only the exact approved template, query digest, constraint digest, rank and page bound. The server validates the whole call, repeats the immutable query and renders all authoritative page facts/citations. It rejects drift, extra calls, model prose and unsupported operations. See [the decision record](adr/001-constrained-retrieval.md).

The hosted read plane uses CloudFront/private S3, HTTP API, scale-to-zero Lambda, shared sessions/quotas and Secrets Manager. Standard CDK assets and `cdk deploy` manage a fresh neutral review stack in `us-east-2`. Retained previous stacks are a rollback lane. Powertools emits only bounded operational metadata; alarm notification is a separate low-memory Lambda with an exact routing-secret permission.
