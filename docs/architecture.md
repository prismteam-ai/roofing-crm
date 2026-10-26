# Architecture

## Stack
- Vite + React + TypeScript, single static site (no server to run or pay for).
- MapLibre GL JS with OSM raster tiles (no API key).
- DuckDB-WASM in the browser queries Parquet directly (HTTP range reads).
- Leads in `localStorage` (deliberate MVP choice; later move to a small persistent store, e.g. Cloudflare D1/KV behind the Worker).
- Hosting: Cloudflare Pages free tier. A small Cloudflare Worker (`worker/`) proxies the LLM agent call so the API key never ships to the browser.

## Data flow
```
Nassau County DuckDB (sibling pipeline repo)
   | scripts/export-parquet (dev-time, local only)
   v
public/data/*.parquet  -------------->  published to IPFS (CIDs)
   |                                    |
   +------------- config.dataSource ----+
   v
Browser: DuckDB-WASM  ->  SQL over Parquet (radius, roof age, open permits)
   v
React + MapLibre UI  ->  leads in localStorage
```
`.duckdb` files and `*.parquet` are git-ignored; each developer exports locally.

## "Oracle carries no infrastructure cost"
The pipeline's output is static Parquet published to IPFS. Oracle runs no API, database server, or query service at request time: all querying happens in the user's browser (DuckDB-WASM), the site is static files on Cloudflare Pages' free tier, and data is served by IPFS gateways/pins. The only compute is the optional LLM Worker, which is outside Oracle and request-metered on the free tier.

## Config swap
`src/config.ts` exports one `dataSource` value:
- `{ kind: "local", basePath: "/data" }` -> `/data/<table>.parquet`
- `{ kind: "ipfs", gateway: "https://ipfs.io", cids: { parcels: "<cid>", ... } }` -> `<gateway>/ipfs/<cid>`

Switching is changing that one value (or `VITE_DATA_SOURCE=ipfs`). All code builds URLs through `tableUrl(table)`.

## Export script
`npm run export:parquet -- --db /path/to/nassau.duckdb` (or `DUCKDB_PATH`) runs `scripts/export-parquet.mjs`, which opens the DB read-only with the `@duckdb/node-api` package (prebuilt binaries, no compile step) and runs `COPY (SELECT * FROM <table>) TO 'public/data/<table>.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)` for each table in the contract. Output uses the same Parquet path the app will use via IPFS.

## Table contract (confirmed against the pipeline's `docs/schema.md`)
`scripts/export-parquet.mjs` builds two Parquet tables from `nassau.duckdb` (opened read-only):
- `properties` (about 422k rows): one row per property with coordinates. `lat`/`lon` come from `properties.lat/lon` (state centroid points), falling back to `polygon_lat/polygon_lon` (labelled `coord_method = parcel_polygon_centroid`); about 4k parcels with neither are dropped. Roof age comes from `property_roof_age` (`roof_age_years`, `roof_year`, `roof_age_basis`, `roof_age_confidence`, `roof_age_caveat`): the latest roofing permit when one exists, else the NSI census-block estimate. Also owner, out-of-area flag (`owner_location_class`), `ownership_signal`.
- `permits` (Oyster Bay eTRAKiT, grows as the harvest runs): `etrakit_permit_facts` joined to its unique property link and to contacts. Roofing = `is_roofing` (medium/high confidence only) with `roofing_confidence` (none/low/medium/high). Open = `is_open` / `status_class` (open, closed, void, unknown); `status_known = false` marks an unrecognized status. `years_open`, `past_expiration`, `contractor_name`, `trade_contacts`.

Radius search is plain haversine SQL on `lat`/`lon` with a bounding-box prefilter (no spatial extension).

## Known data gaps (documented, not bugs)
- **BBB:** no BBB data exists yet. `bbb_score` is a nullable column on both tables (always NULL today) and the UI shows "not available".
- **Roof age is a weak estimate:** every value is `low` confidence (NSI census-block median year built). No roofing permit has reached medium/high confidence yet, so the default "open roofing permits" view is empty and the UI offers a one-click "include low-confidence candidates".
- **Permits cover the Hicksville demo area only** (Town of Oyster Bay unincorporated blocks within 1 mile, harvest in progress); the rest of Nassau has parcels and roof estimates but no permits.
- **Ownership signal** rests on five yearly rolls (2021-2025) and cannot prove a long hold.
- **Contractors:** no separate contractor table; `contractor_name` is the permit's CONTRACTOR contact and can be a placeholder (for example "PLUMBING WORK ONLY").

## UI (phase 1)
`src/App.tsx` (state: pin, radius, roof-age threshold, permit filter) -> `src/lib/queries.ts` (DuckDB-WASM SQL) -> `MapView` (MapLibre, OSM tiles, click or drag to set the pin, GPS button), `LeadList` (aging roofs / open permits tabs), `DetailPanel` (roof age with basis and confidence, owner, permits, contractor, BBB placeholder), `LeadsView` (saved leads in `localStorage`, filters by roof age, permit status/open duration, radius). Outreach, Sales Pipeline and Reports are disabled placeholders.

## Natural-language agent and MCP access

- **In-app agent:** the browser runs the tool loop. `POST /api/agent` on a Cloudflare Worker relays each turn to Claude (`claude-haiku-5-5`); the Worker owns the model, system prompt and tool schemas and never sees property data. When Claude asks for a tool, the browser runs the matching function in `src/lib/queries.ts` against DuckDB-WASM, sends back a compact result (total count + top 15 rows), and the final rows are pushed to the map. The LLM never writes SQL.
- **MCP server (`mcp/`):** the same five tools over stdio, backed by server-side DuckDB reading the Parquet from an IPFS gateway. It runs on the user's machine, so it adds no Oracle-hosted infrastructure.
- **One contract:** tool names and params live in `shared/tools.json`; published CIDs live in `shared/data-cids.json`. Both the web app, the Worker and the MCP server read them.
- **Cost note:** the only metered resource is the LLM API key held in the Worker. The deployed Worker rejects requests with no `Origin` header or an origin outside `ALLOWED_ORIGINS`, but that alone is not sufficient defense once the URL is public -- a non-browser client can still spoof an allowed Origin. Real protection (server-side auth, per-client rate limiting, and a spend cap on the Anthropic key) is a known gap, not yet built.
