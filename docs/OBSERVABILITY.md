# Observability and alerting

The API and alarm notifier initialize Powertools Logger, Tracer and Metrics. Active X-Ray and 90-day CloudWatch log retention are set in CDK. Event logging and trace response/error capture are forced off; dynamic identifiers and source data are excluded from telemetry.

The `PrismAssessment` namespace uses a bounded service dimension, with request/latency/error, auth/rate-limit, query count/latency, agent invocation/refusal/retrieval/failure and lead mutation/conflict metrics as appropriate. Operation labels appear only in safe logs/traces to avoid multiplying paid metric series. A low-cost dashboard and critical-failure alarms are created in the candidate stack.

Both ALARM and OK transitions invoke the notifier. It hashes the alarm ARN into a deduplication key and sends a fixed PagerDuty Events API v2 trigger/resolve body. The accepted hosted baseline had its Free-plan routing enabled and a measured ALARM-to-OK pair with two HTTP202 deliveries. Current delivery must be checked in the dated release evidence; an unconfigured or disabled deployment makes no provider call. Delivery is bounded to three attempts, two-second timeouts and exponential backoff with jitter. No alarm reason, source rows or arbitrary message/recipient is forwarded.

A disabled or unavailable account is an explicit external blocker, not a claimed live page. A live synthetic trigger/resolve receipt is required to claim that path works. Internal Lexicon/Main Dashboard registration is prepared as a local specification; no organization repository mutation or completed registration is claimed without access.

The packaged notifier is also exercised locally in the exact pinned Lambda container at 128 MiB with networking disabled. This proves startup, disabled-mode behavior and private-canary log exclusion; it does not claim live delivery. Live trigger/resolve receipts are a separate operator check.
