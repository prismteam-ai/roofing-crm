# ADR: one-call constrained retrieval and deterministic rendering

Status: implemented; release acceptance requires the accompanying validation receipts.

The prior accepted selection protocol used one deterministic Oracle read and a model choosing numeric presentation ordinals. The current pinned team-kit requires a typed model-driven retrieval tool through the Vercel AI SDK. Merely renaming the old selection transport would not implement that requirement.

The new protocol first deterministically interprets every material user/context constraint. One bounded preflight establishes source eligibility and allows genuinely empty results to skip the model. A nonempty case permits one strict Zod `retrieveProperties` call with the exact approved template, immutable query/constraint digests, sort and limit. The model cannot weaken or add predicates. The server validates the entire call, executes the approved query and verifies the immutable result against the preflight before rendering authoritative facts and citations.

This explicitly amends the previous one-read bound to at most two read-only Oracle queries per turn; the parent authorized that bounded change. The model-attempt bound remains one, retries remain zero, and no mutation, tool loop, arbitrary SQL, record ID or model-authored factual explanation is introduced. All returned page rows retain authoritative ordering; the model does not drop records to disguise coverage.

A shared request deadline caps setup, retrieval, inference and finalization below the Lambda ceiling. Cancellation propagates across the HTTP/provider/campaign boundaries. Reservation and dispatch are distinct events; dispatched but unmeasured failures retain conservative allowance and never become zero-cost claims.

The model receives no raw source rows or free text. Source facts, explanations, confidence, provenance and limitations are server-owned. Tests cover altered/missing/extra constraints, mixed tools/text, both read failures, drift, aggregate deadlines, owner privacy, usage and exact budget accounting.
