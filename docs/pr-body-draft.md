# Roofing CRM & lead identification — Cook County, IL (map, leads, RAG agent)

**Live runtime:** https://roofing-crm.108-142-177-43.nip.io (public, no credentials; each browser gets its own lead workspace)
**Demo video:** https://github.com/vsterian/roofing-crm/releases/download/demo-video-2026-11-11/roofing-crm-demo.mp4 (1:44, narration only; captions in `roofing-crm-demo.srt`; recorded against build `338ad05`; loading pauses are shortened and labelled on screen)
**Companion PR (data pipeline):** https://github.com/prismteam-ai/oracle-property-intelligence-platform-pipeline-cook-il/pull/1

## Runtime and access

| Item        | Value                                                                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRM         | https://roofing-crm.108-142-177-43.nip.io                                                                                                                                                                             |
| Credentials | none                                                                                                                                                                                                                  |
| Data        | consumed live from the pipeline's MCP (`findProperties`, `getProperty`, `getDatasetInfo`), dataset run `20261110T221716Z`, root CID `bafybeifhz5scgrouns27paizph5zpnlxhovr6vcm6skecu67msh4ffjlaq` shown in the footer |
| Build       | `/build.json` reports the deployed `338ad05`; later commits on this branch change tests and docs only. CI for the branch head: https://github.com/vsterian/roofing-crm/actions/runs/42939103500                       |

## What was built

- Map-based CRM (MapLibre, OpenFreeMap tiles) centred on Cook County; pin drop or GPS; configurable radius (0.5–10 mi).
- Filters: roof age threshold (default 15 y) with basis and confidence, open roofing permits with long-open emphasis (default ≥ 2 y, configurable), permit status and open duration.
- Property/permit drawer: address, PIN, year built, roof age basis/confidence, last sale, owner mailing with out-of-area badge, permits with status, open days, contractor name and license, BBB rating when available, source URLs and ingestion time.
- Leads: create from property or permit, status, notes, delete, filters (roof age, permit status/open duration, radius); persisted per browser workspace.
- RAG-backed agent (Vercel AI SDK, OpenAI) with geocoding, radius retrieval and hybrid filter-then-embed ranking over the kit's retrieval interfaces; answers cite PINs/permit ids and source URLs and list assumptions and missing data.
- Disabled sections for future expansion (outreach, quotes, scheduling, analytics, billing).

## Demo transcript → where to see it

| README line                           | Where                                                     |
| ------------------------------------- | --------------------------------------------------------- |
| Open centred on a county              | landing map, Cook County                                  |
| Drop a pin / GPS, set radius          | map click, GPS button, radius slider                      |
| Roofs older than the threshold        | roof-age filter, red markers, list                        |
| Open roofing permits, long-open first | permit toggle + long-open input; list sorted by open days |
| Contractor details and BBB            | property drawer                                           |
| Convert matches into leads            | "Add to leads"; Leads page                                |
| Ask the RAG agent                     | chat panel, example prompts                               |
| Filter leads                          | Leads page filters                                        |
| Disabled placeholder sections         | left sidebar                                              |

## Kit usage

`metagross`/`build-frontend-backends` (Turborepo, `apps/web`, `apps/api` tRPC router on Hono, shared packages, Zod at every boundary), `alakazam`/`build-rag-systems` (CorpusStore, EmbeddingService, RetrievalIndex, ReviewStore, TraceSink; fixtures replay test), `build-ai-agents` (tool loop, Zod tools), `use-elephant-mcp` (data only through the pipeline MCP, no direct DB or IPFS access). Deviations in `docs/kit-usage.md`: Docker on a VM instead of Amplify/Lambda (CDK stack synthesized in CI, not deployed), OpenAI instead of Bedrock, in-process retrieval instead of OpenSearch.

## Known limitations

- BBB: 21 contractors have archived A+ profiles, labelled stale with **capture date unknown** (the UI shows the contractor ingestion date separately); 129 are unavailable after the robots check was blocked. Others are unknown, never presented as current ratings.
- Open duration counts from permit issue date (sources carry no completion date). An open permit is not proof that work is unfinished today.
- Roof age is often a year-built proxy (low confidence), shown as such.
- The public demo has no login. Leads are per browser workspace, not tenant authentication. The agent has bounded demo limits (`docs/agent-controls.md`), not a billing limit.
- Verification: unit tests, build, lint and CI pass. Hosted Playwright passed 9/9 on Chromium 1440, including the canonical demo journey. A broader nine-variant run had failures that were test-harness issues (see `docs/hosted-matrix-repairs-2026-11-11.md`); targeted retests pass, but a complete clean re-run of the whole matrix is not yet recorded.
- Outbound messaging is not implemented (out of scope); the sections are shown disabled.
