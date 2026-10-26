---
gate: G1
artifact: docs/feature-list.md
artifact_version: 0.2
run_date: 2026-10-21
tool: Claude
verdict: PASS
---

# G1 pre-check: FL-B (Roofing CRM feature list)

Inputs read: `docs/feature-list.md`, `docs/01-intent.md` (VIS-B v0.2, approved), `README.md` (`f874802`), `docs/traceability.md`, `.specify/memory/constitution.md`. The pre-check reports gaps only and never approves.

**Verdict: PASS (10 of 10 checks).** Re-run on v0.2 after § 4.6 "Reuse from Task A", A-5 and DEP-07 were added (no FEAT rows changed). Three warnings below; none blocks G1.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | ID format | PASS | 15 unique IDs, FEAT-B01…B15, no gaps. B01…B11 match stories B-01…B-11. B12 (Could) and B13…B15 (Won't) have no story yet; this is deliberate and noted under the registry, as the template asks for deferred scope to be recorded as Won't. |
| C-02 | Description quality | PASS | All 15 descriptions are one sentence, 9–19 words (counted by script), each with a concrete subject and an observable action. |
| C-03 | MoSCoW and eval point | PASS | Every row has both. Split: 11 Must, 0 Should, 1 Could, 3 Won't. |
| C-04 | Classification | PASS | 12 Feature, 3 Project. Project rows have no UI of their own: B02 (index), B14 (no BBB API), B15 (single county and tenant). |
| C-05 | No duplicates | PASS | No two rows cover the same capability. Closest pair: B10 ("Outreach as disabled") and B13 (Won't: "Real messages … are not sent; Outreach stays a disabled section"). B10 builds the section; B13 records what is deferred. Also distinct: B04 (map results by age) vs B08 (list with combined filters). |
| C-06 | No vague verbs | PASS | No "manage", "handle" or "support" in any description. The only hits are the noun "manager". |
| C-07 | Vision traceability | PASS | Every row cites VIS-B; B12…B15 cite the exact section (§ 3, § 7). |
| C-08 | Scope alignment | PASS | No Must or Could contradicts README Out of Scope or OS-01…OS-04. The README's three out-of-scope items are recorded as B13, B14 and OS-01, and B02 consumes data instead of ingesting it. |
| C-09 | README coverage | PASS | 11 of 11 acceptance criteria and 9 of 9 demo lines have a FEAT in `docs/traceability.md`, as do R-1…R-4 and OOS-1…OOS-3. Uncovered lines: none. |
| C-10 | NFRs | PASS | NFR-01…NFR-08 each have a threshold or a pass/fail test (p95 times, $10 alert, alarm per DLQ, zero calls outside the boundary, `smeargle` pass, CI green). No Must contradicts them. See warning 1. |

## Warnings (not failures)

1. **NFR-02 zero idle cost vs. FEAT-B02 index.** The NFR is fine, but it constrains B-02's design: a search service with a minimum hourly charge (for example OpenSearch Serverless) would break NFR-02 and use up the $120 credit quickly. Record the index choice against NFR-02 in the architecture constitution (G3).
2. **Constitution IX (alerting) has no NFR.** Critical failures must page through PagerDuty "or a documented substitute". NFR-03 covers alarms but not who gets paged. Add the substitute (for example email via SNS) to NFR-03 or to the architecture constitution.
3. **Constitution article VI is out of date.** It says the demo uses the Gateway for Claude "until the new account's Bedrock quota is raised". Bedrock works as of 2026-10-21 (PO), and FL-B C-2 says so. Update article VI so the constitution and the feature list agree before G3.

## Fix list (by impact on the assessment score)

1. Warning 1: decide the index technology against NFR-02 at G3. It affects cost, B-02 and the access-boundary points.
2. Warning 3: align constitution VI with "Bedrock works". The evaluator reads the constitution.
3. Warning 2: name the paging substitute in NFR-03.

When you record the G1 decision, tick the G1 checklist in `docs/feature-list.md`, add your decision and date, and set the Decision cell of the G1 row in the `docs/traceability.md` gate log.
