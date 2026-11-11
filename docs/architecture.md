# Roofing CRM — architecture

Map-based roofing lead CRM for Cook County, IL. Consumes a pre-built property/permit dataset
(separate pipeline story) through an MCP server, stores CRM leads locally, and exposes a RAG agent.

```
apps/web  (React 18 + Vite + MapLibre)  ──tRPC over HTTP──▶  apps/api (Hono + tRPC, port 8080)
                                                              ├─ DatasetClient
                                                              │   ├─ McpDatasetClient  → pipeline MCP (streamable HTTP, bearer)
                                                              │   └─ FixtureDatasetClient → fixtures/dataset/*.json
                                                              ├─ LeadsRepo (better-sqlite3, data/leads.sqlite)
                                                              └─ Agent (Vercel AI SDK, gpt-4.1-mini) + packages/rag retrieval
packages/shared      Zod contracts (property, permit, contractor, lead, search, agent) + geo/ranking helpers
packages/api-client  tRPC client factory + per-browser workspace id
packages/rag         CorpusStore / EmbeddingService / RetrievalIndex / ReviewStore / TraceSink interfaces + in-memory/JSONL impls
packages/tsconfig    shared tsconfig bases
fixtures/            deterministic dataset (300 rows) and RAG replay corpus/queries
```

## Run

```bash
pnpm install
pnpm dev                      # api on :8080 (tsx watch) + web on :5173 (proxy /trpc)
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm e2e                      # Playwright against built api+web, fixture dataset, offline agent
docker compose up --build     # single container on :8080, env from .env, leads/traces in ./data
```

Env (see `.env.example`): `OPENAI_API_KEY` (agent + embeddings; empty = offline templated agent),
`PIPELINE_MCP_URL` + `MCP_HTTP_AUTH_TOKEN` (empty = fixture dataset), `PORT`, `LEADS_DB_PATH`,
`TRACE_DIR`, `AGENT_MODE=offline` to force the no-LLM path.

## Data access

`DatasetClient` (`apps/api/src/dataset/client.ts`) is the only seam to the dataset. Both
implementations return the same Zod-validated shapes. The pipeline MCP implements exactly:

| tool             | input                                                                                                        | output                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `findProperties` | `{lat, lon, radiusMiles, minRoofAge?, openRoofingPermitsOnly?, minOpenDays?, sort?, minConfidence?, limit?}` | `{properties: [property + permits[+contractor]], total_in_radius, source: {runId, rootCid, syncedAt}}` |
| `getProperty`    | `{pin14}`                                                                                                    | `{property \| null, source}`                                                                           |
| `queryDataset`   | `{sql, limit}` (read-only)                                                                                   | `{columns, rows, truncated}`                                                                           |
| `getDatasetInfo` | `{}`                                                                                                         | `{runId, rootCid, counts, limitations}`                                                                |

`findProperties` semantics (mirrored by the fixture client): exact radius plus every supplied roof-age, confidence and permit predicate. With a roof-age threshold, unknown ages and invalid anchors are excluded. `openRoofingPermitsOnly` additionally requires a dated open roofing permit satisfying `minOpenDays`. `total_in_radius` counts properties after all filters and before LIMIT; the UI displays the matching count, capped at300 visible rows.

The API requests `sort=roof_age` (or `open_days` with the open-permit toggle), `minConfidence` and the display limit from the pipeline MCP. SQL applies confidence/roof/permit predicates and global ordering before LIMIT, so far-away qualifying properties cannot be hidden by a nearest-500 pre-cap. Counts reflect all matching properties before the display limit. The CRM preserves the MCP order. Deploy the additive pipeline contract before this CRM version; the previous strict MCP rejects unknown ranking fields.

The Zod contracts are tolerant of the pipeline: `z.object` strips unknown columns (pin10, geohash6,
distance_miles, run_id, ...), `is_out_of_area`/`address` are nullable, `roof_age_basis` includes
`new_construction_permit`, `bbb_state` includes `stale`. `fixtures/dataset/live-sample.json` holds
rows captured from the live MCP and is parsed in `apps/api/src/dataset/mcp.test.ts`.

The MCP client retries with backoff/jitter (`withRetry`), bounds concurrency (p-limit 4) and
reconnects on failure. Results are validated with the same Zod schemas on receipt.

## Leads

SQLite table `leads`, status constrained to `new|contacted|qualified|lost`, unique on
`(workspace_id, pin14, permit_id)` so re-adding is idempotent. Every request carries
`x-workspace-id`; the web app generates it once into `localStorage`. No auth beyond that —
it is a per-browser sandbox, not a tenant model.

## Agent

`apps/api/src/agent/agent.ts`. Two modes, same contract (`AgentAnswer`: answer, citations,
assumptions, missingData, traceId, mode):

- **llm**: `generateText` (Vercel AI SDK, `gpt-4.1-mini`) with tools `geocode_place`
  (Nominatim, UA header, 1 concurrent, cached), `find_properties` (DatasetClient →
  `packages/rag` hybrid retrieval → cited evidence rows) and `summarize_area`. Up to 6 steps.
  Citations are derived from evidence actually mentioned in the final text.
- **offline** (no key or `AGENT_MODE=offline`): deterministic parse of the question
  (radius, years, place via a small gazetteer), same retrieval, templated answer. Used in tests
  and e2e so CI never touches the network. The answer says so in "Missing data".

Retrieval is "filter first, then embed": the properties for the area are turned into property and
permit summaries (`propertyToDocs`), metadata-filtered (roof age / open / open days), capped to the
strongest 300 structured candidates, embedded (`text-embedding-3-small` via `embedMany`, or a
hashed fake embedding offline) and ranked by cosine. Every answer is traced to
`data/traces/YYYY-MM-DD.jsonl` (question → retrieval/tool → answer).

## Web

No router/state library: hash routes (`#/`, `#/leads`), React state, tRPC vanilla client. Map is
MapLibre GL with OpenFreeMap "liberty" vector tiles (no key). First load searches a default centre
(Evanston, 2 mi) so markers appear immediately; a note says so until the user drops a pin, picks one
of the 12 hardcoded Cook County places (`PLACES` in `packages/shared`) or geocodes free text / a ZIP
through `meta.geocode` (offline gazetteer first, then Nominatim). "Lowest roof-age confidence" is a
server-side predicate on `roof_age_confidence` applied before the cap. The Cook County boundary is a dashed line layer from
`apps/web/src/data/cook-county.json` (US Census TIGERweb State_County layer, GEOID 17031, fetched
2026-11-11 and Douglas-Peucker simplified to ~5 KB). The top bar shows the dataset run id and root CID
("pending" until the pipeline reports one). Markers are coloured by lead signal
(red = open roofing permit, orange = roof over threshold, grey = other match). The footer always
shows dataset run id, root CID, record counts, in-radius count, lead count, agent mode and build
commit. Disabled sidebar sections are real disabled buttons with a `title`/tooltip.

## Observability

pino JSON logs with a request id per HTTP request (`x-request-id` echoed), agent trace id per
question, no secrets (authorization headers redacted).

## Limitations (honest)

- Fixture dataset is synthetic (seeded); `rootCid` is null until the pipeline publishes a run.
- `queryDataset` is a no-op on the fixture client (no SQL engine in the API; the pipeline owns DuckDB).
- Offline agent is template-based, not an LLM; its parsing covers the demo phrasings, not arbitrary English.
- No BBB live lookups; the UI shows the rating the dataset carries or "BBB: not available".
- Workspace id is a sandbox, not authentication.
- Single container, SQLite file in a volume: fine for a demo VM, not horizontally scalable.

## Runtime refinements from the first hosted evaluation

The embedding service uses a process-local LRU cache capped at 2,000 vectors. Keys include the provider model and exact document text: unchanged area evidence can be reused across questions, while changed content or model is embedded again. Failed/incomplete provider responses are not cached. The cache is lost on restart, retains no disk copy, and returns vector copies to protect later retrieval from caller mutation.

At widths up to 768 px the order is search controls, map, candidates, then chat. At desktop widths the property drawer leaves the chat column exposed; focusing chat closes the drawer. Long permit identifiers wrap, and deleting a lead requires confirmation.
