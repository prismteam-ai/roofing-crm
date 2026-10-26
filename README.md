# Roofing CRM & Lead Identification UI

## Live deployment

- **App:** https://roofing-crm-4wv.pages.dev
- **Agent backend (Cloudflare Worker):** https://roofing-crm-agent.edgararrizon.workers.dev (called by the app; not meant to be opened directly)
- **MCP server:** stdio, run locally with `cd mcp && npm install && node server.mjs` (see `mcp/README.md`) — reads the same published Parquet directly from IPFS, no separate hosting needed.
- **Data source:** the app and MCP server both read from IPFS CIDs published by the sibling pipeline repo (`shared/data-cids.json`), not from any server this repo runs.
- **Local dev:** `npm install && npm run dev` (map/leads UI against local Parquet) — see `docs/architecture.md` for the full stack and `worker/README.md` / `mcp/README.md` for running the agent and MCP server locally.

## Context

Roofing companies need a practical CRM for finding and qualifying residential and commercial roofing leads in their service area. The immediate requirement is a map-based CRM that helps sales teams explore local properties, surface roofs that are aging or have stalled open permits, and turn those signals into actionable outreach opportunities.

Data gathering and ingestion pipelines are covered by a separate user story and are **out of scope** for this work. This story assumes property, permit, and related enrichment data are already available for the UI and agent to consume.

## Description

Create a map-based roofing lead CRM that enables users to locate properties from their current GPS position or a pin drop on the map, set a search radius, and review candidate roofs that meet lead criteria—primarily roof age (for example, older than 15 years) and open roofing permits (especially permits that have remained open for many years).

The UI should present property and permit details, including contractor information and BBB rating scores where available. Users should also be able to query the platform in natural language through a RAG-backed agent to discover roofing opportunities (for example, “show me open roofing permits older than five years within five miles of [city xyz]”).

## Acceptance Criteria
- Default the map and search experience to a particular county, with support for exploring properties in the user’s selected area.
- Allow users to center property search on current GPS location and/or a pin dropped on the map.
- Allow users to set a configurable search radius around the selected location.
- Display properties within the radius that have roofs older than a configurable age threshold (default suggestion: 15 years).
- Display properties within the radius that have open roofing permits, with emphasis on permits that have remained open for an extended period.
- Show permit details in the UI, including permit status, age/open duration, contractor name, and BBB rating score when available.
- Present a browsable list of matching roofing lead candidates derived from the map/radius filters.
- Support creating and managing CRM lead records from identified properties and permits.
- Provide a RAG-backed agent that answers natural-language queries about roofing opportunities using available property and permit data.
- Keep data gathering, ingestion, and source-system integration out of scope; consume pre-existing/available datasets.
- Show (disabled) sections on the CRM that would expand the product beyond the initial lead-identification workflow.

## Demo Transcript
- Open the CRM centered on a particular county.
- Drop a pin (or use GPS) and set a search radius.
- Show roofs older than the age threshold (e.g., 15 years) within the radius.
- Highlight properties with open roofing permits, prioritizing long-open permits.
- Open a selected property/permit and review contractor details and BBB rating where available.
- Convert one or more matches into CRM lead records.
- Ask the RAG agent a natural-language query for roofing opportunities in the area and show relevant results.
- Demonstrate filtering leads by roof age, permit status/open duration, and location radius.
- Show disabled/placeholder sections for future CRM expansions beyond lead identification.

## Out of Scope
- Property, permit, ownership, or enrichment data collection and ingestion pipelines (separate story).
- Live BBB API integration beyond displaying scores already present in available data.
- Actual outbound messaging to property owners (can be mocked or deferred).

## Known limitations
- **Worker auth is partial.** `worker/src/index.ts` rejects requests with no `Origin` header or one outside
  `ALLOWED_ORIGINS`, which blocks the simplest bypass (a bare script/curl call), but a non-browser client can
  still spoof an allowed `Origin` header and reach the API-key-backed endpoint. A real fix needs server-side
  authentication, per-client rate limiting, and a spend cap on the Anthropic key -- not yet built.
- **Long agent conversations can hit the 40-message Worker cap** with no trimming or recovery path; a user
  mid-conversation who hits it has to start a new chat.
- **Switching from the agent tab to the map tab loses the chat history** (state lives inside `AgentView` and
  unmounts on navigation); it would need to move up to a parent component to persist across tabs.
- **`mcp/test/smoke.mjs` hardcodes exact row/permit counts** tied to one past pipeline run; it will need
  updating (or a tolerance check) whenever the published dataset changes.

## Kit usage

Same note as the sibling pipeline repo: this app was hand-built rather than through
`soofi-xyz-team-kit`'s own skills. The ones that looked relevant on inspection:

- **`apply-engineering-guidelines`** -- the team's Golden Path standards (TypeScript, the
  Vercel AI SDK for LLM calls, AWS as the primary cloud, CDK as the only permitted IaC tool,
  PagerDuty/Lexicon-backed observability). This app follows the TypeScript-and-structured-tool-
  calling spirit of that guideline, but runs on Cloudflare Workers/Pages rather than AWS+CDK --
  a deliberate choice to keep this take-home's infrastructure cost at zero, not an oversight.
- **`frontend-bug-fix`** / **`responsive-design-tests`** -- both require a Figma design source
  (`test/design` references) and an existing Playwright/Asana-integrated harness that this repo
  doesn't have; there's no design file this UI was built against to compare against or test.

Given the gap between what the kit assumes (an AWS-hosted service with Figma-sourced design
tests and Restate/Lambda-backed data workers) and what this scoped take-home needed (one cheap,
deployable, demonstrable app on real Nassau County data), I prioritized a working deployed
product over retrofitting kit tooling built for a different stack and a different kind of task.

## Reference
- [Soofi XYZ Team Kit](https://github.com/soofi-xyz/soofi-xyz-team-kit)
- [Elephant Oracle Skills](https://github.com/elephant-xyz/skills)
