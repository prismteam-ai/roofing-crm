---
gate: G3
artifact: docs/architecture-constitution.md
artifact_version: 0.1
run_date: 2026-10-23
tool: Claude
verdict: PASS
---

# Gate G3 pre-check: Architecture Approval — ARD-B

**Update, same day:** the C-03/C-08 finding below was fixed by adding a reconciling note at the top of § 4 (the package split is Article IV's `packages/shared`, divided by concern). Re-judged: both checks now PASS. Verdict updated to **PASS**.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Style and diagrams | PASS | § 1 states the style and stack; § 2 has C4-1 (context), C4-2 (container) and C4-3 (two component views: sync pipeline state machine, search/agent sequence), all in Mermaid. |
| C-02 | Decisions with rationale | PASS | § 3's table (ADR-01…08) lists options considered and rationale for every key decision, each traced to the specific kit-agent consult and the PO decision date. |
| C-03 | Boundaries | PASS (fixed) | § 4 now opens with a note reconciling the package split against Article IV before the boundary table. |
| C-04 | Integrations | PASS | § 2.2, § 7 and § 8 name every external system (Task A's CloudFront copy, Filebase, Pinata, `runs/index.json`, the MCP, Bedrock via the AI SDK, Cognito) with its failure handling (gateway fallback order, CID verification, nested timeouts, DLQ + alarm, held/quarantine states). |
| C-05 | NFRs measurable | PASS | § 10's table gives every NFR a numeric threshold and a named verification method (Playwright, Powertools metrics, golden-query Vitest, cdk-nag, `smeargle`). |
| C-06 | Deploy and rollback | PASS | § 11 names the deploy order, the Amplify/CDK strategy, and three distinct rollback paths (web, index, infra). |
| C-07 | P0 violations | PASS | § 12 lists 15 P0 rules, including the task's access boundary (#1) as the first rule. |
| C-08 | Golden Path conformance | PASS (fixed) | Same fix as C-03 resolves this. Everything else already conformed (TypeScript-only, CDK with region from config and the `eu-north-1` deviation recorded in § 13, tRPC + Zod, Vercel AI SDK with `AI_PROVIDER`, Powertools on every Lambda, queued external boundaries in § 8). |
| C-09 | No open questions | PASS | No `[NEEDS CLARIFICATION]` markers. The "Open items carried forward" section lists three genuine follow-up questions for Task A, written as plain action items, not as unresolved blockers in the architecture itself. |

## Fix list

Applied: a reconciling note was added to the top of § 4, stating that `packages/domain`, `packages/index-schema`, `packages/oracle-contract` and `packages/oracle-views` together are this project's realization of Article IV's `packages/shared`, split by concern. No other findings remain.

All 9 checks now PASS.
