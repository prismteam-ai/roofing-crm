# RAG fixtures (Alakazam local replay)

Lee-only corpus and golden queries for local OpenSearch + SAM replay. This layout is **not** a production Chester index and does not claim live Chester retrieval.

## Layout

| Path                          | Role                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `corpus/*.jsonl`              | Property / permit chunks with `sourceUri` = `elephant://lee/property/{id}`        |
| `queries/*.json`              | Golden questions + expected chunk ids / source URIs                               |
| `corpus/latest-manifest.json` | Persisted indexer freshness (`indexedAt`, counts, `corpusSource`) for `agent.ask` |

## Local OpenSearch + seed

```bash
docker compose -f fixtures/rag/docker-compose.yml up -d

pnpm --filter @roofing-crm-challenge/api rag:seed-local
```

`rag:seed-local` reads `fixtures/rag/corpus/*.jsonl` and upserts into `roofing-opportunity-chunks` on `http://127.0.0.1:9200`.

## SAM replay (CDK synth output)

```bash
cd apps/api/cdk
npx cdk synth

sam local invoke -t cdk.out/RoofingCrmRagStack.template.json RoofingOpportunityAgentReplay \
  -e ../../../fixtures/rag/queries/golden-lee-aging-roofs.json
```

Golden events may use `question` + `countyHint`; the replay handler normalizes them to `agent.ask` input.

## Production path

- `RoofingCrmRagStack` — managed OpenSearch domain (org SCP denies AOSS), S3 corpus bucket, daily indexer (fixture-first by default), SAM replay Lambda
- `RoofingCrmApiStack` — `agent.ask` on the existing tRPC Lambda with `OPENSEARCH_ENDPOINT` + Bedrock IAM when RagStack is wired

## Build-time data staging (read-only)

Radius search consumes published county Parquet **without** running ingestion in this repo:

| Artifact                                | Staged at                                                      | Consumed by                               |
| --------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `fixtures/rag/corpus/*.jsonl`           | CDK RagStack bundling                                          | RAG indexer / `agent.ask`                 |
| Lee `lee-query-table.parquet` (~229 MB) | `apps/api/Dockerfile.lambda` (`LEE_QUERY_TABLE_URL` build arg) | `search.inRadius` via elephant-mcp DuckDB |

Local dev without Docker still serves `agent.ask` from the in-memory Lee fixture corpus.
