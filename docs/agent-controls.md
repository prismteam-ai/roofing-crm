# Public agent resource controls

The demo remains public without login. The `agent.ask` resolver enforces a global, per-process
admission budget: 12 accepted questions per minute, 200 per rolling 24-hour window, and two
questions in flight. Every tRPC procedure invocation consumes its own admission, including batched
requests. IP, forwarding, session and workspace headers do not identify a quota and cannot reset it.
Failed admitted questions count because a provider may already have billed work. Concurrency slots
release after success or failure.

Rejection returns HTTP/tRPC 429 with `Retry-After` and structured `retryAfterSeconds`. The chat shows
the reason, disables sends during the cooldown and offers a retry of the same question. Map search
and lead management remain available.

Each LLM question allows at most four generation steps, 800 output tokens per step, four executed
tools with at most 30,000 characters per result, no SDK retries, and a 30-second model deadline. The last generation step disables further
tools so the model can produce an answer. A question's embedding work is bounded to 1,000 texts
and 400,000 characters before calling the embedding provider; cached embeddings can reduce actual
paid work. A find tool returns at most ten retrieved properties. Existing dataset timeouts still
apply; model cancellation does not guarantee cancellation of an already-running external tool.

These are bounded-work demo controls, not a durable dollar billing limit. They reset when the
process restarts and are not shared between replicas. A production deployment needs a shared
persistent admission/spend ledger and provider account limits. Because the demo has no identity,
all visitors share capacity and one visitor can consume the public budget. No header-based pseudo
authentication is claimed.

Area summaries describe the returned sample (at most 500 properties), not the whole area. The
`openOver5y` statistic counts properties with an open roofing permit aged at least five years
(`open_days >= 5 * 365.25`), independent of the two-year UI default. Missing duration, closed permits
and non-roofing permits do not count.

Validation: HTTP regression checks cover quota windows, concurrency release, spoofed headers and
batch admission; model/embedding tests cover output and work caps; the five-year regression checks
1,826 versus 1,827 days. The browser retry regression injects an explicit 429 and then uses the real
offline API at 390/768/1440 widths. It proves error/recovery UI behavior, not hosted LLM availability.
