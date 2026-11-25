# Roofing CRM & Lead Identification UI

**Live app (public, no login):** https://main.d3dhgfb9bfhbhb.amplifyapp.com
**Credentials:** none needed. The app gives each browser its own lead book (a random workspace id it sends with every call).
**Demo video:** _link added with the Ready for Review PR_
**Companion PR (data pipeline):** `oracle-property-intelligence-platform-pipeline-san-diego-ca`, whose MCP endpoint this app reads from: https://mywcppj2yl.execute-api.us-east-2.amazonaws.com/mcp

A map-based CRM that finds roofing leads in San Diego County, CA: drop a pin, set a radius, see roofs older than a threshold and properties with open roofing permits (long-open first), open a property for permit, contractor and licence detail, turn matches into lead records, and ask an agent in plain English.

## Decomposition

```
Outcome: a salesperson picks a point and a radius and leaves with a ranked, explained list of
         roofing leads saved as CRM records. Measured by the demo transcript below, on real
         county-scale data (1,087,462 parcels, 1,756,884 permits in three jurisdictions), on a hosted URL.
Input:   the Oracle pipeline's published dataset, reached only through its MCP endpoint.
Steps:   1 Connect   call the Oracle MCP (findRoofingLeads, getOracleProperty, queryAtlas)   move-data   code
         2 Transform validate every response against one shared schema                       check       code
         3 Model     score each candidate with plain, explained rules                        check       code
         4 Persist   save leads per browser workspace in DynamoDB                            move-data   code
         5 Inference answer natural-language questions from retrieved rows                   stare-and-compare   agent
         6 Enact     map, list, drawer, lead actions, CSV export                             move-data   code
Gates:   inputs checked at the API door by the same schemas the UI uses; MCP responses checked
         before use; every parcel number in an agent answer checked against the rows its
         tools returned (counts and wording are not machine-checked).
Owner:   one tRPC API (apps/api), one web app (apps/web); the only model call is step 5.
```

Shortest path: the CRM does not ingest, clean or store property data. That is the pipeline's job, and one boundary means one place to verify.

## Demo transcript, and where each line happens

| Transcript line                                               | In the app                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open the CRM centered on a particular county                  | Lead Map opens on San Diego County, CA with a first search already run                                                                                                                                                       |
| Drop a pin (or use GPS) and set a search radius               | Click the map, drag the pin, "Use my location", eight "Jump to" places, or type lat/lon; radius slider and number                                                                                                            |
| Show roofs older than the age threshold                       | Signal "Aged roof", threshold box (default 15); orange markers; roof age with its basis and confidence on each row                                                                                                           |
| Highlight open roofing permits, prioritizing long-open        | Signal "Open roofing permit"; ringed markers for 2+ years; "Permit open at least"; sort by open duration                                                                                                                     |
| Open a property/permit; contractor details and BBB rating     | "Details" opens the drawer: permits table with status, open duration, contractor, CSLB licence, BBB rating or the stated reason it is missing with a BBB look-up link, and the source dataset and record id for every record |
| Convert one or more matches into CRM lead records             | "Add lead" per row, "Convert selected to leads", or "Create lead from this property / permit"                                                                                                                                |
| Ask the RAG agent a natural-language query                    | "Ask the agent" tab: answer, assumptions, evidence (tool calls and SQL), result table, "Show on map"                                                                                                                         |
| Filter leads by roof age, permit status/open duration, radius | Leads view: status, roof age, has open permit, minimum open years, within X miles of the pin                                                                                                                                 |
| Show disabled/placeholder sections                            | Left nav, "Planned, not built yet": seven sections marked "Coming soon"                                                                                                                                                      |

## Run it

Requires Node 22+ and pnpm 9.

```bash
pnpm install
pnpm test          # all packages (Vitest)
pnpm typecheck && pnpm lint && pnpm build

# API on http://localhost:8787, reading the live Oracle MCP
ORACLE_MCP_URL=https://mywcppj2yl.execute-api.us-east-2.amazonaws.com/mcp pnpm --filter @roofing-crm/api dev
# Web on http://localhost:5173
pnpm --filter web dev
```

Without `ORACLE_MCP_URL` the dev API serves a clearly labelled synthetic fixture so the UI can be developed offline; the fixture is never part of a deployed build. Without a model key the agent says it is not configured and the rest of the app works.

Deploy (AWS, `us-east-2`, CDK only):

```bash
cd apps/api
npx cdk deploy -c oracleMcpUrl=https://<oracle-api>/mcp      # Lambda + HTTP API + DynamoDB + Amplify app
# model key lives in SSM SecureString /roofing-crm/anthropic-api-key, never in the repo
VITE_API_URL=<ApiUrl> VITE_AGENT_URL=<AgentUrl> pnpm turbo run build --filter=web...
# upload apps/web/dist to the Amplify app (aws amplify create-deployment / start-deployment)
```

## How it is built

```
apps/web         Vite + React + MapLibre           -> AWS Amplify
apps/api         tRPC on Lambda behind API Gateway -> CDK (apps/api/cdk)
packages/shared      Zod schemas, distance maths, lead score (one contract for UI and API)
packages/api-client  the single tRPC client
```

- **Data boundary.** `apps/api/src/data/mcpOraclePort.ts` is the only code that touches property data, and it does so through the pipeline's MCP tools. No scraping, no private copy, no direct database access.
- **Lead score.** `packages/shared/src/scoring.ts`: 0 to 100 from open-permit duration (heaviest), roof age over the threshold, roof age known from a permit, and owner occupancy. Every point has a reason the UI shows. Same input, same score.
- **Agent.** `apps/api/src/agent`: Vercel AI SDK with four Zod-typed tools (place lookup, radius lead search, property detail, one guarded read-only SELECT). "RAG" here is retrieval through typed tools and SQL, not vector search: the questions are filters over typed columns, where SQL is exact and embeddings are not. The SELECT guard lives in the pipeline (single statement, read-only, row-capped, engine file access off). After the model answers, a deterministic check flags any parcel number that no tool returned; it does not verify counts or prose. Agent calls are capped per day, per browser workspace and overall, because the endpoint is public and each answer costs tokens.
- **Leads.** DynamoDB on-demand, keyed by a random per-browser workspace id, so the app needs no login and one reviewer cannot disturb another's leads.
- **Cost when idle.** Lambda, HTTP API, DynamoDB on-demand and Amplify hosting only: nothing runs between requests.

## What is verified, and how

- `pnpm test`: shared contract and score, API (radius search, sorting, input gate, outage handling, lead lifecycle, workspace isolation, agent guards), API client, web (filters to query input, list rendering, convert to lead, disabled sections, agent panel, URL state).
- The deployed app was driven in headless Chromium through every transcript line above, with no console errors.
- The agent was asked the README-style questions against the live data; answers cite parcel numbers, permit numbers and contractors that the tools returned.

## Known limits, stated plainly

- **Permit coverage.** Permit data exists for three of the county's 19 jurisdictions: the City of San Diego, the unincorporated county and Carlsbad (a frozen 2022-2023 snapshot); the Data page lists them with counts. Elsewhere the app shows aged roofs and says that permits are not published for that city, instead of a silent zero.
- **Roof age is a proxy.** The last completed roofing permit where one exists, otherwise the assessor's effective year. Each row says which, with a confidence.
- **BBB ratings are not in the data.** There is no bulk source and BBB's terms limit copying; the UI shows the reason instead of a blank. The story puts live BBB integration out of scope.
- **Owner name and mailing address** are not in any public San Diego source; the drawer says so.
- **Decades-open permits** in county records are probably permits that were never finalled; the UI marks them as possibly stale.
- **Outbound messaging** and the seven "Coming soon" sections are placeholders, as the story asks.
- **Kit deviations, each deliberate.** No custom API domain or base-path mapping (those are tied to company accounts). PagerDuty is represented by CloudWatch alarms on function errors and on failed procedures, fanned out through an SNS topic with an email subscriber set at deploy time. The model is reached through the Vercel AI SDK with the Anthropic provider and a key in SSM, not Bedrock (a new personal AWS account has no Bedrock model access by default; the Bedrock path is one config flag: `-c agentProvider=bedrock`). The agent is a single-turn `generateText` tool loop: no Asana ingress, AgentCore memory, LangSmith or prompt caching, which the kit asks of long-lived Asana agents. Retrieval is typed tools and SQL, not OpenSearch embeddings, because the questions are filters over typed columns. The Amplify app takes a manual upload of the built bundle instead of a Git-connected build, so no GitHub token is stored. The agent call also goes through a Lambda function URL because API Gateway stops requests at 30 seconds. Interactive reads of the Oracle MCP are synchronous with a 12-second timeout and a visible retry; nothing has side effects to queue.

## AI work log (what I accepted, changed or rejected)

- Built with Claude Code driving sub-agents; I set the contract (`packages/shared`), the data boundary and the gates, and reviewed what came back.
- **Rejected:** a Python data layer (the kit standard is TypeScript; switched before code existed). A first agent draft that passed `temperature: 0` (the model rejects it; found by running against the live model, not by reading). An answer check that flagged permit numbers as unknown parcels (10 digits inside `PDS1992-C-9204551999`; fixed with a test).
- **Kit agents as reviewers.** The kit's `metagross` definition reviewed this repository read-only (66/100 before fixes) and its `slowking` definition drove the live site line by line (under Claude, not the model the definitions name). The most useful finding: `.gitignore` had `data/`, which silently excluded `apps/api/src/data/mcpOraclePort.ts`, the data boundary itself, so a clean clone would not have built while every local check passed. Fixed, and CI now runs on a clean checkout.
- **Caught on the live site:** a search in El Cajon with "Permit status: Open" returned zero. The data was right (that city publishes no permit feed) but the screen looked broken. The result now carries a coverage note and the empty state explains itself.

## Timeline (UTC, 25 Nov 2026)

| Time  | Milestone                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------- |
| 14:26 | Assignment received                                                                                   |
| 15:36 | Work started                                                                                          |
| 15:48 | Contract and API committed, tests passing                                                             |
| 16:35 | CRM running locally on the real county data through MCP                                               |
| 16:47 | API deployed                                                                                          |
| 16:50 | Web app live                                                                                          |
| 17:05 | Deployed app first verified in a browser against the demo transcript                                  |
| 17:31 | Kit-reviewer fixes deployed (tracked data port, atomic leads, agent caps, alarm, CI)                  |
| 18:45 | Independent evaluation of the live site (kit `slowking` definition); its defects fixed and redeployed |

---

# Original assignment (unchanged)

## Roofing CRM & Lead Identification UI

### Context

Roofing companies need a practical CRM for finding and qualifying residential and commercial roofing leads in their service area. The immediate requirement is a map-based CRM that helps sales teams explore local properties, surface roofs that are aging or have stalled open permits, and turn those signals into actionable outreach opportunities.

Data gathering and ingestion pipelines are covered by a separate user story and are **out of scope** for this work. This story assumes property, permit, and related enrichment data are already available for the UI and agent to consume.

### Description

Create a map-based roofing lead CRM that enables users to locate properties from their current GPS position or a pin drop on the map, set a search radius, and review candidate roofs that meet lead criteria—primarily roof age (for example, older than 15 years) and open roofing permits (especially permits that have remained open for many years).

The UI should present property and permit details, including contractor information and BBB rating scores where available. Users should also be able to query the platform in natural language through a RAG-backed agent to discover roofing opportunities (for example, “show me open roofing permits older than five years within five miles of [city xyz]”).

### Acceptance Criteria

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

### Demo Transcript

- Open the CRM centered on a particular county.
- Drop a pin (or use GPS) and set a search radius.
- Show roofs older than the age threshold (e.g., 15 years) within the radius.
- Highlight properties with open roofing permits, prioritizing long-open permits.
- Open a selected property/permit and review contractor details and BBB rating where available.
- Convert one or more matches into CRM lead records.
- Ask the RAG agent a natural-language query for roofing opportunities in the area and show relevant results.
- Demonstrate filtering leads by roof age, permit status/open duration, and location radius.
- Show disabled/placeholder sections for future CRM expansions beyond lead identification.

### Out of Scope

- Property, permit, ownership, or enrichment data collection and ingestion pipelines (separate story).
- Live BBB API integration beyond displaying scores already present in available data.
- Actual outbound messaging to property owners (can be mocked or deferred).

### Reference

- [Soofi XYZ Team Kit](https://github.com/soofi-xyz/soofi-xyz-team-kit)
- [Elephant Oracle Skills](https://github.com/elephant-xyz/skills)
