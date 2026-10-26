# Phase 0 research: B-01 CRM shell

No `NEEDS CLARIFICATION` markers remained in the Technical Context — every unknown was already resolved by `metagross`'s read-only design consult (`agent-design.md`) or by the architecture constitution. This file records the decisions and alternatives for traceability, not new research.

## Decision: custom pre-auth Lambda for the exact lockout rule

- **Decision**: a pre-auth Lambda trigger tracks failed attempts per username in a small DynamoDB counter table, raising a typed error on the 4th consecutive failure and clearing it after a 5-minute cooldown.
- **Rationale**: Cognito's built-in advanced security / risk-based lockout doesn't guarantee an exact "4th attempt, 5-minute cooldown" — it's heuristic and risk-scored. The story's AC-3 needs a deterministic, testable rule.
- **Alternatives considered**: Cognito's native account lockout (rejected — not precise enough to test deterministically); a Lambda behind the auth challenge flow doing the same counting (equivalent, chosen approach is the simpler pre-auth trigger since no custom challenge UI is needed).

## Decision: client-side MapLibre bounds guarantee, no server round trip

- **Decision**: `minZoom` is computed once from `map.cameraForBounds(countyBbox)`; `maxBounds` is left unset so pan/zoom stays unrestricted; the check re-runs only on resize.
- **Rationale**: AC-2 requires both "no artificial limit" and "always renders at least the county box" — a `maxBounds` cap alone would satisfy the second but violate the first. Deriving `minZoom` instead of capping the viewable area satisfies both without a server call (keeps "no reload").
- **Alternatives considered**: server-computed bounds via an API call (rejected — adds latency and a dependency with no benefit, since the county geometry is static); a hard `maxBounds` box (rejected — would cap pan/zoom, violating "no artificial limit").

## Decision: reuse Task A's app-shell and Coming-soon pattern via copy, not import

- **Decision**: copy (not reference) `apps/web/src/components/AppShell`, `Icon`, `EmptyState`, `ErrorBanner`, `Skeleton`, `StatusPill` from Task A A-03, and `ComingSoonEntry`/`ComingSoonSkeleton`/`ComingSoon` route from Task A A-13 (read via `git show` on branch `013-explorer-and-pages`, since A-13 is not yet merged).
- **Rationale**: the two tasks' repos are fully separate deployables with no shared package boundary (constitution access-boundary rule) — code is copied once and then owned independently, never imported live across the repo boundary.
- **Alternatives considered**: a shared npm package published between the two repos (rejected — out of scope, adds a release process neither task needs, and blurs the two tasks' independence).

## Decision: `CrmData`/`CrmSync` stay stubbed; the one new table this story needs lives in `CrmOps`

- **Decision**: `CrmData` (the future lead index/store) and `CrmSync` stacks are declared but left empty in this story. The `LockoutCounter` DynamoDB table (`data-model.md`) is provisioned in `CrmOps` instead, since it is purely an authentication-support structure, not lead/property data.
- **Rationale**: B-01 reads no Task A property/permit data and writes no leads — there is nothing for `CrmData`/`CrmSync` to hold yet. Declaring those two stacks (even empty) now avoids a later re-architecture when B-02 needs them. The lockout counter is a different kind of state entirely (auth bookkeeping, not business data) and belongs with the rest of the auth stack.
- **Alternatives considered**: omit `CrmData`/`CrmSync` entirely until B-02 (rejected — the architecture constitution's deploy order already names all six stacks; declaring them empty now keeps every story's CDK app structurally identical); put `LockoutCounter` in `CrmData` (rejected — that stack is reserved for the lead/property index per the module-boundary table, and the lockout counter has no relationship to it).
