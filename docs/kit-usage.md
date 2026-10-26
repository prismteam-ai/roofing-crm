# Kit Usage

Built with the [soofi-xyz team kit](https://github.com/soofi-xyz/soofi-xyz-team-kit), installed at project scope (see `.claude/settings.json`).

*Story merge (2026-10-21, before P8):* the 11 stories run as 5 merged stories. Story IDs here are **part** IDs: B-10 → B-01 · B-04, B-05, B-06 → B-03 · B-08 → B-07 · B-11 → B-09. Evidence for a part goes in its merged story's file, one section per part (for example `docs/evidence/B-03.md` § B-04).

Every story also loads `apply-engineering-guidelines`. Agents follow `../assessment-guide/AGENT-MAP.md` § 5, as updated after the P1 routing check below.

| Story | Primary agent | Skills loaded | Reviewer | What the kit decided or produced |
| --- | --- | --- | --- | --- |
| B-01 Walking skeleton | `metagross` | `build-frontend-backends`, `integrate-ci-cd` | `metagross` | Turborepo + Cognito + MapLibre shell live at RUNTIME_URL; lockout redesigned mid-build (client-reported failures, server-enforced block) after `metagross`'s original PreAuthentication-only design proved a no-op against real Cognito |
| B-02 Lead search index | `espeon` (index), `machamp` (batch); design with `alakazam` | `build-local-rag-pocs`, `build-rag-systems`, `build-batch-workflows`, `unify-metrics`, `use-elephant-mcp` | `espeon`, `alakazam`, `machamp`, `porygon`, `donphan` | espeon's local prototype (`scripts/local-rag-poc`) proved the query path against `contract/v1/sample.parquet` before any AWS resource existed, per `build-local-rag-pocs` discipline. ADR-01 (DuckDB over Parquet, no OpenSearch) and ADR-07 (vendor `query-core`/`contract`, never re-implement) both held through the build. E1 review found 3 Critical findings (propertyCount never persisted, ADR-02's CloudFront gateway never wired, a dead diverging cost gate); E2 fixed all of them and a later `/speckit-converge` round closed two more CRITICAL gaps the kit's own review scope hadn't covered (the manifest's own bytes were never verified against its CID — only downstream parts were; the API's `LeadIndex` port wasn't wrapped with the required Powertools observability). `donphan`'s MCP cross-check (AC-2) is the one mechanism built-but-unexercised: Travis County isn't yet published to this environment's Elephant MCP index. Final reviewer scores: espeon 90, alakazam 90, donphan 91, machamp 86, porygon 82 — all ≥75. |
| B-03 Radius search | `metagross` | `build-frontend-backends`, `frontend-bug-fix` | `metagross`, `audino` | Two parallel `metagross` builder groups converged cleanly on one shared `packages/domain`. First review found a Critical: the built UI (FilterSheet/ResultRow/PermitChip/PropertyDetail) was never wired into `Map.tsx`, which rendered a hand-rolled list instead — fixed, `audino` re-scored 48→84. User then compared the live preview directly against the real design prototype (not just the thin `.dc.html` wrappers) and found it structurally unlike it; a full UI rebuild against the actual served prototype boards followed, then a second `audino` full re-review (81/100) plus `smeargle`'s responsive pass found and fixed remaining token/tap-target issues. Also found and fixed, live: the shared tRPC client never attached the Cognito session (every authenticated call 401'd — nothing in this repo had exercised one before), a CDK Docker-bundling gap for `@duckdb/node-api` on the API Lambda, `indexInfo()` not catching `crm-leads`'s `ResourceNotFoundException` (B-07's table isn't deployed yet — GAP-7, affects every story), and a flat-color map (wrong free tile-style choice for this story's zoom level). |
| B-04 Roof age | `metagross` | `build-frontend-backends`, `frontend-bug-fix` | `metagross`, `audino` | Merged into B-03's single build/review round above; see that row. |
| B-05 Open permits | `metagross` | `build-frontend-backends`, `frontend-bug-fix` | `metagross`, `audino` | Merged into B-03's single build/review round above; see that row. |
| B-06 Permit + contractor + BBB | `metagross` | `build-frontend-backends`, `frontend-bug-fix` | `metagross`, `audino` | Merged into B-03's single build/review round above; see that row. |
| B-07 Leads | `metagross` (builder); design consults `mew` (read-only, confirmed the lead key and event model) and `metagross` | `build-frontend-backends`, `use-neutral-lexicon`, `frontend-bug-fix` | `metagross` (80/100), `audino` (78/100), `/code-review medium` (10 findings); 8 fixed, the rest deferred — see `docs/reviews/CR-B-07.md` | `mew` confirmed the key `{fips}:tcad:{request_identifier}` and the gapless event model with no change; `metagross` proposed the table, GSIs, tRPC procedures and UI. Two `metagross` builder groups built the store and the list. Running on the live stack then exposed nine defects that unit tests had not (listed in `docs/evidence/B-07.md`); those fix rounds and the e2e spec were done by general-purpose Sonnet subagents and the orchestrator, not by a kit builder agent. |
| B-08 Lead list | `metagross` | `build-frontend-backends`, `frontend-bug-fix` | `metagross` (80/100), `audino` (78/100) — reviewed together with B-07, see `docs/reviews/CR-B-07.md` | Merged into B-07's single build and proving round above; see that row. |
| B-09 Agent | `alakazam` (retrieval), `ash` (runtime); design consults `alakazam`, `ash`, `smeargle`, `porygon`; builders `alakazam`, `ash`, `metagross` | `build-rag-systems`, `build-ai-agents`, `use-elephant-mcp` | `alakazam` (84/100), `ash` (87/100), `metagross` (88/100), `audino` (82/100), `porygon` (84/100), plus `/code-review medium` (10 findings); first scores 72, 62, 68, 72, 58, re-scored 80, 86, 84, 88, 88, then final 84, 87, 88, 82, 84 on Run 2 — see `docs/reviews/CR-B-09.md` | The four design agents were consulted read-only and their answers compiled in `specs/009-agent-hardening/agent-design.md`; that compilation caught two corrections (the confidence bands follow ADR-06, and the prototype path is `design/prototype/`, not `design/screens/`). Three builder groups built the tool layer and place resolver (`alakazam`), the runtime, limits and confirm flows (`ash`) and the infra, metrics, sync and Ask screen (`metagross`). The first review round found 3 Critical findings (Lambda timeout shorter than the agent turn, no Bedrock grant, dashboard and alarm reading dimensions never emitted); one fixer per builder closed all 20 findings. The live stack then exposed what unit tests had not: the lead repo was missing from the Lambda context (the agent could not check or propose leads); `leads.undoCreate` failed on the real table because `sequence` is a DynamoDB reserved word and the in-memory fake does not enforce it; FetchPart returned the downloaded bytes and hit `States.DataLimitExceeded` on Run 2; and whole-county search ran out of memory and exceeded the 6 MB response limit, fixed by SQL pushdown. Six golden passes on Run 2 (`docs/evidence/B-09.md`) found the place-extraction and unpublished-owner-filter defects. Which later fix rounds were done by general-purpose subagents and which by the orchestrator is not recorded in the repo's files (the git log names no subagent for them); the review-fix commits `56222d5`, `d81b380`, `84a23be` and `d78de40` are labelled by agent. |
| B-10 Disabled sections | `metagross` | `build-frontend-backends` | `metagross`, `audino` | Shared `NavRow` (`aria-disabled`, tooltip, still interactive) reused unmodified between the nav rail and the 390 px "More" sheet; `smeargle` responsive pass clean after 2 Atlas-token fixes |
| B-11 Responsive + observable | `metagross`; design with `smeargle`, `porygon` | `responsive-design-tests`, `unify-metrics`, `build-frontend-backends` | `metagross` (88/100), `audino` (82/100), `porygon` (84/100); first scores 68, 72, 58, re-scored 84, 88, 88 — reviewed together with B-09, see `docs/reviews/CR-B-09.md` | `smeargle` and `porygon` were design consults for the responsive suite and the metrics contract; `metagross` built the `RoofingCrm` dashboard, the alarms and the hosted responsive specs at 390 / 768 / 1440. `porygon`'s first review found the dashboard and groundedness alarm queried dimensions that were never emitted, so the alarm could never fire; fixed, and groundedness is now Sum(verified) over Sum(total). The DLQ alarm was proved on the live stack (fired, drained, cleared on its own) and exposed that `CrmSyncStack` never had `alarmEmail` set, so the alarm had sat in ALARM unseen since 2026-10-23. Whether `smeargle` ran on the changed pages is not recorded; the responsive result is the hosted Playwright suite (`docs/reports/TR-B-09.md`). |

`smeargle` runs the responsive suite on every `ui: true` story. Whole-repo moments: `arceus` at P1, `slowking` at R6.

## Routing decisions (P1, 2026-10-20)

`arceus` was asked for the Task B routing without seeing the agent map (full answer in `docs/01-intent.md` § 13). Differences and decisions:

| Agent or skill | Difference | Decision |
| --- | --- | --- |
| `donphan` | Named by arceus; the map used it in Task A only | Reviews B-02: confirms index count = Oracle count through the MCP |
| `klefki` | Named by arceus; not in the map | Left out: a file-sharing portal builder. B-01 sign-in is a plain Cognito login built by `metagross` |
| `porygon` | In the map; not named by arceus | Kept: reviews B-02 and B-11 (`unify-metrics`) |
| `mew` | In the map; not named by arceus | Kept: designs the B-07 lead model (`use-neutral-lexicon`) |
| `ash` | In the map; not named by arceus | Kept: builds the B-09 agent runtime with `alakazam` |
| `use-elephant-mcp` | Named by arceus; not in the map for Task B | Added to B-02 and B-09 |

Also left out, as arceus advised: `oracle` and the county ingestion skills (outside the access boundary), `kangaskhan`, `blissey`, `conkeldurr`, `uxie` (Prism platform products this app doesn't use).

## Reviewer scores before submission

| Agent | Score (0–100) | Main deviations fixed |
| --- | --- | --- |
| `metagross` (B-02) | 90 | — |
| `metagross` (B-03) | 80 | Stale self-disclosure comment after an already-fixed CDK gap; double DuckDB pass for fresh counts (accepted, matches FR-004); BBB/contractor collapsed to `permits[0]` (accepted v1 shortcut) |
| `espeon` | 90 | — |
| `alakazam` | 90 | — |
| `machamp` | 86 | — |
| `porygon` | 82 | — |
| `donphan` | 91 | — |
| `audino` (B-03, round 1) | 48→84 | Critical: built UI never wired into `Map.tsx` (fixed) |
| `audino` (B-03, full re-review after rebuild) | 81 | Shape-token misuse surviving the rebuild, 2 new hardcoded values, a phantom board name — all fixed |
| `ash` (B-09) | 62 → 86 → 87 | 3 findings fixed in the first round (28 s Lambda, scoped Bedrock grant, typed limits, real spend reconciliation); final round notes: Gateway key not refreshed after rotation, client-supplied thread ids, reservation kept on a mid-turn timeout (follow-ups) |
| `alakazam` (B-09) | 72 → 80 → 84 | Permit citations dropped, scope gate ran for every intent, counts not derived from evidence, claim text unchecked — fixed; final: answer text used the cited-row count (fixed), G1/G2/G6 re-run in pass 6 |
| `metagross` (B-09) | 68 → 84 → 88 | Dashboard and alarm dimensions, retryable auto-sync, batch-coverage holds, alarm email in config — fixed; final: `crm:alarmEmail` committed, static `crm-ci` key (follow-ups) |
| `audino` (B-09) | 72 → 88 → 82 | Ask states, empty-result reasons, candidate-place buttons — fixed; final round: lead marks vanished past 1,000 properties, Tab trap, Escape scope, pin names — fixed (`cbb548e`) |
| `porygon` (B-09) | 58 → 88 → 84 | Emitted-dimension mismatch, per-answer groundedness averaging — fixed; final: answer text shown-row count (fixed), Run 2 sync evidence section (added) |

## Whole-repo review before release (R2, 2026-10-26)

Each agent reviewed the whole repository read-only at commit 96b85a3 (a targeted read, not a line-by-line audit; every report states its confidence). Fixes followed and the two reviewers below 75 were re-run on the fixed code.

| Agent | Area | First score | After fixes | Main findings |
| --- | --- | --- | --- | --- |
| `audino` | UI and Atlas design system | 84 | not re-run | Atlas tokens and provenance followed; three inputs suppress the outline (parent ring, regression test added); raw pixel sizes and max-width queries (converted to tokens and mobile-first); no automated accessibility scan |
| `metagross` | Architecture and infra | 82 | not re-run | Structure and constitution strong; owner-name wording in the NFR row (reconciled); demo-project `RemovalPolicy.DESTROY` (noted in the constitution); cold-load and p95 to measure |
| `espeon` | Sync pipeline | 82 | not re-run | CID and SHA-256 verification, idempotency and the guarded pointer flip are solid; cost gate is a size and count gate; single-Lambda DuckDB build |
| `ash` | Agent runtime | 82 | not re-run | No direct provider SDKs, fixed three-call flow, spend cap and rate limit, lead proposals confirmed by the user; no AI SDK telemetry in the agent path (open); thin conversation memory |
| `alakazam` | Retrieval and citations | 78 | not re-run | Code-driven retrieval, scope gate in code, strict citation verification; golden set was stale (re-baselined: 48 of 48 on Run 3.1) |
| `porygon` | Consistency of numbers | 78 | not re-run | Permit rule copied in several web files, tenure wording differed between map and agent, a magic constant (all fixed in one shared rule) |
| `machamp` | Batch workflow | 68 | **79** | No alert on failed or held runs, no catch state, thin memory headroom (fixed: alarms, named failure state, memory alarm, rollback script, runbook); rate limit per container (accepted, documented) |
| `smeargle` | Responsive tests | 66 | **83** | Gaps in drawer, Filters owner group, search box, radius and GPS tests, silent CI skips (fixed and verified at 390, 768 and 1440 px on the hosted site) |

Everything the review found that is not fixed is listed in [`docs/pending-items.md`](pending-items.md) section 3. Every reviewer score on record is now 75 or higher.

An independent README and demo walk-through (live, read-only) and two evaluator self-scores by `slowking` ran the same day; their findings and fixes are in the PR text (Progress since the last update).

## Fix rounds after the stories merged (2026-10-26)

After the whole-repo review the fixes were made by general-purpose agents working to the findings of the kit agent that owns each area; only the style cleanup ran as a kit builder (`audino`). The owning kit agent re-scored where its score was below 75.

| Fix round | Owning kit agent (findings) | Who made it | Re-check |
| --- | --- | --- | --- |
| Permit filter in SQL before the page, "Open" includes stalled, finished permits are not live | `porygon` (one rule everywhere), `metagross` | general-purpose agents | Unit tests on real Parquet; hosted suites; golden queries 48 of 48 |
| Agent: owner-area filter, roof-age basis wording, A3 planning, no place inheritance, stalled wording | `alakazam`, `ash` | general-purpose agents | Stubbed-model tests; golden queries 48 of 48 |
| Alarms, named failure state, memory alarm, rollback and replay script, runbook | `machamp`, `espeon` | Claude (infra tests) | `machamp` re-scored 79 |
| Responsive tests, tap-target CSS | `smeargle` | general-purpose agents | `smeargle` re-scored 83 |
| Tokens, mobile-first queries, focus-ring tests | `audino` | `audino` (builder) | Web unit tests; hosted suites |

## Responsive test coverage after the last UI round (2026-10-26)

`smeargle` reviewed the responsive specs twice more after the final UI changes (Ask cards, phone List rows, first-visit card, full drawer, ring fit, not-found page). First read: **62/100**, because those pages were covered only by unit and CSS-text tests. Seven rendered hosted specs were then added under `tests/e2e/responsive/` (`ask-matches`, `candidate-list-phone`, `first-visit`, `drawer-content`, `ring-fit`, `not-found`, `legend-widths`); they pass at 390, 768 and 1440 px on the live site, and two of them found real layout bugs that were fixed (the Ask card was 16 px indented and 32 px narrower than a search card; the candidate table overflowed at 1,240 to 1,639 px). Second read: **83/100**. Still open, as listed by the reviewer: widths outside the three projects (320, 1024, 1280, 1536), the Ask-about-it drawer close at 390 and 768, larger-text and landscape checks, and visual baselines.

