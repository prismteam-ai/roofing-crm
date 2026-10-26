---
gate: G4
artifact: stories/B-02-lead-index.md
artifact_version: "git 58451b4 (Round 1 decisions), status Draft"
run_date: 2026-10-23
tool: Claude
verdict: FAIL
---

# G4 pre-check: B-02 Build the lead search index from Task A's published data

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Front matter | PASS | All fields filled. agents (alakazam, espeon, machamp / espeon, machamp / espeon, alakazam, machamp, porygon, donphan) match AGENT-MAP.md line 369. Skills match that line plus `apply-engineering-guidelines`, which the CLAUDE.md rule requires. Wording: `status: Draft` is stale for a story that has been built and reviewed; set it when the user records the decision. |
| C-02 | User story form | PASS | "As the CRM / I want / so that" present; independent test present. |
| C-03 | GWT | PASS | AC-1 to AC-4 are all Given / When / Then. |
| C-04 | Observable and real | PASS | ACs use the deployed `eu-north-1` pipeline, the real Travis manifest CID and the `donphan` MCP check. Note: the evidence doc records that the MCP cross-check could not run because Travis County is not yet published to the MCP. That is an evidence gap, not a story wording gap. |
| C-05 | Scale + error | PASS | Scale: AC-2. Missing-data: AC-3. |
| C-06 | Testable | PASS | AC-2 now has the 0.1% bound from the Round 1 decision, which matches constitution §10. AC-3 names the exact `missing` reason. |
| C-07 | Edge cases | PASS | Two edge cases: sha256 failure (quarantine, no partial promotion) and a >5% row-count drop (hold for review). |
| C-08 | Requirements traced | PASS | FR-001 to FR-004 each trace to an AC. NFR-001 and NFR-002 have numeric thresholds (5 / 30 min; concurrency 2, 30 req/min). Wording: their "Traces to" column names ARD-B §10, and the AC-1 link appears only in the text. Put "AC-1" in that column. |
| C-09 | Prototype | N/A | `ui: false`. |
| C-10 | Ready / dependencies | FAIL | B-01 is merged (docs/progress.md). The story's depends_on says Task A A-02 and A-11 are "done", but cites no commit or CID for either. docs/plan.md EXT-01 and EXT-03 still read "Pending". Real published data does exist (manifest CID `bafkreiasyc…`, and `contract/v1` vendored at be925c5 per docs/reuse-log.md), so G4-8's "real sample data" route is available. Fix: cite the Task A evidence in depends_on, and refresh plan.md EXT-01/EXT-03. |
| C-11 | Slicing | PASS | 1.5 days, at the upper limit. Infrastructure-only (no UI), with eval points B2, B3 and B6 noted as the data foundation. |

Wording fixes (no meaning change):
- `ARD-01` and `ARD-08` in the Context and Out of scope sections match no identifier in docs/architecture-constitution.md. The constitution uses `ADR-01` to `ADR-08`; ADR-08 is the no-embeddings decision.

**Verdict: FAIL (1 FAIL: C-10).**

## Fix list (by impact on score)

1. C-10: cite the Task A commit or CID for A-02 and A-11 in depends_on, and update plan.md EXT-01 and EXT-03.
2. C-08: put "AC-1" in the Traces-to column for NFR-001 and NFR-002.
3. Wording: change `ARD-01` and `ARD-08` to `ADR-01` and `ADR-08`; set `status` to match the story's actual state.

Not approved. The user records the decision.
