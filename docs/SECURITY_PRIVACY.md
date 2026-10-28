# Security and privacy

Every material intent constraint is applied or refused before a model can run. The model receives a normalized approved query, opaque digests and bounded counts only; it receives no raw property/owner/contact/provider rows or source free text. It cannot submit SQL, IDs, URLs, files, arbitrary tools, source definitions or rewritten predicates. Zod validates all tool arguments and the server verifies both immutable reads.

A single aggregate request deadline is shorter than Lambda's 29-second ceiling. Inference plus its two reads consumes at most 23 seconds and the remaining parent budget, leaving finalization headroom. AbortSignals propagate to the AI SDK, Oracle HTTP and campaign writes. Requests, provider attempts and reserved cost remain durably bounded; failures never refund allowance or describe unmeasured usage as zero spend.

Sessions are signed, server-side revocable, TTL-bounded and isolated from lead records. Existing mutation concurrency/idempotency/history and session-epoch protections are retained. API routes enforce size limits, exact origins, security headers, quotas and typed input/output boundaries.

Powertools/X-Ray never capture event/response bodies, cookies, query values, prompt text, provider details, error objects or private rows. Only fixed service/operation labels, status, counts and timings reach operational telemetry. PagerDuty uses a secret-backed routing key and fixed endpoint; only bounded operational summaries leave AWS.

Credentials, access codes, browser profiles and raw/private/provider datasets stay outside source, CI artifacts and review ZIPs. The source scan is a high-confidence credential/import boundary check, not a claim of exhaustive PII detection; the release requires a separate full privacy/evidence review.
