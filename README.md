# Roofing CRM & Lead Identification UI

> **Reviewers:** start at [Implementation (this repository)](#implementation-this-repository): demo
> video, hosted app, how to run it.

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

## Reference
- [Soofi XYZ Team Kit](https://github.com/soofi-xyz/soofi-xyz-team-kit)
- [Elephant Oracle Skills](https://github.com/elephant-xyz/skills)

---

## Implementation (this repository)

> **Hosted:** https://main.dvy80s6giizfb.amplifyapp.com — public; every browser gets its own demo
> workspace with seeded leads (no sign-in). It reads the hosted Oracle
> (https://jbahdp5wn5czd3bj2trxjjz6ha0tfyzg.lambda-url.us-east-2.on.aws/) on run 2.
> Deployment: [`deploy/README.md`](deploy/README.md).

### Review it in five minutes

1. **Watch the demo video:**
   [crm-demo.mov](https://drive.google.com/file/d/1ZK21als5zp0HEr8Z7B8wLdpp7Je7qzk-/view?usp=drive_link).
2. **Open the hosted app:** https://main.dvy80s6giizfb.amplifyapp.com. There's no sign-in; each
   browser gets its own workspace, with three seeded leads.
3. **Follow the demo script:** [`docs/DEMO.md`](docs/DEMO.md) walks every README demo step.
   - **Search:** search `Fort Lauderdale` and set the radius to 5. Untick **Open roofing permits**
     to see aged roofs, then tick it again for long-open permits.
   - **Detail and leads:** click an address for detail, tick two rows, then **Convert to leads**.
   - **Agent:** ask the assistant, for example "open roofing permits older than five years within
     five miles of Fort Lauderdale".
   - **Leads page:** filter by roof age, permit open years and distance.

A map-based lead CRM for **Broward County, FL**, reading one published, immutable data run from the
Oracle ([`oracle-property-intelligence-platform-pipeline-broward-fl`](https://github.com/shengda/oracle-property-intelligence-platform-pipeline-broward-fl)).
The CRM never reads source data directly: it calls the Oracle's HTTP API and MCP endpoint, pinned
to one manifest CID, and keeps only its own leads (DynamoDB).

| Part | What it does |
|---|---|
| `apps/web` | React + Vite + MapLibre (OpenFreeMap tiles): map, filters, candidates, detail, leads, agent panel |
| `apps/api` | tRPC router (local server and AWS Lambda), the per-browser demo workspace, `POST /agent` |
| `packages/oracle-data` | Oracle HTTP client: search, details, lead scoring; refuses rows of another run |
| `packages/leads-db` | DynamoDB leads: one active lead per property per workspace, status lifecycle, notes, stale flags |
| `packages/agent` | Vercel AI SDK tool loop over the Oracle's read-only MCP tools, with a per-IP and daily budget |
| `e2e/demo.spec.ts` | The demo transcript below, in a normal browser and in a grader-like one (no WebGL, no GPS) |

**Data run:** Oracle run 2, manifest `bafkreiaw4jf6xzwtgpcfadnu7vbwpwpshbv7qz2hflapksf5m4rzl4dsby`
(766,044 properties; 7,949 roofing permits). Limits of this run, also shown in the app's run banner:

- **Permits cover Fort Lauderdale and Weston only.** Other cities show roof age only, and the UI
  names them. Fort Lauderdale's permit layer stopped updating in January 2021, so its "open"
  statuses are as of then; a permit "open 8 years" may have closed since.
- **No BBB grades.** BBB refused automated access (HTTP 403) and the Oracle did not bypass it, so
  every BBB field is empty and the detail view says "No BBB data".
- **Contractors** are named on about 29% of open permits (Fort Lauderdale's layer has no
  contractor field; names come from a bounded license lookup).

### Run it locally

Requirements: Node 22, pnpm 9, Docker (DynamoDB Local), and the Oracle repository checked out
next to this one.

```bash
# 1. The Oracle, serving the published run (in the Oracle repo)
./bin/oracle.mjs serve --manifest bafkreiaw4jf6xzwtgpcfadnu7vbwpwpshbv7qz2hflapksf5m4rzl4dsby   # :4317

# 2. Leads database
docker run -d --rm --name crm-dynamodb -p 8001:8000 amazon/dynamodb-local:2.5.4 -jar DynamoDBLocal.jar -inMemory -sharedDb

# 3. This repo
pnpm install
cp .env.example .env            # set ORACLE_MANIFEST_CID (above); ANTHROPIC_API_KEY for the agent
pnpm --filter @crm/api db:create
pnpm --filter @crm/api dev      # API on :4318
pnpm --filter @crm/web dev      # web on http://localhost:5318
```

Without `ANTHROPIC_API_KEY` everything works except the agent, which says it is not configured.

### Checks

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test                        # unit and integration tests (DynamoDB Local via testcontainers)
pnpm --filter @crm/web build && pnpm --filter @crm/web exec vite preview &   # :5318
pnpm e2e                         # demo transcript in both browser profiles (uses installed Chrome)
BASE_URL=https://<hosted-url> pnpm e2e
```

See [`docs/DEMO.md`](docs/DEMO.md) for the demo script.
