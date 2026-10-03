# Roofing CRM & Lead Identification UI

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

## Evidence for this branch

The assignment text above is unchanged. Evidence is a file on GitHub. This repository is [qschachl-creator/roofing-crm](https://github.com/qschachl-creator/roofing-crm/tree/candidate-solution), branch `candidate-solution`. The pipeline repository is [qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/tree/candidate-solution), same branch name. A partial row says, in the Evidence column, why the missing record is not in that pipeline branch.

Hosted page: [https://roofing-f1h5pe4dy-quinlen-schachle-s-projects.vercel.app](https://roofing-f1h5pe4dy-quinlen-schachle-s-projects.vercel.app). `https://roofing-crm.vercel.app` is a different application.

Demo recording: [https://youtu.be/yXGMWISy2OY](https://youtu.be/yXGMWISy2OY).

- **Met.** The linked file does this with the records that exist.
- **Partial.** The linked file does the part the records support. The same cell says why the rest could not be met.

### What you click

1. The page opens on Santa Clara County. The sidebar says “Lead Intelligence” and “Santa Clara County, California”. The map heading is “Santa Clara County”.
2. Click the map, or click “Use my location”, then choose a radius and click “Search properties”.
3. The map draws the houses returned for that circle. The parcel panel lists the houses that pass the roof-age and permit filters.
4. Click a house. The panel shows the address, APN, roof age, coordinates, permit fields, contractor, and “BBB rating unavailable”.
5. Click “Save as lead”. The house stays selected, and a card appears in the Leads box under that panel.
6. Type a question in “Ask about roofing opportunities” and click Ask. A question that names a Santa Clara city runs a radius search. A general question about the published roof ages answers without a pin.
7. Click Campaigns or Analytics. A short note opens about what a sales team would use that section for later. Click anywhere else and the note closes.

### Acceptance criteria

| Requirement in the story above | Status | Evidence |
| --- | --- | --- |
| Default the map and search to one county, and let the user explore a selected area | Met | [`src/app/layout.tsx`](src/app/layout.tsx) titles the page Santa Clara County. [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx) uses that county in the sidebar and the map heading. Search is [`src/app/api/parcels/search/route.ts`](src/app/api/parcels/search/route.ts). |
| Center search on GPS and/or a pin | Met | `useCurrentLocation` in [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx). The pin is [`src/components/PropertyMap.tsx`](src/components/PropertyMap.tsx). |
| A configurable search radius | Met | `ALLOWED_RADII` is 1, 3, 5, 10, and 25 in [`src/app/api/parcels/search/route.ts`](src/app/api/parcels/search/route.ts). The page opens on 5. |
| Houses in the radius with roofs older than a configurable age, suggested default 15 years | Partial | [`src/lib/roofAgeProof.ts`](src/lib/roofAgeProof.ts) keeps a house when `roof_age_years` is at least the selected minimum. The default control is 15 in [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx). Could not cover the county: [san-jose-reroof-roof-age.json](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/fixtures/santa-clara-permits/san-jose-reroof-roof-age.json) is the San Jose extract, and [santa-clara-limitations.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-limitations.md) records no free countywide year built. Other houses get `PENDING_ROOF_AGE_LABEL`. |
| Open roofing permits in the radius, with emphasis on permits that have stayed open a long time | Partial | [`src/lib/sanJosePermits.ts`](src/lib/sanJosePermits.ts) reads San Jose layers 7, 8, and 9. Open uses layer 8. [`src/lib/candidateList.ts`](src/lib/candidateList.ts) marks long-open at 5 years with no final date and sorts those first. Could not cover the other cities: [santa-clara-county-findings.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-county-findings.md) lists their portals and records that no harvester was added, and that several portals are not a full history. |
| Permit details: status, how long it has been open, contractor, and BBB score where available | Partial | `selectedParcelPermitView` in [`src/lib/candidateList.ts`](src/lib/candidateList.ts) shows status, duration, contractor, and `BBB rating unavailable`. Could not show a score: [santa-clara-limitations.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-limitations.md) records no free BBB file, and the permit field is the contractor name. |
| A browsable list of matching houses from the map and radius filters | Met | `mapOverlaySentence` and the parcel list in [`src/lib/candidateList.ts`](src/lib/candidateList.ts) and [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx). `PARCEL_PAGE_LIMIT` is 500 in [`src/app/api/parcels/search/route.ts`](src/app/api/parcels/search/route.ts). |
| Create and manage lead records from the houses and permits | Met | [`src/lib/savedLeads.ts`](src/lib/savedLeads.ts) stores `roofing-crm-saved-leads` in the browser, including CSV columns. The Leads panel is in [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx). |
| A RAG-backed agent that answers natural-language questions from the available property and permit data | Partial | [`src/lib/agentQuery.ts`](src/lib/agentQuery.ts) answers from the published snapshot and the permits loaded for the search. [`tests/agentQuery.test.mjs`](tests/agentQuery.test.mjs) locks those answers. Could not add facts the pipeline branch does not have: owner, sale date, year built, and BBB are the gaps in [santa-clara-limitations.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-limitations.md). |
| Keep collection and ingestion out of scope, and consume data that already exists | Met | Parcel search accepts only `lat`, `lng`, and `radiusMiles` in [`src/app/api/parcels/search/route.ts`](src/app/api/parcels/search/route.ts). Roof age is the content id in [`src/lib/roofAgeSnapshotPath.ts`](src/lib/roofAgeSnapshotPath.ts). |
| Show sections that would expand the product past lead finding | Met | `futureNote` in [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx) opens a Coming soon note for Campaigns and Analytics and closes it on the next click elsewhere. The buttons do not send a message or draw a chart. |

The five APNs with `olderThan15Years` are `duckdb.expectedApns` in [santa-clara-run-manifest.json](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/publication/santa-clara-run-manifest.json). The row fields are in [san-jose-reroof-roof-age.json](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/fixtures/santa-clara-permits/san-jose-reroof-roof-age.json). [`tests/roofAgeProof.test.mjs`](tests/roofAgeProof.test.mjs) checks the census of 6,955 parcels, 59 completed replacements, and those five. “Open roofing permits” hides a completed replacement; “All roofing permits” keeps it when the circle contains the parcel. That rule is `parcelsForPermitStatus` in [`src/lib/candidateList.ts`](src/lib/candidateList.ts).

### Demo transcript

| Step in the story above | Status | Evidence |
| --- | --- | --- |
| Open the CRM centered on one county | Met | [`src/app/layout.tsx`](src/app/layout.tsx) and the map heading in [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx). |
| Drop a pin or use GPS, and set a radius | Met | [`src/components/PropertyMap.tsx`](src/components/PropertyMap.tsx) and `useCurrentLocation` in [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx). |
| Show roofs older than the age threshold inside the radius | Partial | Same evidence as the roof-age acceptance row. Could not show a countywide list because the pipeline fixture is San Jose only. |
| Highlight open permits, and put long-open permits first | Partial | `sortParcelsLongOpenFirst` in [`src/lib/candidateList.ts`](src/lib/candidateList.ts). Could not include other cities because the pipeline findings record no harvester for them. |
| Open a property and review contractor and BBB where available | Partial | `SelectedParcelDetail` in [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx). Contractor comes from the permit. BBB could not be filled: the [pipeline limitations file](docs/limitations.md) records no free score. |
| Turn matches into lead records | Met | [`src/lib/savedLeads.ts`](src/lib/savedLeads.ts). |
| Ask the agent a natural-language question and show results | Partial | [`src/lib/agentQuery.ts`](src/lib/agentQuery.ts) and [`tests/agentQuery.test.mjs`](tests/agentQuery.test.mjs). Unanswered owner, sale, year-built, and BBB questions stop at the [pipeline limitations file](docs/limitations.md). |
| Filter by roof age, permit status or open duration, and radius | Met | The four selects in [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx). |
| Show placeholder sections for later CRM work | Met | `futureNote` in [`src/components/CrmDashboard.tsx`](src/components/CrmDashboard.tsx). |

### Records the page actually reads

| Record | Evidence |
| --- | --- |
| Parcel location | [`src/app/api/parcels/search/route.ts`](src/app/api/parcels/search/route.ts) calls dataset `ubcd-cewv` with `within_circle`. |
| Roof age | [`src/lib/roofAgeSnapshotPath.ts`](src/lib/roofAgeSnapshotPath.ts) fetches `bafybeiejbzvkke5sygftcxqj75e6peh4e44xblrfzvxa7cm53xlyi4c5ve`. That id, size 2342669, and SHA-256 `a4f4ded4ecf9c0ca2a91c961296d962f60917bd9ea09916386fb7258c7f2e05b` are the `san-jose-reroof-roof-age.json` artifact in [santa-clara-run-manifest.json](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/publication/santa-clara-run-manifest.json). |
| Roofing permits | [`src/lib/sanJosePermits.ts`](src/lib/sanJosePermits.ts). |
| Saved leads | [`src/lib/savedLeads.ts`](src/lib/savedLeads.ts). |

### Lines from the pipeline demonstration that are not acceptance criteria of this story

The pipeline story asks for six demonstration lines. This repository is the builder surface. It does not, by itself, complete the Oracle lines.

| Pipeline demonstration line | Status | Evidence |
| --- | --- | --- |
| Show the uploaded dataset through the UI | Partial | Roof age is the content id in [`src/lib/roofAgeSnapshotPath.ts`](src/lib/roofAgeSnapshotPath.ts). Parcel circles are the live county call in [`src/app/api/parcels/search/route.ts`](src/app/api/parcels/search/route.ts). Could not show owner or business rows: those fields are absent in [santa-clara-limitations.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-limitations.md). |
| Show that dataset through an agent question aimed at roofing leads | Partial | [`src/lib/agentQuery.ts`](src/lib/agentQuery.ts). Could not answer owner, sale date, year built, or BBB: [same limitations file](docs/limitations.md). |
| Show that Oracle can run without carrying the infrastructure cost | Met | [santa-clara-run-manifest.json](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/publication/santa-clara-run-manifest.json) stores the content ids and `duckdb.roofsOlderThan15Years` plus `duckdb.expectedApns`. There is no hosted database in this repository. |
| Show public content-id publication with an artifact manifest and a second independent gateway | Partial | The same manifest lists Filebase and Pinata under `independentGatewayChecks.gateways`, with matching SHA-256 values. Could not use the two example gateways: `independentGatewayChecks.notUsed` records HTTP 429 or 403 from `ipfs.io` and `dweb.link` on 2026-10-02. This page requests the Filebase URL in [`src/lib/roofAgeSnapshotPath.ts`](src/lib/roofAgeSnapshotPath.ts). |
| Confirm the candidate did both the Oracle work and the builder work | Partial | Pipeline files linked above are the published archive record. This repository’s files linked above are the map, list, leads, and question box. Rows the pipeline branch could not fill stay partial for the source reason in [that limitations file](docs/limitations.md). |
| Pass the demo on real uploaded Santa Clara records | Partial | The roof-age artifact in the manifest is the Santa Clara file this page loads. Could not fill owner, sale date, or BBB from an upload: the [limitations file](docs/limitations.md) says those free sources do not contain them. |

## Limitations

The same text is in [docs/limitations.md](docs/limitations.md).

A gap on the page is a record the pipeline branch does not contain. Each reason below is a file in that GitHub branch: [candidate-solution](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/tree/candidate-solution).

### Roof age

[san-jose-reroof-roof-age.json](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/fixtures/santa-clara-permits/san-jose-reroof-roof-age.json) is the San Jose re-roof extract. [santa-clara-limitations.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-limitations.md) records 6,955 parcels, 59 completed replacements, and five roofs at 15 years or older, and records that public GIS has no year built. San Jose’s year-built file is for large buildings, and year built is not a roof date.

### Permits outside San Jose

[santa-clara-county-findings.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-county-findings.md) lists the other city portals and records that no harvester was added. There is no single county permit archive. Unincorporated Accela is an application intake. Campbell and Monte Sereno are marked without historical records. Gilroy’s online file starts 2023-06-19. Sunnyvale’s portal splits around 2024-10-07. Mountain View’s older permits are in person. Saratoga’s portal is account-oriented. San Jose is the published roofing extract.

### BBB rating

[santa-clara-limitations.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-limitations.md) records no free BBB bulk file. The official API needs approval and does not allow public display of complaints. A contractor name on a San Jose permit is not a score.

### Owner, ten-year hold, and out-of-area owner

The [same limitations file](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-limitations.md) records a null owner name. Public GIS `ubcd-cewv` has no owner, mailing address, or sale date. The free Assessor sheet omits the assessee name under Government Code 6254.21 and prohibits resale. The Clerk-Recorder index has been offline since 2018. The paid Secured Master File was not purchased. BizFile does not collect property owners, and an unattended request returns Incapsula.

### Example IPFS gateways

[santa-clara-run-manifest.json](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/publication/santa-clara-run-manifest.json) records Filebase and Pinata under `independentGatewayChecks.gateways`. `independentGatewayChecks.notUsed` records HTTP 429 or 403 from `ipfs.io` and `dweb.link` on 2026-10-02.
