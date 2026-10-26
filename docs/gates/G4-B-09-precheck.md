---
gate: G4
artifact: stories/B-09-agent-hardening.md
artifact_version: expanded (AC-1..AC-8, Release fold-in, data switch, native-build deviation)
run_date: 2026-10-24
tool: Claude
verdict: PASS
---

| # | Check | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Front matter | PASS | id/parent FEAT/eval_point/priority/moscow/branch/status filled. `agents.*` and `skills` match AGENT-MAP.md §5 row for B-09 exactly (design: alakazam, ash, smeargle, porygon; builders: alakazam, ash, metagross; reviewers: alakazam, ash, metagross, audino, porygon). `depends_on` trimmed to only B-07 (actually done); A-13/A-14 moved to `depends_on_deferred` with named deviations — see C-10. |
| C-02 | User story form | PASS | "As a sales rep... so that" + evaluator clause present; independent test stated. |
| C-03 | GWT | PASS | AC-1..AC-8 all Given/When/Then. |
| C-04 | Observable + real | PASS | AC-1..6, AC-8 observable on hosted runtime with real Travis County data (Run 2 manifest, 441,961 properties/15,025 permits). AC-7 observable via the index's `manifestCid` on the hosted API/UI, read directly from Task A's published manifest (constitution B1, ARD-B §7). |
| C-05 | Scale + honesty | PASS | AC-4 (scale, p95/golden queries) + AC-3 (missing-data honesty, ZIP 99999). |
| C-06 | Testable | PASS | Each AC has an unambiguous observable outcome. AC-8's "fixed or explicitly deferred with a reason" is bounded by the audit log file, not left open-ended. |
| C-07 | Edge cases | PASS | 23s abort state; low place-resolution confidence. |
| C-08 | Requirements traced | PASS | FR-001..008 and NFR-001 each trace to an AC; NFRs have numeric thresholds. |
| C-09 | Prototype | PASS | Links `design/screens/CrmAsk390/*` etc. with states listed. |
| C-10 | Ready | PASS (with documented deviation) | **Finding:** Task A A-13 is still `status: Draft` and A-14 is still `status: Ready` (not Done) in the oracle pipeline repo — confirmed by reading `stories/A-13-explorer-and-pages.md`/`A-14-agent-and-mcp.md` front matter there; no `agent.ask.ts`, `getModel.ts`, breakpoints config, `tablet.css`/`compact.css` exist yet to copy. **Resolution (user-approved 2026-10-24):** build these natively inside roofing-crm this round as an accepted deviation, recorded in `reuses` with an explicit swap-back condition the user will flag once A-13/A-14 actually merge. This satisfies "stubbed with real [sample] data" in spirit — it's a real, working native build, not a stub — and keeps the story unblocked without waiting on a dependency outside this story's control. |
| C-11 | Slicing | PASS | One primary eval point (B5) + one secondary (B6); 1.5 days; vertical slice (agent + hardening + data + UI gap fix end-to-end). |

**Verdict: PASS, 0 FAIL.**

## Fix list
None blocking. One thing to track to closure, not before merge:
1. When the user confirms Task A A-13/A-14 have merged and published, reconcile roofing-crm's natively-built agent runtime and responsive config against them (expected: no architecture change, same ADR-06 contract).

Record your Ready decision and date in the story's Gate G4 table, and add this gate's row to `docs/traceability.md`.
