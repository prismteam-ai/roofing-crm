<!--
Sync Impact Report
- Version: 3.0.0 → 3.1.0 (2026-10-24): B1 clarified. The CRM syncs Task A's published data (manifest + parts by CID, manifest named by `DATA_MANIFEST_CID`) into its own index; the MCP is an optional cross-check.
- Earlier: 2.0.0 → 3.0.0 (2026-10-17): Article VI redefined. Model provider is a setting: Bedrock (default) or Vercel AI Gateway (demo: embeddings now, Claude until the Bedrock quota is raised).
- Earlier: 1.0.0 → 2.0.0 (2026-10-16): Article III redefined. Region comes from config; demo deploys to eu-north-1 (region-locked AWS project), company default us-east-2.
- Earlier: 0.0.0 (template placeholders) → 1.0.0
- Added: Parts 1–3 (articles I–XXIII), Task B addendum (B1–B3), agent roster
- Templates updated: .specify/templates/plan-template.md (Kit Agent Ownership + Constitution Check),
  spec-template.md (story header), tasks-template.md (tests mandatory + Phase Z "prove on hosted runtime")
- Source: ../assessment-guide/templates/constitution.md
-->

# Roofing CRM & Lead Identification UI Constitution

The binding rules for every spec, plan, task, line of code and review in this repo. `docs/architecture-constitution.md` adds component-level decisions and is equally binding once Gate G3 approves it.

## Part 1: Engineering

### I. Outcome first
A feature is done only when it works on the **hosted** runtime (`https://crm.{domain}` or its Amplify branch URL) with real Travis County data from Task A. Working on localhost does not count as done or as evidence.

### II. TypeScript everywhere
Apps, Lambdas, CDK and scripts are TypeScript. Python is forbidden except PySpark/Glue.

### III. AWS, CDK only, region from config
CDK is the only infrastructure as code. The region is never hard-coded: CDK reads it from `CDK_DEFAULT_REGION`/`AWS_REGION`. Company default `us-east-2` (Golden Path); the demo deploy uses `eu-north-1` because the demo AWS project is region-locked, and the PR says so. In the demo, Bedrock uses `eu.` cross-region inference profiles. Every resource is tagged `project_name=roofing-crm`.

### IV. Turborepo monorepo
`apps/web` (React + MapLibre → Amplify), `apps/api` (tRPC on Lambda behind API Gateway, agent, sync job), `packages/api-client` (the only tRPC client), `packages/shared` (Zod schemas, lead rules). Never duplicate the client or the types.

### V. Zod on every input
Every tRPC procedure and agent tool validates input with Zod. No `any`.

### VI. Vercel AI SDK for every LLM call
Use `ai` with Zod tool schemas. The model provider is a setting (`AI_PROVIDER=bedrock|gateway`), never hard-coded in agent code: `bedrock` uses `@ai-sdk/amazon-bedrock` with `eu.` inference profiles (the default and Golden Path); `gateway` uses the Vercel AI Gateway built into `ai`, with `AI_GATEWAY_API_KEY` read from Secrets Manager. The demo uses the Gateway for embeddings (`amazon/titan-embed-text-v2`) and for Claude until the new account's Bedrock quota is raised. Direct provider SDKs (`openai`, `@anthropic-ai/sdk`, `@aws-sdk/client-bedrock-runtime`) are forbidden.

### VII. Queued external boundaries
The lead-index sync job and any external call use bounded concurrency, idempotency keys (`property_cid`), exponential backoff, a DLQ and one self-resolving CloudWatch alarm per DLQ.

### VIII. Observability
Every Lambda uses Powertools Logger, Tracer and Metrics, with X-Ray on and JSON logs. Business metrics: items processed, items failed, duration. No secrets or PII in logs.

### IX. Alerting
Critical failures page through PagerDuty Events API v2, or a documented substitute.

### X. Quality gates in CI
Vitest, Playwright (against the hosted URL; the config fails on localhost), ESLint, Prettier and `tsc` run in GitHub Actions. A story is done only when CI is green.

### XI. Data honesty
Every property, permit and agent answer cites its source (record, source URL, manifest CID). Missing data is shown as missing ("BBB not available"), never guessed. Assumptions are stated.

### XII. No secrets
No secrets or test passwords in Git, logs or PR bodies. Use Secrets Manager.

## Part 2: Kit-agent ownership

### XIII. Every piece of work has an owner agent
Each story's front matter names `agents.design`, `agents.builder`, `agents.reviewers`, `agents.verify` and `skills`, copied from `../assessment-guide/AGENT-MAP.md`. A story without them fails Gate G4.

**Agent roster for this repo**

| Agent | Role here | Patterns that must be visible in the code |
| --- | --- | --- |
| `metagross` | Primary builder: monorepo, CRM UI, API, auth, hosting, CI | Turborepo layout, tRPC + shared api-client, Amplify + CDK, Cognito, Powertools |
| `espeon` | Builder: lead search index from Oracle's published data (backfill + live sync) | prototype-to-production migration, historical backfill, refresh, index provenance |
| `machamp` | Builder: the sync batch job | idempotent batch, throttling, DLQ + alarm, cost control |
| `alakazam` | Builder: agent retrieval design | hybrid retrieval, confidence threshold, citations, golden-query evaluation |
| `ash` | Builder/reviewer: agent runtime | tool loop, conversation state, telemetry |
| `mew` | Design consult: lead as a lexicon domain extension | references lexicon identities instead of copying them |
| `porygon` | Reviewer: metric consistency (index count = Oracle count) | — |
| `audino` | Reviewer: UI drift from the design | — |
| `smeargle` | Tester: responsive tests at 390 / 768 / 1440 | — |

### XIV. The owner designs it
Before `/speckit-plan`, every `agents.design` agent is consulted read-only and its answer is saved word for word in `specs/{NNN-slug}/agent-design.md`. The plan's "Kit Agent Ownership" section cites it. A plan without it fails the Constitution Check.

### XV. The owner builds it
`/speckit-implement` delegates each task group to the `agents.builder` subagent, which loads its skills plus `apply-engineering-guidelines`. The code must show the patterns in the roster above.

### XVI. The owner reviews it
Before G7, every `agents.reviewers` agent scores the story read-only (0–100). The score is recorded in `docs/reviews/CR-{ID}.md`. A score under 75 blocks the merge until it is fixed or justified there.

### XVII. The toolchain matches the router
The `arceus` routing in `docs/01-intent.md` is the expected toolchain. Every agent it names owns or reviews at least one story, or is listed in `docs/kit-usage.md` as left out with a reason. Product configurer agents (`celebi`, `uxie`, `vivillon`, …) are not used: no Prism product is deployed for this task.

## Part 3: Delivery process

### XVIII. Gates
Each artifact ends at a gate (G0–G8). The `developmentsupport-*` pre-check reports gaps; the human records the decision. No `/speckit-implement` before G4, G5 and G6 pass. No merge before G7 passes.

### XIX. Traceability
Every artifact has front matter with `id` and `parent`. Every commit message starts with the story ID (`B-03: …`).

### XX. Branching
Work happens on `feature/roofing-crm`. Each story uses its own branch `NNN-slug`, merged back with `git merge --no-ff`. Nothing is committed to `main`. `docs/progress.md` is regenerated after every merge.

### XXI. Specs before code
Unknowns are written as `[NEEDS CLARIFICATION: …]`. Acceptance criteria are Given / When / Then. Tests are written first and must fail first.

### XXII. Independent tests
Test cases come from the story's acceptance criteria, not from `tasks.md`, and run against the hosted URL.

### XXIII. Defects are records
Every failing hosted test gets `docs/defects/ERR-{n}.md`. No Critical defect is open at a merge or at release.

## Task B addendum

- **B1.** The CRM syncs property and permit data from the data Task A publishes into its own index: the sync job fetches the run manifest named by config (`DATA_MANIFEST_CID`) and the parts it lists by CID, verifies them, and builds the index the CRM queries. Requests never go to Task A at run time. No catalog lookup (Atlas registration or an MCP name search) is needed to find the data. Task A's MCP is optional, for cross-checks only. No scraping, no ingestion, no access to Oracle's internal stores.
- **B2.** Leads are the CRM's own data (DynamoDB). Every lead records the source manifest CID.
- **B3.** Agent answers cite records that exist in the index. The agent never invents properties.

## Governance

This constitution overrides other practices. A plan that breaks an article either changes or records a justification in its Complexity Tracking table, which you approve. Amendments: edit this file and `../assessment-guide/templates/constitution.md` together, bump the version (MAJOR = article removed or redefined, MINOR = article added, PATCH = wording), and update the Sync Impact Report.

**Version**: 3.0.0 | **Ratified**: 2026-10-15 | **Last Amended**: 2026-10-17
