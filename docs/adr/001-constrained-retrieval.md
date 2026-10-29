# ADR: one-call constrained retrieval and deterministic rendering

Status: implemented; release acceptance requires the accompanying validation receipts.

The prior accepted selection protocol used one deterministic Oracle read and a model choosing numeric presentation ordinals. The current pinned team-kit requires a typed model-driven retrieval tool through the Vercel AI SDK. Merely renaming the old selection transport would not implement that requirement.

The new protocol first deterministically interprets every material user/context constraint. One bounded preflight establishes source eligibility and allows genuinely empty results to skip the model. A nonempty case permits one strict Zod `retrieveProperties` call with the exact approved template, immutable query/constraint digests, sort and limit. The model cannot weaken or add predicates. The server validates the entire call, executes the approved query and verifies the immutable result against the preflight before rendering authoritative facts and citations.

This explicitly amends the previous one-read bound to at most two read-only Oracle queries per turn; the parent authorized that bounded change. The model-attempt bound remains one, retries remain zero, and no mutation, tool loop, arbitrary SQL, record ID or model-authored factual explanation is introduced. All returned page rows retain authoritative ordering; the model does not drop records to disguise coverage.

A shared request deadline caps setup, retrieval, inference and finalization below the Lambda ceiling. Cancellation propagates across the HTTP/provider/campaign boundaries. Reservation and dispatch are distinct events; dispatched but unmeasured failures retain conservative allowance and never become zero-cost claims.

The model receives no raw source rows or free text. Source facts, explanations, confidence, provenance and limitations are server-owned. Tests cover altered/missing/extra constraints, mixed tools/text, both read failures, drift, aggregate deadlines, owner privacy, usage and exact budget accounting.

The original “open roofing permits older than five years” asks for source-qualified current activity plus age since issue, not proof of uninterrupted five-year history. Its strict calendar anniversary is anchored to the admitted source assessment date `2026-10-28`, producing a threshold of 1827 days for this release. The anchor is a material ledger entry and every qualifying observation in both reads must have that assessment date. Explicit open-for/continuous history instead requires independently documented native interval evidence; issue age cannot satisfy it. Deed-index gaps use their own verified-through date, which is independent of this provider assessment anchor.

## Nova1 wire compatibility and bounded failure diagnostics

The actual AI SDK5.0.127 wire capture showed that a directly converted strict Zod object sent `$schema`, `additionalProperties:false`, property `const` keywords and `toolSpec.strict:true`. Nova1 documents only `type`, `properties` and `required` at the input-schema top level. The adapter now sends those three fields, five singleton enums and no `strict` option. Its `jsonSchema` validation callback still uses the same strict Zod five-literal schema, and the server independently validates those exact literals again before the second read. Unknown, missing, altered or coerced arguments still refuse; no query or source constraint is broadened.

This is a provider wire compatibility correction, not a prompt repair or a model-tier change. Tool choice remains forced to one `retrieveProperties` invocation, temperature remains0, SDK retries remain0, and all original turn/call/token/dollar ceilings and durable counters remain unchanged. Offline signed-transport tests exercise the actual installed SDK wire; only the execution lane can prove service acceptance.

A fast provider rejection no longer becomes a blanket `QUERY_TIMEOUT`. Diagnostics use a closed failure-kind/name vocabulary and a bounded HTTP status, inspected only from own SDK metadata and the structured error-type header. Provider messages, response/request bodies, data and causes are never read for classification or copied into audit/log output. Structured logs revalidate the diagnostic vocabulary and drop all other fields. A provider-failed attempt retains its reservation and unmeasured-call count; absent usage is not zero-cost proof.

Primary references: [Nova1 tool troubleshooting](https://docs.aws.amazon.com/nova/latest/userguide/tools-troubleshooting.html), [Nova1 forced tool choice](https://docs.aws.amazon.com/nova/latest/userguide/tool-choice.html), and [Bedrock Converse error types](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html).
