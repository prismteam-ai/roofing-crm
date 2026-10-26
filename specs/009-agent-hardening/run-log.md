# B-09 run log — read this before `../assessment-guide/WALKTHROUGH-B-09-agent-hardening.md`

**This file is the source of truth for how this story actually runs.** The walkthrough file above is the
*original plan*; it is stale in three ways this run deviates from it, all approved by the user on 2026-10-24:

1. **No reuse from Task A A-13/A-14.** Confirmed by reading `stories/A-13-explorer-and-pages.md` (status: Draft)
   and `stories/A-14-agent-and-mcp.md` (status: Ready) in the oracle pipeline repo — neither is Done, and no
   `agent.ask.ts`/`getModel.ts`/breakpoints-config/`tablet.css`/`compact.css` exist there to copy. **Do not run
   the `copy-from-oracle.sh` commands in the walkthrough's Phase C.** Build the agent runtime (`agent.ask`
   procedure, `getModel()`/`AI_PROVIDER` switch, Zod tools, Answer panel, golden-query harness) and the
   responsive config (breakpoints, `tablet.css`/`compact.css`) natively inside roofing-crm instead, reusing
   B-01/B-03's existing responsive baseline where it already exists. **Swap-back condition:** when the user
   says A-13 and/or A-14 have merged, re-diff roofing-crm's native version against theirs and reconcile.
2. **Data source: Task A's manifest by CID, not the Elephant MCP.** *(Superseded 2026-10-25: Run 1 failed; the story closes on Run 2, manifest `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`, 441,961 properties / 15,025 permits. The Run 1 figures below are history. See `docs/pending-items.md`.)** CID
   `bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu` (441,961 properties / 17,387 permits) is pinned
   and real, but Atlas registration (the catalog step that makes it discoverable by county name through the
   MCP) hasn't happened yet. Read property/permit data directly by this CID. **2026-10-24, user decision: not
   waiting on Atlas registration, and not pursuing the MCP swap-back for this assessment round.** Confirmed
   with the user this doesn't cost assessment points — constitution B1 explicitly allows "by CID) or its MCP"
   as two sanctioned access methods, this is already recorded as an accepted, justified, reversible deviation
   (`docs/architecture-constitution.md` §13), and what's scored is the real data being present (SC-005), not
   which lookup path reached it. The swap-back condition stays documented in §13 for the record, but is not an
   open action item — direct-CID read is the final data path for this round, not an interim one.
3. **Two added ACs beyond the original walkthrough:** AC-7 (the data-switch deviation above, now in
   `stories/B-09-agent-hardening.md` and `spec.md`) and AC-8 (targeted prototype re-audit — `audino` + `smeargle`
   re-diff every screen against `design/screens/` for drift since B-03's last clean review, fix or defer each
   finding with a reason). Release steps R1–R6 (not R7/demo video, not final "ready to publish") are folded into
   this story's Phase F close-out — see "Release fold-in" in the story file.

DLQ alarm SNS subscriber: `eng.heba.gaber@gmail.com` (user-provided, not the walkthrough's placeholder).
Golden queries G1–G7: run against the Run 1 full-county data (point 2 above), not the 35-row sample — real
signal now available at county scale.

## Progress (one line per step)

- 2026-10-24 · A1 · Confirmed B-07 merged (`git log` shows `8b13240 B-07: merge leads + lead list`).
- 2026-10-24 · A1 · Confirmed A-13/A-14 NOT done upstream → native-build deviation (point 1 above).
- 2026-10-24 · Round 1 (ad hoc, before A2) · User answered: direct-CID data switch, golden queries vs Run 1,
  DLQ email `eng.heba.gaber@gmail.com`, targeted prototype re-audit scope, native build over waiting on A-13/A-14.
- 2026-10-24 · A2 · Story expanded (AC-7, AC-8, Release fold-in, deviations documented); G4 pre-check PASS, 0 FAIL
  (`docs/gates/G4-B-09-precheck.md`); user approved Ready. Committed `88cb7a5`.
- 2026-10-24 · A2 · `/speckit-specify` → `spec.md` written, requirements checklist 16/16 passing.
- 2026-10-24 · A2 · `/speckit-clarify` → no critical ambiguities (decisions already resolved pre-spec).
- 2026-10-24 · B · Design consults run read-only: `alakazam` (Opus), `ash`, `smeargle`, `porygon`.
  Answers compiled in `specs/009-agent-hardening/agent-design.md`. Two corrections found and resolved
  without new PO input (both already settled by binding docs): confidence bands follow ADR-06 exactly
  (auto ≥0.92 · clarify 0.80–0.92 · refuse <0.80), and the prototype path is `design/prototype/CrmAsk*.dc.html`,
  not `design/screens/`.
- 2026-10-24 · C · `/speckit-plan` → `plan.md`, `research.md`, `data-model.md`, `contracts/agent-api.md`,
  `contracts/observability.md`, `quickstart.md`. Technical design reuses the already-accepted ADR-06
  agent architecture (`docs/decisions/0000-agent-architecture.md`), nothing under which was built yet.
  The two corrections above applied to `stories/B-09-agent-hardening.md` and `spec.md`. Committed `dc2d3e0`.
- 2026-10-24 · C · `/speckit-tasks` → `tasks.md`, 60 tasks (T001–T060) + Phase Z/N, organized by spec.md's
  5 user stories with US4 (data switch) sequenced before US1/US2 (their golden-query tests need the real
  manifest CID to mean anything). 3 builder groups tagged per task: `alakazam`, `ash`, `metagross`. Committed `d8d28cd`.
- 2026-10-24 · C · `/speckit-analyze` → 0 CRITICAL, 1 HIGH (F1: invalid `[US-shared]` label on a
  Foundational task), 1 MEDIUM (F2: a confirm-flow guard test scheduled before the file it tests
  exists), 3 LOW (no action needed). User approved applying all fixes immediately. Both fixed:
  F1's label dropped; F2's test moved into Phase 4/US1 as T029 (renumbered T012–T029, net-zero
  shift from T030 on). Committed `d8e9299`.
- 2026-10-24 · D · Drafted `testplans/B-09-test-cases.md` (27 functional/NF cases + edge-case rows)
  from the story's ACs, independent of `tasks.md`, per constitution XXII. Committed `b48b26c`.
- 2026-10-24 · D · G5 pre-check on plan.md/tasks.md: **PASS, 0 FAIL** — fixed Phase N/Phase Z
  ordering in `tasks.md` so the hosted-runtime proof is genuinely last (matches B-07's gated
  precedent); added TZ07 for the post-merge `docs/progress.md` update. `docs/gates/G5-B-09-precheck.md`.
- 2026-10-24 · D · G6 pre-check on `testplans/B-09-test-cases.md`: **FAIL, 1 FAIL** — added the
  missing TC-025b (ADR-06's 0.80–0.92 clarify band had no case), fixed the Login assumption for
  non-UI case types and the automation mapping for 7 Infra/Docs cases. The one remaining FAIL
  (C-07, real test data) is expected and documented: the Run-1-manifest record values are left as
  placeholder tokens until US4 (the data switch) actually deploys — filling them now would be
  fabricated data, not a drafting gap. `docs/gates/G6-B-09-precheck.md`. **Awaits your decision**:
  approve G6 with this one documented exception (same pattern as B-07's "G7 approved with
  exceptions," `be3c337`), or hold G6 until US4 deploys and the tokens are filled with real values.
  Committed `05d64af`.

- 2026-10-24 · D · **User decision:** hold G6 until data is ready (US4 deployed/data readable),
  Atlas registration, and A-13/A-14's upstream merge status — proceed with what's buildable in the
  meantime. **Recorded exception to constitution XVIII** ("No `/speckit-implement` before G4, G5
  and G6 pass"): G6's one open failure (C-07, real test data) blocks *running* the golden-query
  harness and the live Playwright suite against real values — it does not block *writing* the
  code those tests will exercise. Implementation proceeds now on that basis: every task except
  T047 (run golden queries against the deployed agent) and the token-fill step in
  `testplans/B-09-test-cases.md` can complete without real data. G6 stays FAIL/Held in
  `docs/traceability.md` until data readiness lets those two items close it for real — this is not
  a silent reinterpretation of the gate, it's a recorded, user-directed exception, same category as
  B-02's/B-03's/B-07's prior "approved with exceptions" gates.
- 2026-10-24 · E · `/speckit-implement` started under the exception above.
- 2026-10-24 · E · Phase 1 (Setup, T001-T005): done directly (trivial scaffolding + `ai`/
  `@ai-sdk/amazon-bedrock` deps). Found and fixed a real regression from T001's zod bump:
  `packages/shared`/`packages/index-schema` were still on zod 3.24.1, which became a structurally
  incompatible instance under `exactOptionalPropertyTypes` once apps/api moved to 3.25.76 —
  `tsc --noEmit` failed on `leads.ts`/`property.ts` even though vitest passed. Bumped both to
  3.25.76. Committed `5b604d9`.
- 2026-10-24 · E · Phase 2 (Foundational, T006-T019): `alakazam` + `ash` builder subagents in
  parallel, no cross-dependency between their task sets. 140 apps/api + 29 shared + 79 sync + 143
  web tests pass, tsc clean, `cdk synth --strict` succeeds with the new `crm-agent-usage` table
  and its scoped UpdateItem-only grant visible in the synthesized templates. Committed `e5e6b61`.
- 2026-10-24 · E · Phase 3 (US4 data switch, T020/T022/T023 done directly; T021 **not done**):
  investigated how the manifest pointer actually works — `DATA_MANIFEST_CID`
  (`packages/config/src/index.ts`) drives what Task A's sync job ingests/promotes; switching it
  to the Run 1 CID means actually running that full 441,961-property ingestion against real AWS
  infra and then flipping the env var in CI/Amplify — a real deploy/cost action, not a code
  change (the module's own comment says so). Wrote T020's test skip-guarded on the deployed env
  vars being present (mirrors `tests/agent/golden.test.ts`'s `RUNTIME_URL` requirement); recorded
  the AC-7 deviation in `docs/architecture-constitution.md` §13 (T022); confirmed T023 needs no
  change (per-row/per-lead CID provenance already exists generically via `CidDisplay`). Committed
  `6421e47`. **T021 stays open, needs your explicit go-ahead** — it's the actual "data readiness"
  action, same category as the G6 block, not a coding task.

- 2026-10-24 · E · Phase 4 (US1, the MVP, T024-T040): three waves of builder subagents —
  alakazam (T024,T025,T029(moved from ash's test-only wave),T030-T032: placeResolver,
  verifyCitations, tools.ts), ash (T026-T029 tests then T033-T038: getModel/runAgent/agent.ts —
  one `generateText` call with `stopWhen: stepCountIs(3)`, not `maxSteps` which doesn't exist in
  the installed AI SDK version), metagross (T039/T040: Ask.tsx, the `/ask` route+nav, the
  outcome→data-state mapping for smeargle's later suite). Also fixed a real deploy gap: `AI_PROVIDER`/
  `AGENT_MODEL_ID` were never wired to the API Lambda — added both to `@crm/config`'s
  `RuntimeConfig` (bedrock default per constitution VI) and threaded through CDK. 159→164 api
  tests, 155 web tests, clean tsc throughout. Committed `c7a3fdc`, `1bd988f`, `b664cf3`. **US1 (the
  story's MVP) is now fully implemented.**
- 2026-10-24 · E · Phase 5 (US2, golden queries at scale, T041-T046): three builders in parallel
  on disjoint files — alakazam (golden harness as a new `tests-agent` workspace package,
  skip-guarded same as T020; real `ownerAreaClass`/`tenureYearsMin`/`permitNumber` SQL filters,
  not just types), ash (Bedrock prompt caching), metagross (6 new agent metrics + fixed
  `AgentAsksTotal`'s missing `outcome` dimension). Merged cleanly, no conflicts. 164 api + 31
  shared + 14 observability + 155 web tests pass, full `pnpm test` (18 packages) green. Committed
  `7f8b60b`. T047 (running the harness for real) stays blocked on data readiness, same as T021.

- 2026-10-24 · E · Phase 6 (US3, T048-T056; T057 explicitly not attempted, needs a live deploy):
  `metagross` built the full responsive suite's Ask/Leads specs, fixed a real gap (`CrmSyncStack`'s
  existing DLQ+alarm construct never actually had `alarmEmail` set, so its SNS topic never
  existed), added the `RoofingCrm` dashboard + a citation-groundedness alarm. 30 infra tests pass
  (+2), `cdk synth --strict` independently re-verified clean. Committed `9176d08`.
- 2026-10-24 · E · Phase 7 (US5, T058-T059; T060 pending Phase Z): `audino` re-diffed every screen.
  8 pre-existing screens: zero new drift (git diff confirms only the `/ask` route+nav touched
  them). Ask screens: fixed a real gap (the "How I read this" plan summary was on the wire but
  never rendered) plus copy alignment; deferred with concrete reasons (not force-fixed) anything
  that would reopen ADR-06's accepted outcome-state set or need a backend contract change the
  story didn't build (bulk lead confirm, interactive place-correction chips, exact rate-limit
  countdown). Committed `d471573`. **All 5 user stories' buildable code is now implemented.**
- 2026-10-24 · E · Phase N (`/simplify`): 4 parallel review agents over the full diff, 13 bounded
  fixes applied (deduped `isConditionalCheckFailed`/`mapIndexNotReady`/`causeWithCode`, a real
  efficiency fix replacing two independent full-table-scan `tcadId` lookups with one indexed
  `getPropertyByRequestIdentifier`, `loadConfig`'s fail-fast contract restored, zod unified to
  3.25.76 workspace-wide). **One finding deliberately not auto-fixed, flagged to the user**: the
  altitude review found `runAgent.ts` makes one `generateText` call with tools always available,
  while `contracts/agent-api.md` describes a separate plan call (Zod-validated, one repair retry)
  → a code-enforced scope short-circuit → only then tool calls → compose. The one-call design has
  no room for a repair retry, and the "no tool calls on an out-of-scope question" guarantee is
  currently only a system-prompt instruction, not code-enforced. All downstream tests pass because
  they're scripted to match the one-call mechanism, not because the mechanism matches the
  contract. This is a real design decision, not a style fix. Committed `23e26ff`.

- 2026-10-24 · F · **User decision:** fix the agent-loop architecture finding properly (not leave
  as-is). `ash` rebuilt `runAgent.ts`/`composeAnswer.ts`/`agent.ts`/`tools.ts` to match ADR-06 §§4-6.3
  exactly: a real plan call (no tools passed, Zod-validated against the full `QueryPlan` schema,
  one repair call on failure) → a **code-enforced** scope gate (not a prompt instruction —
  `runAsk`'s own control flow structurally cannot reach a tool call or the compose model on any
  branch but in-scope, proven by a new test asserting the mock model's `doGenerate` was called
  exactly once and the fake index's search methods were never invoked) → deterministic dispatch on
  `QueryPlan.intent` (code decides which service to call, not the model) → a compose call (no
  tools). `services/agent/tools.ts`'s AI-SDK `tool()` wrappers became plain callable functions.
  Found and fixed a real latent bug along the way: `placeResolver`'s fuzzy runner-up list could
  return a same-point duplicate of an exact match as its own "runner-up," zeroing the confidence
  margin and wrongly routing an unambiguous place to `needs_clarification`. 31 shared + 166 api
  (+2 new tests: scope-gate proof, repair-retry) + 156 web tests pass, tsc clean. Committed `e96e77d`.
  **Also recorded (user, same turn): not waiting on Atlas registration, and not pursuing the
  MCP swap-back this round** — confirmed this doesn't cost assessment points (constitution B1
  allows CID-or-MCP as two sanctioned paths; already an accepted, documented, reversible
  deviation; what's scored is the real data being present, not which lookup path reached it).
  Direct-CID read is the final data path for this round. Committed `c24fd92`.

## Next step

Both open decisions from Phase N are now resolved. What's left: Phase Z (deploy, reviewer scores,
hosted Playwright/golden-query/dashboard proof) and T021/T047/T057/T060/the test-case token fill —
all blocked on data readiness, deploy, and the A-13/A-14 merge status, per your "I will inform you"
note. Stop before G7 approval, merge, push, or deploy — unchanged.

## Resume prompt (paste after `/clear`, a crash, or a new session)

```text
Resume story B-09 from inside /Users/hebagaber/Github/roofing-crm (already on branch 009-agent-hardening).
Read specs/009-agent-hardening/run-log.md FIRST — it overrides
../assessment-guide/WALKTHROUGH-B-09-agent-hardening.md wherever they conflict (three deviations listed at
the top). Then check git log and git status. Continue from "Next step" above with the same rules: cost mode,
Sonnet, one Opus use only for alakazam's agent-design consult, stop for G7 approval before merge, never
merge/push/deploy without my approval.
```
