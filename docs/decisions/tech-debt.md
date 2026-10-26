# P2 drift log

Per `docs/architecture-constitution.md` § 14 ("Drift handling"): P2 items are logged here and picked up at the story that owns them, rather than blocking a gate. Each entry names the owning story.

## TD-1: Sync duration (A-03-sized run) is looser than metagross's original projection

- **Where:** `docs/architecture-constitution.md` § 10, "Sync duration, A-03-sized run" row (≤ 5 min).
- **Source:** `metagross`'s original consult projected < 3 min for this size; the G3-adopted D7 consolidation picked espeon's ≤ 5 min instead, as the number with the stronger measured gateway-politeness basis, not the stricter number — a deliberate exception to this document's general "take the stricter number" rule.
- **Raised by:** `metagross`'s G3 review (`docs/reviews/CR-G3-ARD-B.md`, finding F-1, low-severity half).
- **Resolution:** not a defect — no action required unless B-02's actual measurement comes in looser than 5 min, in which case re-open at B-02.
- **Owning story:** B-02.

## TD-2: `ConversationEventStore` component placement needs full detail at story time

- **Where:** `docs/architecture-constitution.md` ADR-06, § 9 module table (`apps/api` row).
- **Source:** `metagross`'s G3 review, finding F-4. The architecture constitution places the port/adapter in `apps/api/src/services/agent`; the full interface, the DynamoDB item shape it uses, and the AgentCore-Memory upgrade path still need to be specified in `specs/009-agent-hardening/agent-design.md` (alakazam, per constitution Article XIV) before `/speckit-plan` for that story.
- **Owning story:** B-09.

## TD-3: Lead DynamoDB item shapes are not restated in the architecture constitution

- **Where:** `docs/architecture-constitution.md` ADR-04.
- **Source:** `metagross`'s G3 review, finding F-2. ADR-04 now says explicitly that full item shapes live in `specs/007-leads/agent-design.md` (mew), not in the architecture constitution — this entry just tracks that the consult itself (`docs/decisions/0000-agent-architecture.md`, mew § 5 and § 7) is the starting draft for that file, and it needs to be reconciled with ADR-04's key format (`{fips}:tcad:{request_identifier}`) and gapless event sequencing before B-07's `/speckit-plan`.
- **Owning story:** B-07.

## TD-4: B-01's test-case document (`testplans/B-01-test-cases.md`) has accepted G6 polish gaps

- **Where:** `testplans/B-01-test-cases.md`, after 4 fix-and-retry rounds against the `developmentsupport-g6-precheck` skill (see `specs/001-crm-shell/run-log.md`).
- **Source:** the 4th G6 pre-check run flagged, and the PO accepted leaving open rather than running a 5th fix cycle:
  - TC-007 and TC-NF-03 still use short "repeat steps N–M" / "repeat TC-003's steps" shorthand rather than being fully unrolled into single-action steps (every other case in the file is fully unrolled).
  - TC-NF-03 asserts Powertools' Logger JSON shape on both Lambdas (NFR-001's "every Lambda wrapped with Powertools" clause) but does not separately assert a Tracer (X-Ray) segment or an EMF Metrics record for each — Logger coverage is verified, Tracer/Metrics are not.
  - TC-NF-02 still names its sibling phase ("Phase Z / TZ04" in `tasks.md`) rather than describing the `smeargle` suite's role in fully implementation-independent language.
  - The coverage matrix's Playwright test names are truncated with "…" rather than spelling out each case's exact `test()` title string.
- **Resolution:** **fixed**, 2026-10-23 (initially accepted as an exception, then actually closed at the user's request). All 4 items resolved in `testplans/B-01-test-cases.md` directly: TC-007/TC-NF-03 fully unrolled; TC-NF-03 now also confirms an EMF metrics record (previously Logger-only) and cites TC-NF-01 for Tracer; TC-NF-02 describes the Atlas-token-audit suite's role without naming a phase; the coverage matrix spells out every exact Playwright `describe`/`test` title. While reconciling the document against the actual built UI, also found and fixed a real wording drift (the form says "Username", not "email"; both typed error texts end in a period) and corrected the automation-mapping claims for TC-011/TC-NF-03, which were never actually automated end-to-end — now stated plainly rather than implied. Self-check re-run clean, §5.
- **Owning story:** B-01 — closed.

## TD-5: B-01's unit-test coverage is below 80% on `apps/api`, `apps/web` and `packages/api-client`

- **Where:** G7 pre-check (`docs/gates/G7-B-01-precheck.md`), check C-02. Measured coverage: `apps/api` 41.58% stmts, `apps/web` 56.25% stmts, `packages/api-client` 42.85% stmts (all other packages — `shared`, `config`, `ui`, `infra` — clear 80% on lines/statements).
- **Source:** the gap concentrates in Lambda/tRPC-router envelope code (`lockout-handler.ts`'s dispatch, `health.ts`'s wrapper, `routers/auth.ts`'s procedure body) and `signIn.ts`'s Cognito SRP call — all deliberately proven by the actual live deploy and the 60-case Playwright suite (`tests/e2e/B-01.spec.ts`, `config-guard.spec.ts`, `tests/e2e/responsive/*`) rather than mocked in Vitest, a choice stated explicitly in `apps/api/test/handlers/health.test.ts`'s own header comment ("the envelope is proven by cdk-nag/Powertools wiring... not a unit test"). The pure logic underneath each envelope (the lockout state machine, `classifySignInError`, the MapLibre bounds helper) is unit-tested and at or near 100%. `packages/api-client/src/react.tsx` (0% coverage) is a React Query integration layer built ahead of need — confirmed unused by anything in this story, likely intended for a future story's data-fetching, the same pattern as the intentionally-stubbed `CrmData`/`CrmSync` CDK stacks.
- **Resolution:** **fixed**, 2026-10-23 (initially accepted as an exception, then actually closed at the user's request rather than left standing). Added real unit tests for the envelope code itself — `handler()` against a realistic API Gateway v2 event, the `triggerSource` dispatch (mocking the AWS SDK at the module boundary, not real DynamoDB), `reportFailedAttempt`'s actual procedure body, `signIn()`'s real SRP call and `reportFailedAttempt` wiring, and `react.tsx`'s `ApiProvider`/`createQueryClient` (confirmed unused by any route in this repo, but tested rather than deleted, since it's a shared package another story may still want). Coverage now: `apps/api` 96.03%, `apps/web` 97.91%, `packages/api-client` 92.85% — all comfortably above 80%. 94 unit tests total (up from 75), `docs/reports/UT-B-01.md` updated.
- **Owning story:** B-01 — closed.

## TD-6: Sync unit tests fetch the real sample manifest over public IPFS gateways

- **Where:** `apps/sync/test/plan.contract.test.ts`, `plan.digestGuard.test.ts`, `plan.authoritativeCid.test.ts`, `idempotency.test.ts` (and `fetchPart.test.ts`) call the real Plan/FetchPart fetch for manifest `bafkreiasycms…k5i` with no gateway configured.
- **Source:** found 2026-10-24 during the B-09 review-fix verification: the suite failed in a clean checkout on vitest's 5 s timeout and passed on a re-run. Measured that minute: CloudFront copy 0.3 s, Filebase 0.7 s, Pinata 8.4 s. No code defect; the result depends on which gateway answers and how fast.
- **Resolution:** **fixed**, 2026-10-25. The manifest's exact published bytes (11,641 bytes, sha256 `12c09928…2aea`) are committed at `apps/sync/test/fixtures/sample-manifest.bafkreiasycms…k5i.json` (excluded from Prettier so they stay byte-exact). `apps/sync/test/sampleManifest.fixture.test.ts` decodes the CID independently and checks the fixture's sha256 against the CID's digest, so the fixture cannot drift. `plan.contract`, `plan.digestGuard` and `plan.authoritativeCid` serve those bytes through a stubbed `fetch` (`fixtures/sampleManifest.ts`), so Plan's own manifest-bytes-against-CID check still runs on the real bytes; a new single-byte-tamper case proves it still holds. The network-era 30 s per-test timeouts are gone. A suite-wide setup file (`apps/sync/test/setup.noNetwork.ts`) makes any unstubbed `fetch` fail with its URL, so no `@crm/sync` unit test can reach a gateway again. Running the suite with only that guard showed exactly 8 tests in those 3 files had been using the network; `idempotency.test.ts` and `fetchPart.test.ts` already stubbed every fetch (they only use the CID as a value). Part bytes were not needed. Live-gateway behavior stays covered by the hosted sync run. 121 tests, about 2 s, no network.
- **Owning story:** B-09 follow-up — closed.
