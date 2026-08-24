# Data provenance — roofing CRM

This document states what is **sourced from Elephant** vs **labeled synthetic demo**
signals published by the elephant-pipeline under the `chester-demo` dataset key.

## Dataset keys (never share a key)

| Key            | Meaning                                                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chester`      | Limited but **real** Chester County records (42 of 73 munis). No published roof ages; permits are UCC candidates vs county GIS health/planning — **0 roofing-classified**.                          |
| `chester-demo` | Same geography with **labeled** synthetic roof ages (`built_year_source = synthetic_demo`) and ~500 synthetic roofing permits (`source_system = chester_synthetic_demo`, ids `SYNTHETIC-CHESTER-`). |
| `lee` / others | Official Oracle catalog counties (Lee remains available as fallback).                                                                                                                               |

Demo tables are **only** served under `chester-demo`. Never under unsuffixed `chester`.

## Sourced (real)

| Signal                      | Source                                                  | Notes                                                                                        |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Chester parcels / centroids | Published query table for `chester` / `chester-demo`    | 87,274 properties; 84,086 geocoded                                                           |
| Real Chester permits        | `queryPermits` over `chester` / non-synthetic demo rows | 2,630 rows; classify by `improvement_type` prefixes (well / sewage / Act 247 / SmartGov UCC) |
| Lee parcels / permits / BBB | Elephant MCP when Lee is selected                       | Lee may still use API synthetic fallback when flags lack detail                              |

## Labeled synthetic (chester-demo only)

| Signal                  | Detection                                                                    | UI                                                    |
| ----------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| Roof age / `built_year` | `built_year_source = 'synthetic_demo'`                                       | Drawer year caption + territory banner                |
| Roofing permits         | `source_system = 'chester_synthetic_demo'` or id prefix `SYNTHETIC-CHESTER-` | “Synthetic demo roofing” on permit rows               |
| Contractor / BBB        | Published contractor roster JSON                                             | Mapped by `contractor_name` on synthetic permits only |

Verbatim badge from the pipeline contract:

> Synthetic demo signal — clearly labeled for evaluation.

## API-invented details (Lee only)

When Lee query-table flags say permits/BBB exist but consolidated JSON times out,
`properties.get` may still return `permitDetailsSource: synthetic_demo` with
`SYNTHETIC-` ids. **This path never runs for `chester` or `chester-demo`** —
Chester empties are the honest answer; demo signals come from published tables.

## Lead provenance (weakest input)

A lead built on any synthetic signal is stamped `provenanceTier: "synthetic_demo"`
at creation and keeps that tier through status changes. `leadScore` is recomputed
server-side via shared `scoreLead()` — never trusted from the client.

## Never invented

- Close dates for ranking (null stays null unless published)
- BBB when no roster match / no `has_bbb_contractor`
- Permit rows when `has_permits` is false
- Full-county Chester claims (coverage remains 42 of 73)

## Operator-side artifact staging (not runtime API fetches)

These steps download published handoff artifacts once; the hosted API reads bundled
or S3-staged copies instead of calling IPFS/Filebase at request time.

| Artifact                                         | Staged where                                                                                              | Verification                                                     | Why                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Chester demo contractor roster (`QmQCY…`)        | `fixtures/chester-demo/contractor-roster.json` bundled into the Lambda image                              | Immutable JSON from elephant-pipeline handoff                    | Drawer BBB lookup without runtime gateway fetch                                                         |
| Chester demo RAG corpus (`QmY9S…`, ~61 MB JSONL) | `s3://<RagCorpusBucket>/chester-demo/corpus.jsonl` via `just stage-demo-corpus`                           | Byte length `61_273_152` + SHA-256 recorded in manifest metadata | RagIndexer reads S3; operator CLI may download from the published URL once                              |
| Lee property query table (~229 MB Parquet)       | `/var/task/data/lee-query-table.parquet` via `apps/api/Dockerfile.lambda` build arg `LEE_QUERY_TABLE_URL` | Size > 200 MB + `PAR1` magic bytes                               | Avoid 30–90 s cold IPFS/httpfs opens inside MCP DuckDB; same published IPNS the MCP child would resolve |

MCP overlay maps in `elephant-mcp-env.ts` remain the approved read path for structured
`queryProperties` / `queryPermits` — they configure the `@elephant-xyz/mcp` child, not
direct browser or API gateway access.
