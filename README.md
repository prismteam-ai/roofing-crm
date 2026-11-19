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

## Candidate submission: how to run and deploy

How to deploy the CRM, in which order with the pipeline's stacks (whose own steps are in the pipeline's runbook), run the tests and tear everything down is in [docs/runbook.md](docs/runbook.md). Where the work departs from the team kit, and why, is in [docs/kit-deviations.md](docs/kit-deviations.md). The access model and its known limits are in [docs/access-rules.md](docs/access-rules.md), and the labels used in commits and docs in [docs/glossary.md](docs/glossary.md).

Delivered: a map-based CRM on all Los Angeles County parcels (assessor's roll 2026, served by the pipeline's data API). It finds parcels from a pin or GPS within a radius and a roof-age threshold, counted from the effective roof year (the later of the year built and the year of the latest finaled roofing permit), with an optional ownership filter on three County-roll proxies, each shown with its weakness. It shows the City of Los Angeles's long-open roofing permits on parcels that pass the roof-age threshold, on the map and in a list sorted by open duration, and parcel details with their source, their permits and each permit's contractor rows for permits issued 2013-01-02 to 2023-05-19 (business name, license number and class, city, and the number of name spellings on the license when there is more than one; one identity per license number, not verified against CSLB, the Contractors State License Board). It creates and manages leads from the map, stored behind the shared token authorizer; a lead created from a permit row keeps that permit's number. The leads list shows each lead's parcel address, read from the data API while the list is open, and filters leads by lead status, by the current search, by a long-open roofing permit and by the status of the lead's own permit (the permit row it was created from). The "Ask the agent" section asks the pipeline's hosted agent about the area around the pin; the agent retrieves by tool calls over the data API and cites the records it read, with no embeddings or vector index.

The map draws at most 25,000 parcels, the nearest first (the data API's cap). When more match, it says "Map shows the nearest 25,000 of N matching parcels; the count and the list cover all N.", draws a dashed ring around the pin at the farthest drawn parcel, and says how many are left out: "N matching parcels not drawn: at or beyond the dashed ring, X.XX mi from the pin." (`apps/crm/src/beyondRing.ts`).

The leads list's "Permit status" filter offers "all permit statuses", "Open (issued)", "Open (application stage)", "Closed", "Unclear (neither open nor closed)" and "no permit on the lead". The status is not stored with a lead: it is read from the data API's permits for the lead's parcel when a status is chosen, once per lead for the page's life, with at most 4 reads in flight, shared with the address reads (`apps/crm/src/leadPermits.ts`). What it means in use:

- In the app, a lead gets a permit only when it is created from a row of the "Long-open roofing permits" list, and that list holds only permits with the status class Open (issued), so a lead's own permit is always "Open (issued)" when the lead is created. "Open (application stage)", "Closed" and "Unclear (neither open nor closed)" then list only leads whose status read failed, until a later pipeline run records another status for a lead's permit, or a lead is written to the leads API directly.
- A lead created any other way has no permit and is listed only under "all permit statuses" and "no permit on the lead": from a row of the "Results" list, from a point on the map (a click within 6 px of a drawn point, at zoom 16 or closer; any other click only moves the pin), or from a parcel in the agent's Sources. A lead that is deleted and created again from the "Leads" list also has no permit, and the leads API itself accepts a lead with or without one.
- Choosing a status can mean one read for every lead with a permit that the other filters keep, shown or not, up to the 2,000 leads the list loads.
- A read that fails is not tried again until the page is reloaded. The lead then shows "status not available" and stays listed under every status choice.

The "Long-open roofing permits" list counts only long-open roofing permits on parcels whose roof is older than the roof-age threshold (a parcel with no roof year never passes it), while the agent counts every long-open roofing permit in the radius whatever the roof age, so at the same pin and radius the agent's number can be larger.

Not done: BBB ratings (no source is loaded; the details say they are not available, and no code path shows a score), and permits outside the City of Los Angeles (the other jurisdictions keep their permits in separate systems, so coverage was traded for time; parcels there show "No permit data"). The data holds no owner names or contact details, by choice, so none are shown. A next step, not built: a density view on the map (the count and the list already cover every match).

The hosted site runs RoofingCrmWeb from b5f7b14 (the leads API's code from 284cfba) against the pipeline's data API and agent. The addresses of the two hosted sites (this CRM and the pipeline's Explorer) are given in the pull request, and their basic-auth passwords and the API token privately; none of them is in the repository. The CRM's hosted test suite (51 tests) passed 51 of 51 on 18 Nov 2026 on its third run, started right after warming the data API to three instances; that day two runs stopped before it, the first at test 37 at tablet width (no cold start was seen) and the second at test 28. Tests that wait 5 s for a mocked agent answer are shorter than the page's hold of a question (up to 20 s by design), and a data API instance starting cold took 6.6-6.9 s per request, against about 1 s warm. The cause of the two stops is not proven; this is not changed. Details in [docs/runbook.md](docs/runbook.md), section 4.

### Acceptance criteria: status

Status is delivered or partial; what is not done at all is in the "Not done" paragraph above.

| Criterion | Status | Details, and where to see it |
| --- | --- | --- |
| Default the map and search experience to a particular county, with support for exploring properties in the user’s selected area. | delivered | The map opens on Los Angeles County; a pin anywhere in the county moves the search |
| Allow users to center property search on current GPS location and/or a pin dropped on the map. | delivered | "Use my location" and a click on the map |
| Allow users to set a configurable search radius around the selected location. | delivered | The radius slider (0.25 to 10 miles) |
| Display properties within the radius that have roofs older than a configurable age threshold (default suggestion: 15 years). | delivered | The roof-age threshold (default 15), the map and the matching parcels; the rule text under the threshold. The map draws the nearest 25,000; the count and the list cover all |
| Display properties within the radius that have open roofing permits, with emphasis on permits that have remained open for an extended period. | partial | City of Los Angeles permits only; only issued roofing permits open at least the minimum (five years by default, one year at the least), and only on parcels that pass the roof-age threshold; any other open permit shows only in its parcel's details. The "Long-open roofing permits" list and the map's long-open mark |
| Show permit details in the UI, including permit status, age/open duration, contractor name, and BBB rating score when available. | partial | Contractor rows only for permits issued 2013-01-02 to 2023-05-19; BBB ratings not available, and no code path shows a score. The parcel details' permits |
| Present a browsable list of matching roofing lead candidates derived from the map/radius filters. | delivered | The matching parcels and the "Long-open roofing permits" list; a row opens its parcel |
| Support creating and managing CRM lead records from identified properties and permits. | delivered | Leads are created from parcels, including a permit's parcel, and edited and deleted; a lead created from a permit row keeps that permit's number. One lead per parcel, so two permits on one parcel cannot be two leads. The parcel details' lead editor and the "Leads" list (its Permit column) |
| Provide a RAG-backed agent that answers natural-language queries about roofing opportunities using available property and permit data. | delivered | The "Ask the agent" section. Retrieval is by tool calls over the data API with cited records, not a vector index ([docs/kit-deviations.md](docs/kit-deviations.md)); the pipeline's Explorer page and `GET /agent/warm` show the commit of the agent code the hosted agent runs. The hosted suite mocks the answer; a live question is a paid model call, checked by hand ([docs/runbook.md](docs/runbook.md), section 4) |
| Keep data gathering, ingestion, and source-system integration out of scope; consume pre-existing/available datasets. | delivered | The CRM reads the pipeline's data API only ([docs/runbook.md](docs/runbook.md)) |
| Show (disabled) sections on the CRM that would expand the product beyond the initial lead-identification workflow. | delivered | "Coming next": the disabled cards in the aside |

### Demo transcript: where each step is

| Step | Status | Where, and what is missing |
| --- | --- | --- |
| Open the CRM centered on a particular county. | delivered | The map opens on Los Angeles County |
| Drop a pin (or use GPS) and set a search radius. | delivered | A click on the map, "Use my location", the radius slider |
| Show roofs older than the age threshold (e.g., 15 years) within the radius. | delivered | The red points, the count of matching parcels and the "Results" list |
| Highlight properties with open roofing permits, prioritizing long-open permits. | partial | The map's long-open mark and the "Long-open roofing permits" list, longest open first; open permits younger than the minimum (one year at the least) are not highlighted |
| Open a selected property/permit and review contractor details and BBB rating where available. | partial | A point (at zoom 16 or closer), a result or a permit row opens the parcel details with its permits and contractor rows; BBB always reads "not available" |
| Convert one or more matches into CRM lead records. | delivered | "Create lead" in the parcel details; from a permit row the lead keeps the permit number |
| Ask the RAG agent a natural-language query for roofing opportunities in the area and show relevant results. | delivered | "Ask the agent", with the pin, radius and threshold; the answer shows its Sources and Gaps. Retrieval by tool calls. The hosted suite mocks the answer; a live question is a paid model call, checked by hand ([docs/runbook.md](docs/runbook.md), section 4) |
| Demonstrate filtering leads by roof age, permit status/open duration, and location radius. | partial | The leads list: "Leads in this search" (radius, roof age and ownership together), "Has a long-open roofing permit" (open duration) and "Permit status" (the lead's own permit). Three of the four status choices list only leads whose status read failed, until a later pipeline run records another status for a lead's permit or a lead is written to the leads API directly |
| Show disabled/placeholder sections for future CRM expansions beyond lead identification. | delivered | "Coming next" in the aside |
