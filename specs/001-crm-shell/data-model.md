# Phase 1 data model: B-01 CRM shell

B-01 introduces no durable business data (no property, permit or lead records — those start at B-02/B-07). The only state this story owns is session and lockout bookkeeping.

## Session (client-held, Cognito-issued)

| Field | Type | Notes |
|---|---|---|
| `idToken`, `accessToken`, `refreshToken` | JWT strings | Issued by Cognito on sign-in; stored client-side, re-used across a browser reload (edge case in spec.md) |
| `expiresAt` | timestamp | Drives silent refresh; an expired session with no valid refresh returns the rep to sign-in, never a blank screen |

No CRM-owned table backs this — it is entirely Cognito + browser storage.

## LockoutCounter (DynamoDB, `CrmOps` stack)

| Field | Type | Notes |
|---|---|---|
| `username` (PK) | string | The one seeded admin username in this story; schema supports more later |
| `failedAttempts` | number | Incremented by the pre-auth Lambda on each failed sign-in; reset to 0 on a successful sign-in or after the cooldown expires |
| `lockedUntil` | timestamp \| null | Set to `now + 5 minutes` the moment `failedAttempts` reaches 4; checked (and cleared) by the pre-auth Lambda before raising/clearing the lockout error |

**State transitions**: `0 failures` → (failed attempt) → `1..3 failures, not locked` → (4th consecutive failed attempt) → `locked, lockedUntil = now+5m` → (cooldown elapses) → `0 failures, not locked`. A successful sign-in at any point before the 4th failure resets `failedAttempts` to 0 without ever locking.

## RoadmapSection (static enum, no storage)

| Value | Notes |
|---|---|
| `campaigns`, `estimates`, `jobs`, `invoices`, `outreach` | Fixed list from the story; rendered as disabled `NavRow`s and as the Coming Soon route's `:section` param. No table — this is a `packages/shared` Zod enum, not data. |

No other entities. Property, permit, contractor, BBB and lead entities are out of scope for B-01 per spec.md's Assumptions and are introduced starting B-02 (`docs/architecture-constitution.md` ADR-04).
