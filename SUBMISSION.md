# Roofing lead CRM: submission

**Live runtime:** https://tb4l7kn2kahnystt4xxhil43zu0wdxxa.lambda-url.us-east-2.on.aws/ (AWS Lambda in us-east-2, public, no login)

**Demo video:** https://github.com/jacksonkr/roofing-crm/releases/download/demo-video-2026-11-17/roofing-crm-demo.mp4 (3 min 21 s; on-screen captions, no narration; recorded by script against the live site on 2026-11-17)

The assignment is in [`README.md`](./README.md). This file explains what was built, how to
check it, and where it falls short.

## What it does

A salesperson drops a pin (or uses their location) in Miami-Dade County, sets a radius, and
gets two lists: properties with aging roofs, and roofing permits that were never closed out.
They open a property to see its owner, roof basis and permit history, save the promising
ones as leads, and work those leads through a pipeline. An assistant answers the same kind
of question in plain language.

The CRM ingests nothing. Every property and permit comes from the companion pipeline's MCP
endpoint ([Miami-Dade Oracle pipeline](https://github.com/prismteam-ai/oracle-property-intelligence-platform-pipeline-miami-dade-fl)),
which serves a published, content-addressed snapshot of county records. The only data the
CRM owns is its lead records.

```
Browser ──▶ Lambda function (Next.js: pages + API)
              ├── /api/search, /api/property, /api/places ──▶ Oracle pipeline MCP endpoint (tools/call)
              ├── /api/leads ───────────────────────────────▶ DynamoDB table (workspace, leadId)
              └── /api/assistant ──▶ model (Vercel AI SDK) ──▶ Oracle MCP tools + lead tools
```

## Acceptance criteria: where each one stands

| Criterion | Status | Where to see it |
|---|---|---|
| Map defaults to a particular county | Met: Miami-Dade, centred on downtown Miami | Lead finder |
| Centre on GPS location or a dropped pin | Met: "Use my location", click the map, or go to a city by name | Lead finder |
| Configurable search radius | Met: 0.1 to 25 miles | Lead finder |
| Roofs older than a configurable threshold (default 15) | Met. Roof year comes from a completed roof permit where one exists, else year built; the basis is shown on every row | "Older roofs" list |
| Open roofing permits, emphasising long-open ones | Met: longest open first, with a minimum-years-open filter | "Open roofing permits" list |
| Permit status, age, contractor name, BBB rating | Met except the BBB rating itself: status, open duration, contractor, licence number and Florida state licence standing are shown. **BBB ratings are not in the source data** (BBB's pages refuse automated requests). Where exactly one BBB profile has the contractor's name, the row links to that profile so the rating is one click away | Permit rows and property details |
| Browsable list of candidates from the map filters | Met: both lists, plus markers on the map | Lead finder |
| Create and manage CRM lead records | Met: add from either list or through the assistant; change status and priority, add notes, filter, remove. Stored in DynamoDB | Leads |
| RAG-backed agent for natural-language queries | Met, with a note on what "RAG" means here: the assistant retrieves records by calling the pipeline's search tools and the CRM's lead tools, then answers from them and shows every record it retrieved. There is no vector index, because the questions are about structured records | Assistant |
| Ingestion out of scope; consume available datasets | Met: all data arrives through the pipeline's MCP endpoint | `lib/oracle.ts` |
| Disabled sections for future expansion | Met: Outreach, Estimates, Scheduling, Invoicing, Team and territories, Reports | Left navigation |

## Demo walkthrough

Each step of the assignment's demo transcript:

1. **Open the CRM centred on a county:** the lead finder opens on Miami-Dade.
2. **Drop a pin or use GPS, set a radius:** click the map, or type a city and press Go; change "Radius (miles)".
3. **Roofs older than the threshold:** press "Find leads here"; the left list and amber markers.
4. **Open roofing permits, long-open first:** the right list and red markers; raise "Permit open at least (years)".
5. **Open a property or permit:** press "Details" for owner, roof basis, permit history, contractor and licence.
6. **Convert matches into leads:** press "Add lead" on either list, then open "Leads".
7. **Ask the assistant:** "Assistant", first example: open roofing permits older than five years within five miles of Hialeah.
8. **Filter by roof age, permit status or duration, and radius:** the controls above the map, including contractor licence standing and owner location.
9. **Future sections:** the disabled items under "Not in this release".

## Check it yourself

```bash
BASE=https://tb4l7kn2kahnystt4xxhil43zu0wdxxa.lambda-url.us-east-2.on.aws

# Candidates within 2 miles of central Hialeah: roofs over 15 years, permits open 5+ years
curl -s "$BASE/api/search?lat=25.8727&lon=-80.3079&miles=2&minRoofAge=15&minYearsOpen=5"

# Leads are scoped to a workspace ID that the browser generates
curl -s -H "x-workspace: any-16-plus-char-id" "$BASE/api/leads"
```

## Run it locally

Requires Node 22.18 or later.

```bash
npm ci
npm run dev        # http://localhost:3000
```

With no configuration it talks to the hosted pipeline and keeps leads in memory. Set
`GOOGLE_GENERATIVE_AI_API_KEY` for the assistant, `LEADS_TABLE` to use a DynamoDB table, and
`ORACLE_URL` to point at a different pipeline deployment.

## Deploy to AWS

One CDK stack in `infra/`: a Lambda function built from the `Dockerfile`, a public function
URL, a DynamoDB table for leads, and a one-week log group. The function may read and write
that one table and read one encrypted SSM parameter (the model key).

```bash
cd infra && npm ci
npx cdk bootstrap          # once per account and Region
npx cdk deploy             # prints the public URL
```

The table bills per request. The only thing that runs while idle is a five-minute schedule that
keeps two function instances ready, so a visitor does not wait for a cold start; it stays well
inside Lambda's free allowance, and setting `keepWarmInstances` to 0 in `infra/bin/app.ts` removes it.

## Known limits

- **BBB ratings are not available.** BBB's profile pages refuse automated requests, so the
  pipeline loads only which profiles exist. The CRM links a contractor to its BBB profile when
  exactly one profile has its name (about 4 in 10 roofing contractors); this is a name match,
  not a confirmed identity. Florida state licence standing is the contractor-quality signal.
- **County permits only, from 2020.** Municipal building departments keep their own systems,
  so a permit can be at most about seven years old.
- **"Open" is derived.** The county publishes no permit status. A permit is treated as open
  when it has no certificate and its last inspection was not approved, or it was never
  inspected. The label on each row says which.
- **Most roof ages rest on year built**, because completed roof permits only go back to 2020.
- **No sign-in.** Leads are scoped to an unguessable workspace ID kept in the browser, which
  separates demo visitors but is not access control.
- **Assistant speed varies** (about 4 to 20 seconds) with the free model tier.

## Engineering standards followed

TypeScript throughout, Zod for every input, the Vercel AI SDK for all model calls, AWS Lambda
and DynamoDB in us-east-2 defined with CDK, Vitest, and GitHub Actions for checks. Which
team-kit rules were followed and which were not, with reasons, is in
[`docs/kit-usage.md`](./docs/kit-usage.md).

## Repository layout

```
app/            pages, components and API routes
lib/            oracle.ts (pipeline MCP client), leads.ts (lead storage), assistant.ts
infra/          AWS CDK app: Lambda function, function URL, DynamoDB table
Dockerfile      the container image the function runs
```
