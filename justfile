# Roofing CRM — local dev, checks, deploy, and RAG helpers
#
# Web:  http://localhost:5173
# API:  http://127.0.0.1:2022  (local tRPC; leads in process memory)
# RAG:  agent.ask uses in-memory Lee fixtures by default; `just dev-opensearch` uses Docker OpenSearch on :9200
#
# Usage: just --list
# Stop:  just stop  (Vite :5173, API :2022, Docker OpenSearch)

web_pkg := "@roofing-crm-challenge/web"
api_pkg := "@roofing-crm-challenge/api"
cdk_dir := "apps/api/cdk"
rag_compose := "fixtures/rag/docker-compose.yml"
golden_query := "fixtures/rag/queries/golden-lee-aging-roofs.json"
opensearch_endpoint := "http://127.0.0.1:9200"
web_port := "5173"
api_port := "2022"
aws_region := "us-east-2"
amplify_app_id := "d1bpqan659uzbk"
amplify_branch := "feature/foundation"
amplify_origin := "https://feature-foundation.d1bpqan659uzbk.amplifyapp.com"
default_api_url := "https://zhkfpw8iak.execute-api.us-east-2.amazonaws.com"

default:
    @just --list

# Install workspace dependencies (Node 22+, pnpm 9.15)
install:
    pnpm install

# Full stack: Vite SPA + local tRPC API (Turbo)
dev:
    pnpm dev

# SPA only — map UI with in-memory demos if API is not running
dev-web:
    pnpm --filter {{web_pkg}} dev

# Local tRPC API only (port 2022; agent.ask from Lee fixture corpus in-memory)
dev-api:
    pnpm --filter {{api_pkg}} dev

# Local tRPC API with hybrid retrieval against Docker OpenSearch (run `just rag-setup` first)
dev-api-opensearch:
    OPENSEARCH_ENDPOINT={{opensearch_endpoint}} pnpm --filter {{api_pkg}} dev

# OpenSearch up + seeded + SPA/API; agent.ask uses local OpenSearch hybrid index
dev-opensearch: rag-setup
    OPENSEARCH_ENDPOINT={{opensearch_endpoint}} pnpm dev

# Start Docker OpenSearch, seed fixtures, then run SPA + API (in-memory agent; no OPENSEARCH_ENDPOINT)
dev-rag: rag-setup dev

# Stop Vite (:5173) and local tRPC API (:2022) if running
stop-dev:
    #!/usr/bin/env bash
    set -euo pipefail
    for port in {{web_port}} {{api_port}}; do
      pids=$(lsof -ti :"$port" 2>/dev/null || true)
      if [ -n "$pids" ]; then
        echo "Stopping process(es) on port $port: $pids"
        kill $pids 2>/dev/null || true
      else
        echo "Nothing listening on port $port"
      fi
    done

# Stop local dev servers (web + API) and Docker OpenSearch
stop: stop-dev rag-opensearch-down

# Lint + format check entire monorepo
lint:
    pnpm lint

# Typecheck entire monorepo
typecheck:
    pnpm typecheck

# All package tests
test:
    pnpm test

# Web design tests (jsdom; no MapLibre)
test-design:
    pnpm --filter {{web_pkg}} test

# API unit tests
test-api:
    pnpm --filter {{api_pkg}} test

# Hosted Amplify browser smoke (Playwright; live API + RAG required)
test-browser:
    pnpm --filter {{web_pkg}} test:browser

# Lint + typecheck + test (pre-deploy gate)
check: lint typecheck test

# Production builds (Turbo)
build:
    pnpm build

# Amplify SPA build only
build-web:
    pnpm --filter {{web_pkg}} build

# Preview production web bundle (run `just build-web` first)
preview:
    pnpm --filter {{web_pkg}} preview

# Point local Vite at a hosted execute-api URL (copies .env.example → .env.local)
dev-hosted api_url:
    cp apps/web/.env.example apps/web/.env.local
    @echo "VITE_API_URL={{api_url}}" > apps/web/.env.local
    pnpm --filter {{web_pkg}} dev

# --- RAG (local OpenSearch + golden replay) ---
#
# Onboarding — two data planes, one product:
#
#   Map + structured search (search.inRadius, properties.get)
#     → reads live published county rows via @elephant-xyz/mcp only (never IPFS/Neon/explorer URLs).
#
#   Natural-language agent (agent.ask)
#     → hybrid retrieval over a *copy* of those same published records indexed into OpenSearch
#       (BM25 + vectors + metadata filters). Citations must be parcels the map could return.
#
# Local dev (no AWS):
#   - `just dev` / `dev-api`: agent.ask uses in-memory Lee fixtures (fixtures/rag/corpus/*.jsonl).
#     Map search can use Lee stand-ins unless ROOFING_CRM_ELEPHANT_MCP=1.
#   - `just dev-opensearch` / `rag-setup`: Docker OpenSearch on :9200 + fixture seed — exercises the
#     same hybrid retrieval code path as production without Bedrock/AOSS.
#   - `rag-replay`: SAM local invoke of the agent Lambda against golden query JSON (CI/regression).
#
# Deployed (AWS us-east-2):
#   - RoofingCrmRagStack: managed OpenSearch domain + S3 corpus bucket + RagIndexer Lambda + daily
#     schedule. (Serverless AOSS is SCP-denied in this org, so the stack uses a single m6g.large
#     domain — smallest non-t node that supports the k-NN plugin.)
#     Indexer re-reads published Elephant MCP rows (Lee demo radius) into OpenSearch; not county ingest.
#   - RoofingCrmApiStack: tRPC Lambda gets OPENSEARCH_ENDPOINT when RagStack is wired; agent.ask is
#     indexed: false until the indexer has run at least once. `just deploy-api` runs the indexer
#     automatically after deploy so this can't be forgotten.
#   - To deploy Api without Rag (agent stays not-indexed):
#       SKIP_RAG_STACK=1 npx cdk deploy RoofingCrmLeadsStack RoofingCrmApiStack
#
# See docs/ARCHITECTURE.md (RAG contract) and fixtures/rag/README.md.

# Start local OpenSearch for hybrid retrieval (port 9200)
rag-opensearch-up:
    docker compose -f {{rag_compose}} up -d

# Stop local OpenSearch
rag-opensearch-down:
    docker compose -f {{rag_compose}} down

# Wait until OpenSearch responds on :9200 (needed right after docker up)
rag-opensearch-wait:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Waiting for OpenSearch on {{opensearch_endpoint}}..."
    for _ in $(seq 1 60); do
      if curl -sf "{{opensearch_endpoint}}" >/dev/null 2>&1; then
        echo "OpenSearch is up."
        exit 0
      fi
      sleep 2
    done
    echo "OpenSearch did not become ready in time." >&2
    exit 1

# Upsert fixtures/rag/corpus/*.jsonl into local OpenSearch (OpenSearch must be up)
rag-seed:
    pnpm --filter {{api_pkg}} rag:seed-local

# Stage Chester demo RAG corpus JSONL into the RagStack S3 bucket (operator-side download)
stage-demo-corpus:
    #!/usr/bin/env bash
    set -euo pipefail
    bucket="$(aws cloudformation describe-stacks --stack-name RoofingCrmRagStack --region {{aws_region}} \
      --query "Stacks[0].Outputs[?OutputKey=='RagCorpusBucketName'].OutputValue" --output text)"
    if [ -z "$bucket" ] || [ "$bucket" = "None" ]; then
      echo "RoofingCrmRagStack not deployed or RagCorpusBucketName missing." >&2
      exit 1
    fi
    RAG_CORPUS_BUCKET_NAME="$bucket" pnpm --filter {{api_pkg}} rag:stage-demo-corpus

# Start OpenSearch, wait for health, and seed the Lee fixture corpus
rag-setup: rag-opensearch-up rag-opensearch-wait rag-seed

# CDK synth (Leads + Rag + Api stacks)
cdk-synth:
    cd {{cdk_dir}} && npx cdk synth

# SAM replay: RoofingOpportunityAgent Lambda against a golden query JSON
rag-replay query="{{golden_query}}":
    cd {{cdk_dir}} && npx cdk synth RoofingCrmRagStack
    cd {{cdk_dir}} && sam local invoke RoofingOpportunityAgentReplay \
        -t cdk.out/RoofingCrmRagStack.template.json \
        -e ../../{{query}}

# Golden replay: open roofing permits case
rag-replay-permits:
    just rag-replay query=fixtures/rag/queries/golden-lee-open-permits.json

# --- Deploy (CDK us-east-2) ---
#
# Stacks (see apps/api/cdk/bin/app.ts):
#   LeadsStack  — DynamoDB lead records (only write model in this app).
#   RagStack    — OpenSearch Serverless + S3 corpus + indexer (optional if SCP blocks AOSS).
#   ApiStack    — Docker Lambda tRPC + API Gateway; consumes Elephant MCP + optional OpenSearch.
#                 Lee property Parquet is downloaded at image build (LEE_QUERY_TABLE_URL in
#                 apps/api/Dockerfile.lambda) so radius search avoids cold IPFS opens.
#
# Slowking / demo runtime is Amplify URL + execute-api URL — not localhost.
# Full operator sequence: docs/DEPLOY-AMPLIFY.md
# One-shot hosted deploy (API + CORS + Amplify SPA + warmups): `just deploy`

# Hosted execute-api URL from RoofingCrmApiStack (no trailing slash)
api-url:
    #!/usr/bin/env bash
    set -euo pipefail
    url="$(aws cloudformation describe-stacks --stack-name RoofingCrmApiStack --region {{aws_region}} \
      --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)"
    if [ -z "$url" ] || [ "$url" = "None" ]; then
      echo "{{default_api_url}}"
    else
      echo "$url"
    fi

# Full hosted deploy: check → CDK (Leads + Rag + Api w/ Amplify CORS) → RAG indexer → Amplify SPA → warmups
deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    just check
    echo "=== CDK: Leads + Rag + Api (CORS → {{amplify_origin}}) ==="
    cd {{cdk_dir}} && AMPLIFY_WEB_ORIGIN={{amplify_origin}} npx cdk deploy \
      RoofingCrmLeadsStack RoofingCrmRagStack RoofingCrmApiStack \
      --require-approval never
    just stage-demo-corpus
    just invoke-rag-indexer
    just deploy-amplify
    api_url="$(just api-url)"
    just warmup-search api_url="${api_url}"
    just warmup-agent api_url="${api_url}"
    echo ""
    echo "Deploy complete."
    echo "  SPA:  {{amplify_origin}}"
    echo "  API:  ${api_url}"

# API + RAG indexer only (no Amplify SPA rebuild). CORS uses amplify_origin from this file.
deploy-api:
    cd {{cdk_dir}} && AMPLIFY_WEB_ORIGIN={{amplify_origin}} npx cdk deploy RoofingCrmLeadsStack RoofingCrmRagStack RoofingCrmApiStack --require-approval never
    just stage-demo-corpus
    just invoke-rag-indexer

# RagStack only (managed OpenSearch domain, S3 corpus, indexer scheduler, SAM replay Lambda),
# then seed OpenSearch via the RAG indexer
deploy-rag:
    cd {{cdk_dir}} && npx cdk deploy RoofingCrmRagStack
    just stage-demo-corpus
    just invoke-rag-indexer

# Sync Amplify branch env (VITE_API_URL) and run a RELEASE build for the SPA
deploy-amplify:
    #!/usr/bin/env bash
    set -euo pipefail
    api_url="$(just api-url)"
    app_id="{{amplify_app_id}}"
    branch="{{amplify_branch}}"
    region="{{aws_region}}"
    origin="{{amplify_origin}}"
    echo "=== Amplify: sync VITE_API_URL and build ${branch} ==="
    aws amplify update-branch \
      --app-id "$app_id" \
      --branch-name "$branch" \
      --region "$region" \
      --environment-variables "AMPLIFY_MONOREPO_APP_ROOT=apps/web,NODE_VERSION=22,VITE_API_URL=${api_url}" \
      >/dev/null
    job_id="$(aws amplify start-job \
      --app-id "$app_id" \
      --branch-name "$branch" \
      --job-type RELEASE \
      --region "$region" \
      --query 'jobSummary.jobId' --output text)"
    echo "Amplify job ${job_id} started for ${origin}"
    for _ in $(seq 1 90); do
      status="$(aws amplify get-job \
        --app-id "$app_id" \
        --branch-name "$branch" \
        --job-id "$job_id" \
        --region "$region" \
        --query 'job.summary.status' --output text)"
      case "$status" in
        SUCCEED)
          echo "Amplify build ${job_id} succeeded."
          exit 0
          ;;
        FAILED|CANCELLED)
          echo "Amplify build ${job_id} ${status}." >&2
          exit 1
          ;;
        *)
          sleep 10
          ;;
      esac
    done
    echo "Amplify build ${job_id} still running after 15 minutes — check the Amplify console." >&2
    exit 1

# POST-deploy: invoke RAG indexer once (requires RoofingCrmRagStack; blocked when org SCP denies AOSS)
#
# What: RagIndexer Lambda reads published Lee parcels from Elephant MCP (queryProperties +
# getOracleProperty), builds property/permit chunks, embeds with Bedrock, upserts OpenSearch,
# and writes corpus/latest-manifest.json to the RagStack S3 bucket (freshness for agent.ask).
#
# Why: agent.ask checks retrievalIndex.isIndexed() — true only when OpenSearch has documents.
# Without this step, hosted agent returns "not indexed yet" even when RagStack deployed.
#
# Dev equivalent: `just rag-setup` seeds Docker OpenSearch from fixtures (no MCP batch, no S3).
# Re-run after deploy or when you need live MCP rows in the hosted index (scheduler is daily).
invoke-rag-indexer:
    #!/usr/bin/env bash
    set -euo pipefail
    fn="$(aws cloudformation describe-stacks --stack-name RoofingCrmRagStack --region us-east-2 \
      --query "Stacks[0].Outputs[?OutputKey=='RagIndexerFunctionName'].OutputValue" --output text)"
    if [ -z "$fn" ] || [ "$fn" = "None" ]; then
      echo "RoofingCrmRagStack not deployed or RagIndexerFunctionName missing." >&2
      exit 1
    fi
    # AWS_MAX_ATTEMPTS=1: the CLI retries invokes on read timeout, which stacks
    # duplicate 10-minute indexer runs (observed 2026-08-25).
    AWS_MAX_ATTEMPTS=1 aws lambda invoke --function-name "$fn" --region us-east-2 \
      --cli-read-timeout 900 --cli-connect-timeout 60 /tmp/rag-indexer-out.json
    cat /tmp/rag-indexer-out.json
    echo ""

# POST-deploy: warm Lee search.inRadius on the hosted execute-api (may take up to Lambda timeout)
#
# What: One real radius search against live Elephant MCP (Chester demo, West Chester pin, 2 mi).
# Why: Exercises the hosted search path after deploy (chester-demo Parquet + warm Lambda).
# Dev: local dev-api may use stand-ins; this command always hits the deployed API.
warmup-search api_url=default_api_url:
    #!/usr/bin/env bash
    set -euo pipefail
    base_url="{{api_url}}"
    base_url="${base_url%/}"
    input_query=$(node -e 'const i={county:"chester-demo",center:{lat:39.9607,lng:-75.6055},radiusMiles:2}; process.stdout.write(encodeURIComponent(JSON.stringify(i)))')
    echo "Warming search.inRadius at ${base_url} (Chester demo West Chester, 2 mi)..."
    curl -sf -H "accept: application/json" \
      "${base_url}/search.inRadius?input=${input_query}"
    echo ""
    echo "Warmup OK."

# POST-deploy: warm agent.ask mutation on the hosted execute-api
#
# What: One natural-language ask with pin + radius (same inputs the SPA agent panel sends).
# Why: Exercises agent.ask end-to-end (planner → search.inRadius → OpenSearch retrieve → answer).
#      Expect indexed: true only after `just invoke-rag-indexer` with RagStack deployed.
# Dev: `just dev-opensearch` uses local OpenSearch + fixtures; this command tests hosted wiring only.
warmup-agent api_url=default_api_url:
    #!/usr/bin/env bash
    set -euo pipefail
    base_url="{{api_url}}"
    base_url="${base_url%/}"
    payload='{"county":"chester-demo","message":"Which properties near West Chester have open roofing permits older than five years?","center":{"lat":39.9607,"lng":-75.6055},"radiusMiles":5}'
    echo "Warming agent.ask at ${base_url} (Chester demo West Chester, 5 mi)..."
    curl -sf -X POST -H "content-type: application/json" \
      -d "${payload}" \
      "${base_url}/agent.ask"
    echo ""
    echo "Agent warmup OK."

# Keep graphify knowledge graph current after code edits
graphify:
    graphify update .
