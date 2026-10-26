# CR-G3-ARD-B: metagross architecture review — Roofing CRM (ARD-B)

**Reviewer:** `soofi-xyz-team-kit:metagross` (fullstack monorepo architecture, read-only)
**Artifact reviewed:** `docs/architecture-constitution.md` v0.1 (2026-10-23), against my own consult in `docs/decisions/0000-agent-architecture.md` §§0–9, `docs/plan.md` (PROJ-B, G2 approved), and `.specify/memory/constitution.md` v3.0.0.
**Skills loaded:** `apply-engineering-guidelines`, `build-frontend-backends`.

## Score: 80 / 100

## Recommendation: **PASS, with one required fix before the G3 "Approved" decision is recorded** (the §10 NFR contradiction, finding F-1). The remaining findings (F-2…F-6) are P2 — log them in `docs/decisions/tech-debt.md` per §14 Drift handling and resolve at the owning story (B-07 for leads, B-09 for the agent, B-02 for sync) rather than blocking G3.

---

## 1. Did my D-1…D-12 decisions carry forward faithfully?

Yes, with no material drift. Point-by-point against `0000-agent-architecture.md` §0:

| Mine | Carried into ARD-B | Verdict |
|---|---|---|
| D-1 monorepo, `packages/*` | §1 style, §9 module table | Faithful |
| D-2 DuckDB over Parquet, no OpenSearch | ADR-01 | Faithful, rationale strengthened with Task A's measured numbers |
| D-3 sync job keyed by `manifest_cid` | §2.3, §8 | Faithful |
| D-4 CloudFront copy first, Filebase fallback | ADR-02 (adds Pinata as a third fallback) | Consistent — my detailed §2.2 service table already listed Pinata; my one-line D-4 was just terse, not actually narrower |
| D-5 vendor `query-core`+`contract`, digest guard | ADR-07 | Faithful, unanimous across all 4 consults |
| D-6 lead key = TCAD id, not `property_cid` | ADR-04 (overridden to mew's `{fips}:tcad:{request_identifier}` form) | Overridden — see F-2/F-3 below |
| D-7 DynamoDB transaction, duplicate refusal | ADR-04 + §12 P0-6 | Overridden in shape, preserved in intent |
| D-8 `agent.ask`, Vercel AI SDK, gazetteer, MCP optional | ADR-06 (overridden to alakazam's `QueryPlan`/`AgentAnswer`) | Overridden — see F-4 |
| D-9 Amplify + `/api/*` rewrite | §2.2, §11 | Faithful |
| D-10 Cognito SRP + JWT authorizer | §12 P0-11 | Faithful |
| D-11 all-CDK, `Crm*`/`/roofing-crm/*` naming | §9 infra row, §12 P0-8 | Faithful |
| D-12 no embeddings v1 | ADR-08 | Faithful, unanimous |

All 13 of my P0 rules (§9 of my consult) are present in ARD-B §12 (now 15, with ADR-03's owner-name rule and ADR-06's agent-never-writes rule correctly added on top). No omission there.

## 2. Are the PO's overrides (lead key, agent contract) internally consistent and buildable against my own design?

Mostly yes, but with two real gaps, not contradictions:

- **F-2 (moderate): ARD-B has no DynamoDB item-shape table for leads.** My consult's §6.4 gave a full `pk`/`sk`/attribute table for `crm-leads` (Lead/META, `UNIQ#PROP#{tcadId}`, Note, History, GSI1, `META#index`, agent counters). ARD-B's ADR-04 row describes the *replacement* model only conceptually ("gapless event-sourced history (`EVT#{sequence}`...)"; "a separate immutable record using exact `contract/v1` column names") and §6 just says "the DynamoDB lead item shapes (ADR-04)" without restating them. There is no contradiction with my §6.3 router shapes or §6.4 item shapes as written, because ARD-B simply doesn't commit to the concrete schema at all — it's one level more abstract than my own consult was. This is acceptable under constitution Article XIV (the full schema should live in mew's read-only answer, captured word-for-word in `specs/007-leads/agent-design.md` before that story's `/speckit-plan`), **but ARD-B should say so explicitly** rather than leaving a reader to assume the schema already exists. Add one sentence to ADR-04 or §6: "Full item shapes are specified at story time in `specs/007-leads/agent-design.md` (mew), not here."

- **F-3 (low): terminology mismatch, not a logic break.** §10's Lead-integrity NFR row still says "0 lost updates (stale `version` refused)" — vocabulary from my mutable-record design. ADR-04's event-sourced model (status/assignee replayed from `EVT#{sequence}`) achieves the same OCC guarantee through a sequence-number condition-write, not a `version` attribute on a mutable item. Reword to "0 lost updates (a write to an already-taken `EVT#{sequence}` is refused)" so the NFR table matches the model it's actually verifying.

- **F-4 (low): ConversationEventStore has no owner in §9.** ADR-06 introduces "`ConversationEventStore` with a DynamoDB adapter as primary" — a new concept beyond my design's lightweight `SESSION#{id}`/`LAST_QUERY` item. §9's module table doesn't say which module (`apps/api/src/services`? a new port in `packages/domain`? the same `crm-leads` table or a new one?) owns it. Not a contradiction with my §6.3/§6.4, just an un-placed new component. Flag for B-09's `agent-design.md`.

I checked specifically for contradictions against my §6.3 (tRPC router shapes) and §7.9 (CDK construct list) as the prompt asked, and found none: the router domain names (`health`, `index`, `search`, `properties`, `leads`, `agent`) in ARD-B §9 match mine exactly, and the CDK stack list (`CrmData`→`CrmSync`→`CrmApi`→`CrmWeb`→`CrmDomain`→`CrmOps`) in ARD-B §11/§2.3 matches my §2.3 deploy topology verbatim. The two overrides (lead key, agent contract) are additive/renaming changes layered onto my layout, not structural breaks.

## 3. Gaps against my §7 patterns, §9 P0 rules, §8 NFRs

- **F-1 (should-fix before "Approved"): an internal numeric contradiction in §10.** The table states its own methodology as "taking the stricter number wherever the four consults' proposed thresholds differed," but:
  - **Index cold load: ≤ 6 s** (my consult projected < 2 s) — this is the *looser* number, not the stricter one, and it directly conflicts with the very next-but-one row, **Search, API server time: cold p95 < 3 s**. My own sequence diagram (§5.1 of my consult, carried into ARD-B §2.4) shows the index download happens *inside* the same cold Lambda invocation before the query runs — so a 6 s index load cannot coexist with a 3 s cold-path API budget, which itself sits inside the 3 s end-to-end search NFR. Either the 6 s figure is a typo/wrong merge, or the "cold p95 < 3 s" row needs restating to clarify it excludes first-ever index load (a one-time warmup, not every cold start). As written, a builder implementing to spec can satisfy one and fail the other. Fix: either tighten "Index cold load" back toward 2–3 s, or explicitly scope "cold p95 < 3 s" to exclude the very first invocation per manifest.
  - **Sync duration, A-03-sized run: ≤ 5 min** (mine: < 3 min) — also loosened, though this one doesn't create a cross-row contradiction, just a drift from the stated "stricter number" rule. Low severity; note it in `docs/decisions/tech-debt.md` or correct the number.

- **F-5 (low): `docs/reuse-log.md` is missing from ARD-B entirely.** My pattern #11 ("Vendored code is visible and tested") and plan.md's RISK-07 mitigation both name `docs/reuse-log.md` as the artifact that ties every copied Task A file to its commit and sha256. ADR-07 in ARD-B describes the digest-guard *mechanism* but never names the file that records it, and §9's module table for `packages/oracle-contract`/`oracle-views` doesn't mention it either. Add one line to ADR-07 or §9 pointing at `docs/reuse-log.md` as the required provenance record — this is cheap to fix and is load-bearing for RISK-07.

- **F-6 (low): no consolidated test-pyramid or CDK-construct-pattern section.** My §7.9 (L2-first, named constructs, least-privilege `grant*`, `cdk-nag` per-stack) and §7.12 (unit → contract → concurrency → API → Playwright → `smeargle`) are each only partially recoverable from ARD-B's §10 "verification" column and §11's CI line. This is acceptable for an architecture-level document (implementation-pattern detail is `apply-engineering-guidelines`'s and the story `plan.md`'s job, not the ARD's), so I would not block G3 on it, but it's worth one cross-reference line in §7/§11 saying "detailed CDK/test patterns per `apply-engineering-guidelines` and the story's `plan.md`" so a builder doesn't have to go hunting in my original consult for them.

## 4. Is it buildable as written — can `/speckit-plan`/`/speckit-implement` proceed without further architecture clarification?

**Yes, for four of the five stories, with one caveat.** The three "Open items carried forward" are correctly scoped as Task-A follow-ups, not architecture blockers. The deferred DynamoDB/agent-contract detail (F-2, F-4) is legitimately deferred to each story's `agent-design.md` under constitution Article XIV — that's the process working as designed, not a gap in ARD-B.

The one thing I would not let a builder start B-01/B-02 against unfixed is **F-1**: a builder sizing the Lambda cold path or writing the `IndexColdLoadMs`/`SearchLatencyMs` alarm thresholds in CDK today would correctly implement two numbers that cannot both hold, and would only discover it in B-02's load test. Fix that one row before recording the G3 "Approved" decision; the rest can be logged as P2 drift and picked up at B-02/B-07/B-09 without reopening G3.

---

**Summary for the gate table:** G3-09 ("Kit reviewer read-only review done; findings resolved") should be marked ☑ once F-1 is corrected in §10; F-2 through F-6 can be recorded in `docs/decisions/tech-debt.md` per the constitution's own P2 drift-handling rule (§14) and closed out at the stories that own them (B-02, B-07, B-09), per Article XVI's "score under 75 blocks the merge" threshold — this score is 80, so none of this blocks the *merge*, only the *initial* G3 sign-off pending the one numeric fix.
