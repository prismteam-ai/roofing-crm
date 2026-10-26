---
id: VIS-B
type: vision/problem-framing
title: Roofing CRM
parent: BN-B            # the task README
project: roofing-crm
owner: HebaGaber           # PO
status: Approved             # Draft → In Review → Approved → Returned
gate: G0
version: 0.2
created: 2026-10-20
approved_by: [HebaGaber]
approved_date: 2026-10-21
---

# Intent and Evidence Model: Roofing CRM

> **How to use (you + Claude):** paste the README verbatim under *Input*. Fill every mandatory section. Anything you do not know becomes `[NEEDS CLARIFICATION: question]`; never guess. Stay at the problem level here (what and why). The *how* belongs in the plan and the architecture constitution. Run the `developmentsupport-vision` skill to draft it and the G0 pre-check to check it.

**Input (raw assignment):** see `README.md` at commit `f874802`.

## 1. Intent (mandatory)

> A **roofing sales rep** can **drop a pin (or use GPS) in Travis County, see aged roofs and long-open roofing permits within a radius, inspect permit, contractor and BBB details, turn the best matches into tracked CRM leads, and ask an agent for opportunities in plain language** so that **outreach goes to the highest-probability roofs first**.

**Task read (one sentence):** Build a hosted, map-based CRM that reads the Travis County property and permit data already published by the Oracle task (Task A) and lets a sales rep find, inspect, query and track roofing leads around a chosen point, without collecting or ingesting any data itself.

## 2. Problem statement (mandatory)

Roofing sales teams spend their outreach on properties chosen by drive-by or guesswork. The strongest signals of a roof that needs work are public: how old the roof is, and whether a roofing permit was opened and never closed. But these signals sit in separate county and city records that a rep cannot search by location, compare, or act on. Nothing ties a promising roof to a follow-up, so good leads are lost between finding and contacting them. The team needs to see these signals around the place they work, judge each candidate with its contractor and reputation context, and keep track of the ones they pursue.

## 3. Affected users and stakeholders (mandatory)

| Actor | Role | What they need from this app |
| --- | --- | --- |
| Sales rep | Primary | Find aged roofs and long-open roofing permits near a location, judge each one, and track the ones worth pursuing |
| Sales manager | Secondary (optional per task guide) | See all leads and their status across reps |
| Evaluator | Secondary | Run every README demo line on the hosted app with a test login, on real Travis County data |
| Oracle task (Task A) | Upstream data provider | Its published data is consumed read-only; the CRM never changes or bypasses it |

## 4. Evidence model (mandatory)

| Element | Content |
| --- | --- |
| Actors | Sales rep (main), sales manager (optional), evaluator using the test login |
| Workflow | Log in → map opens on Travis County → drop a pin or use GPS → set a radius → filter by roof age and permit status / open duration → inspect a property or permit (contractor, BBB) → create a lead → manage it (status, notes, owner) → ask the agent a plain-language question → open a result on the map → create a lead from it |
| Data objects | Read-only from Task A: property, roofing permit, contractor, BBB rating where available, roof-age basis. Owned by the CRM: **lead** (status, notes, assignee, source signals, history) |
| Scale signals | Source denominators measured by Task A in A-01 (`oracle-property-intelligence-platform-pipeline-travis-tx/docs/evidence/A-01-coverage.md`): TCAD 2026 certified roll **493,246 accounts** (captured 2026-10-19T21:33:41Z); Austin issued permits, Socrata `3syk-w9eu`, **2,380,725 rows** (2026-10-19T20:59:36Z, all permit types, not only roofing). Published counts: **not published yet** (Task A fills them in A-11). Permits outside Austin (22 jurisdictions): no countywide count exists. BBB roofing contractors: not counted, source blocked (HTTP 403 challenge, 2026-10-19). |
| Runtime proof | Hosted CRM with a test user; every README demo line works, in order, on real Travis County records |
| Access boundaries | **Allowed:** the CRM reads Task A's published data directly: the run manifest and the parts it lists, by CID (starting with `contract/v1`). Task A's MCP is an optional cross-check. **Forbidden:** scraping any source, re-ingesting or rebuilding a pipeline, reading Task A's internal Query DB or other internal stores, a live BBB API, sending real messages to property owners. Checked 2026-10-21: the shared Atlas MCP lists only Jackson County, FL, so the CRM reads Travis data directly from Task A's own publication. |
| Demo evidence | The README demo transcript, all 9 lines, in order (target 5–7 minutes), each linked to an evidence file in `docs/evidence/` |

## 5. Business value (mandatory)

- Value driver: revenue (more outreach lands on roofs that need work) and experience (one place to find, judge and track leads).
- Rough magnitude: the population a rep can search is the TCAD roll of 493,246 accounts (A-01). How many of these have aged roofs or open roofing permits is unknown until Task A publishes roof age and roofing permits; B-02 measures it from the published data.

## 6. High-level feasibility (mandatory)

| Concern | Finding | Blocker? |
| --- | --- | --- |
| Data availability | The CRM depends entirely on Task A. Today Task A has finished A-01 (sources) and is on A-02 (data contract); nothing is published yet. | No → build against Task A's real `contract/v1` sample once A-02 is frozen; switch to the full county when A-11 lands. Never invented data. |
| Permit coverage | Austin city permits are measurable (2.38 M rows). The 22 other jurisdictions in Travis County have no countywide count. | No → show the permits Task A publishes, for whichever jurisdictions it covers, and say in the UI which ones are covered (PO decision, 2026-10-21). |
| BBB data | BBB listings were blocked (HTTP 403 challenge) when Task A measured them, and stay blocked (PO decision, 2026-10-21). A live BBB API is out of scope by the README. | No → show the BBB rating where Task A publishes it, and "not available" with the reason otherwise (README says "when available"). |
| Access and accounts | AWS demo account (profile `assess`, region `eu-north-1`), GitHub fork and PR ready. LLM access: Bedrock is working (PO, 2026-10-21; earlier new-account quota of 0 is resolved). Vercel AI Gateway embeddings also work. | No. |
| Cost | Free plan, $120 credits until 2027-04-16; access stops when credits run out. A hosted app with near-zero idle cost is possible. | No → watch credits; check the plan state before debugging "Access Denied". |
| Time | 11 stories (B-01…B-11). Deadline: Thursday 2026-10-22 (PO, 2026-10-21). Planning (P1–P8) continues now; each build phase starts when the Task A story it copies from is done (A-03 → B-01, A-11 → B-02 full county, A-14 → B-09, A-18 → B-10; amended by the PO 2026-10-21, see `docs/plan.md`). | Risk, not a blocker: build time depends on when those Task A stories finish, and the deadline is one day away. |

## 7. Scope boundaries (mandatory)

- **In scope:** everything in the README acceptance criteria: county default and area exploration; GPS or pin; configurable radius; aged-roof results with a configurable threshold (default 15 years); open and long-open roofing permits; permit details with status, open duration, contractor and BBB where available; a browsable candidate list; creating and managing leads; a RAG-backed agent; disabled sections for future CRM features; residential and commercial properties.
- **Out of scope:** data collection and ingestion pipelines (README; Task A owns them); live BBB API integration (README); real outbound messages to owners, which are mocked or disabled (README); multi-tenant use, since the demo is one company (task guide: future work).

## 8. Evaluation points (sum = 40) = success criteria (mandatory)

Each point is an observable outcome, not a feature.

| SC | Evaluation point | Sub-weight | What proves it on the live runtime |
| --- | --- | --- | --- |
| SC-1 (B1) | **Location search.** County default, GPS or pin drop, configurable radius. | 6 | Map opens on Travis County and can be panned and zoomed to any area of it; dropping a pin or using GPS and setting 5 mi redraws the circle and the results; a GPS position outside the county says so instead of showing an empty map |
| SC-2 (B2) | **Aged-roof leads.** Configurable threshold, default 15 years. | 7 | Results show roof age, its basis and confidence, and whether the property is residential or commercial; changing 15 to 25 changes the count |
| SC-3 (B3) | **Open / long-open permits** with status, open duration, contractor and BBB. | 7 | Permit results sorted by open duration; the detail panel shows the property (address, type, roof age) and each permit's status, open duration, contractor and BBB, or "not available" with the reason |
| SC-4 (B4) | **CRM leads.** Create, list, update status and notes, no duplicates. | 8 | Convert 3 matches into leads, at least one from a property and one from a permit; change a status, add a note, reload: the changes persist; the same property cannot be added twice |
| SC-5 (B5) | **RAG agent.** Plain-language opportunity questions answered with grounded results. | 8 | "open roofing permits older than five years within five miles of Pflugerville" returns real records with citations, which open on the map or become leads |
| SC-6 (B6) | **Candidate list, filtering and the expansion surface.** Browsable list, combined filters, disabled future sections, real data scale. | 4 | A paginated candidate list shows the same matches as the map; combined roof-age + permit status / open duration + radius filter narrows both; disabled Campaigns / Estimates / Jobs / Invoices sections visible; outbound messaging, if shown, is mocked |
| | **Sum** | **40** | |

README acceptance criteria → evaluation points (full matrix in `docs/traceability.md`): AC-1, AC-2, AC-3 → B1 · AC-4 → B2 · AC-5, AC-6 → B3 · AC-8 → B4 · AC-9 → B5 · AC-7, AC-10, AC-11 → B6. Requirements stated only in the README's Context, Description and Out of Scope sections are traced as R-1…R-4 and OOS-1…OOS-3.

## 9. Assumptions and open questions (mandatory)

- ASM-1: "A particular county" is Travis County, TX, the county Task A publishes. Tested in B-01 (map default) and B-02 (data source).
- ASM-2: Task A publishes, per property, its address, its type (residential or commercial) and a roof age with its basis and confidence, and per roofing permit its status, issue date, contractor and BBB rating where available. Tested in B-02 against `contract/v1`.
- ASM-3: A permit is "open" when its source status is not final or closed, and its open duration is the time since it was issued. Confirmed against Task A's contract in B-05.
- ASM-4: One shared test login, shared privately with the PR, is enough for the evaluator. Confirmed by the PO, 2026-10-21; no self sign-up.
- ASM-5: Permit coverage is whatever Task A publishes; the CRM shows what it has and states the covered jurisdictions. Confirmed by the PO, 2026-10-21.
- ASM-6: Each build phase starts when the Task A story it copies from is done (interleaved per the playbook), not after all of Task A. PO decision 2026-10-21, amending the earlier "wait for all of Task A" rule.
- ASM-7: BBB stays blocked: no BBB source beyond what Task A publishes. PO decision, 2026-10-21.

## 10. Candidate directions (optional, not a committed design)

From the task guide's Golden Path (`../assessment-guide/reference/B-roofing-crm.md` § 3), to be decided in the architecture constitution (G3): a TypeScript monorepo with a web map UI and a serverless API, hosted at `crm.aldarraj.com`; a search index built from Task A's published files and refreshed by CID; a lead store owned by the CRM; an agent built on the Vercel AI SDK that retrieves from the same index and Task A's MCP.

## 11. Gates (assessment)

| Gate | How I will satisfy it |
| --- | --- |
| PR | PR from `HebaGaber/roofing-crm:feature/roofing-crm` to `prismteam-ai/roofing-crm:main` (never merged by me) |
| Runtime | `https://crm.aldarraj.com` (PO, 2026-10-21), which needs no local setup |
| Credentials | One shared test user, shared privately alongside the PR |
| Demo | A 5–7 minute video of the 9 demo lines, linked from the PR |

## 12. Open questions (answered by the PO on 2026-10-21)

1. Is one shared test login acceptable, or must evaluators be able to sign up themselves? **One shared login.**
2. Is it acceptable that open-permit results cover only the jurisdictions Task A publishes, with the coverage shown in the UI? **Yes: show what we have.**
3. What is the submission deadline? **Thursday 2026-10-22.**

## 13. Kit routing (arceus output, pasted)

Asked on 2026-10-20 (planning step P1), kit v0.99.1. `arceus` answered without reading `AGENT-MAP.md`. All agents are `soofi-xyz-team-kit:{name}`; every area also loads `apply-engineering-guidelines`.

| # | Area | Primary | Supporting | Skills | Invocation hint |
| --- | --- | --- | --- | --- | --- |
| 1 | Web app and API | `metagross` | — | `build-frontend-backends`, `integrate-ci-cd` (+ AWS `aws-cdk`) | `Agent(subagent_type: "soofi-xyz-team-kit:metagross", prompt: "Scaffold the roofing-crm TS monorepo: web + API on Lambda + CDK stacks, region from config, hosted at crm.{domain}")` |
| 2 | Auth | `metagross` | `klefki` (read-only, Cognito patterns) | `build-frontend-backends` (+ AWS `aws-auth`) | `Agent(subagent_type: "soofi-xyz-team-kit:metagross", prompt: "Add Cognito user-pool auth via CDK: managed login, JWT authorizer on the API, demo credentials")` |
| 3 | Lead search index from published data | `espeon` | `donphan` (contract/v1 fields and counts), `machamp` (backfill job, cost gate, idempotency) | `build-local-rag-pocs`, `build-rag-systems`, `build-batch-workflows`, `use-elephant-mcp` | `Agent(subagent_type: "soofi-xyz-team-kit:espeon", prompt: "Build the lead index from published CIDs / contract/v1 only, local POC first then CDK; no scraping or ingestion")` |
| 4 | Radius and filter search | `metagross` | `donphan` (golden queries checked against the MCP) | `build-frontend-backends`, `use-elephant-mcp` | `Agent(subagent_type: "soofi-xyz-team-kit:metagross", prompt: "Implement the radius + roof-age + permit filter API and map/list UI over the lead index, with provenance on every row")` |
| 5 | CRM leads | `metagross` | — | `build-frontend-backends` | `Agent(subagent_type: "soofi-xyz-team-kit:metagross", prompt: "Add CRM lead records (create from property/permit, status, notes) via CDK")` |
| 6 | RAG agent | `alakazam` | `espeon` (retrieval corpus), `donphan` (MCP as a tool or grounding check) | `build-rag-systems`, `build-ai-agents`, `use-elephant-mcp` | `Agent(subagent_type: "soofi-xyz-team-kit:alakazam", prompt: "Build the RAG agent over the lead index + Elephant MCP, Vercel AI SDK with the AI_PROVIDER switch, cited answers")` |
| 7 | Responsive tests | `smeargle` | `audino` (only when a test finds a UI bug) | `responsive-design-tests`, `frontend-bug-fix` | `Agent(subagent_type: "soofi-xyz-team-kit:smeargle", prompt: "Playwright responsive tests for map, list, lead detail and agent screens at mobile/tablet/desktop on the hosted URL")` |
| 8 | Observability | `metagross` | — (no dedicated agent) | `apply-engineering-guidelines` (+ AWS `aws-observability`) | `Agent(subagent_type: "soofi-xyz-team-kit:metagross", prompt: "Add Powertools logging/tracing/metrics, CloudWatch dashboards and alarms (incl. DLQ alarms) in CDK")` |

`arceus` advised against: `oracle` and the `county-*` / `onboard-county` skills (ingestion, outside the access boundary); `kangaskhan`, `blissey` (account provisioning, not app sign-in); `conkeldurr`, `uxie` (Persist platform, not the CRM's lead store).

**Comparison with `AGENT-MAP.md` § 5–6 and decisions (PO, 2026-10-20):**

| Agent | Difference | Decision |
| --- | --- | --- |
| `donphan` | Named by arceus; map used it in Task A only | Reviews B-02: confirms index count = Oracle count through the MCP |
| `klefki` | Named by arceus; not in the map | Left out: file-sharing portal builder; B-01 sign-in is a plain Cognito login by `metagross` |
| `porygon` | In the map (reviews B-02, B-11); not named | Kept: owns metric reconciliation and observability review (`unify-metrics`) |
| `mew` | In the map (designs B-07); not named | Kept: designs the lead data model (`use-neutral-lexicon`) |
| `ash` | In the map (B-09 runtime); not named, though its skill was | Kept: builds the agent runtime alongside `alakazam` |
| `arceus`, `slowking` | Whole-repo moments (P1, R6); out of the question's scope | Kept as in the map |
| skill `use-elephant-mcp` | Named by arceus; not in the map for Task B | Added to B-02 and B-09 |

Details per story: `docs/kit-usage.md`.

---

## Gate G0: Vision Approval

| # | Criterion | Status |
| --- | --- | --- |
| G0-1 | Problem stated independently of any solution | ☑ (AI: PASS) |
| G0-2 | Target users and stakeholders identified | ☑ (AI: PASS) |
| G0-3 | Business value articulated | ☑ (AI: PASS) |
| G0-4 | Feasibility checked; no unmitigated blocker | ☑ (AI: PASS, risk: deadline vs. Task A completion) |
| G0-5 | Scope boundaries (in / out) stated | ☑ (AI: PASS) |
| G0-6 | Evaluation points sum to 40, and each is observable on the runtime | ☑ (AI: PASS) |
| G0-7 | Every README acceptance criterion maps to an evaluation point | ☑ (AI: PASS) |
| G0-8 | No `[NEEDS CLARIFICATION]` markers left (or each one has been sent to the assessor) | ☑ (AI: PASS, all 3 answered by the PO) |
| G0-9 | AI pre-check (`developmentsupport-vision`): PASS, report pasted below | ☑ |

**AI pre-check report (2026-10-21, re-run on v0.2):** PASS, 8 of 8 criteria. The three open questions were answered by the PO; no `[NEEDS CLARIFICATION]` markers remain. Bedrock now works, so the agent blocker is gone. Risk on G0-4: the deadline is 2026-10-22 and building waits for Task A. No solution language in § 2; every number is sourced. Full report: `docs/gates/G0-VIS-B-precheck.md`.

**Decision:** ☑ Approved ☐ Returned · HebaGaber · 2026-10-21
