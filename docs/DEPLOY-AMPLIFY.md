# Deploy Amplify Hosting (`feature/foundation`)

Operator checklist for a **new** Amplify Hosting app on branch `feature/foundation`. No merge to `main` is required. Keep GitHub Pages on PR #3 until this Amplify URL is live and listed on the PR.

Region: **`us-east-2`**. Tags: `project_name=roofing-crm-challenge`.

## Specs in this repo

| File                                              | When Amplify uses it                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`amplify.yml`](../amplify.yml) (repo root)       | Default: connect GitHub, leave **app root empty** — monorepo `applications[].appRoot: apps/web` |
| [`apps/web/amplify.yml`](../apps/web/amplify.yml) | Console **app root** = `apps/web`                                                               |

Both pin Node 22, pnpm 9.15.0, turbo filter `@roofing-crm-challenge/web...`, and an SPA `200` rewrite to `/index.html`.

## Sequence

```text
push feature/foundation
  → cdk deploy Leads + Api (placeholder CORS)
  → copy execute-api URL
  → Amplify Hosting (branch + VITE_API_URL)
  → copy amplifyapp.com origin
  → cdk redeploy with AMPLIFY_WEB_ORIGIN
  → (optional) Amplify rebuild if VITE_API_URL was wrong
  → paste web + API URLs on PR; keep Pages until then
```

### 1. Push the branch

```bash
git push -u origin feature/foundation
```

Do **not** retarget PR #3 or take Pages down until step 6’s Amplify URL works.

### 2. CDK API first (`us-east-2`)

From the monorepo (with AWS credentials for the target account):

```bash
cd apps/api/cdk
npx cdk deploy RoofingCrmLeadsStack RoofingCrmRagStack RoofingCrmApiStack
```

Copy the **`ApiUrl`** output (execute-api HTTPS URL, no trailing slash).

After deploy, invoke the RAG indexer once so OpenSearch is populated before agent traffic:

```bash
just invoke-rag-indexer
```

Or manually:

```bash
aws lambda invoke --function-name "$(aws cloudformation describe-stacks \
  --stack-name RoofingCrmRagStack \
  --query \"Stacks[0].Outputs[?OutputKey=='RagIndexerFunctionName'].OutputValue\" \
  --output text)" /tmp/rag-indexer-out.json
cat /tmp/rag-indexer-out.json
```

Confirm the payload includes a positive `indexedCount`. Then warm Lee radius search and agent.ask:

```bash
just warmup-search
just warmup-agent
```

Override the default execute-api URL if needed: `just warmup-search api_url=https://<your-api-id>.execute-api.us-east-2.amazonaws.com`

First deploy may use the CORS placeholder `https://amplify-origin-placeholder.amplifyapp.com`. That is expected before Amplify exists.

Note: First cold `search.inRadius` should complete in a few seconds — Lee's property query table (~229 MB Parquet) is **bundled into the API Lambda image at build time** (`apps/api/Dockerfile.lambda`, build arg `LEE_QUERY_TABLE_URL`). DuckDB reads `/var/task/data/lee-query-table.parquet` instead of cold IPFS/httpfs. Lambda is sized **2048 MB / 120s** for Lee MCP. The hosted path never falls back to DEMO stand-ins — MCP failures surface as retryable errors.

RagStack uses a **managed OpenSearch domain** (`es`) because the org SCP denies OpenSearch Serverless (`aoss:*`). To deploy without it (agent stays not-indexed): `SKIP_RAG_STACK=1 npx cdk deploy RoofingCrmLeadsStack RoofingCrmApiStack`.

Prefer `just deploy` for the full hosted stack (CDK + Amplify SPA + warmups), or `just deploy-api` for API-only (still sets CORS via `amplify_origin` in the justfile).

### 3. Create Amplify Hosting

1. AWS Console → **Amplify** → **Host web app** → **GitHub**.
2. Repo: `prismteam-ai/roofing-crm` (grant the Amplify GitHub App access to the org/repo).
3. Branch: **`feature/foundation`**.
4. App root: leave **empty** if using root [`amplify.yml`](../amplify.yml); or set **`apps/web`** if using only [`apps/web/amplify.yml`](../apps/web/amplify.yml).
5. Branch environment variables:
   - **`VITE_API_URL`** = execute-api URL from step 2 (no trailing slash). Vite inlines this at **build** time.
   - **`NODE_VERSION`** = `22` (buildspec also runs `nvm install 22`).
6. Save and deploy. Copy the public URL, e.g. `https://feature-foundation.<app-id>.amplifyapp.com` or the default domain Amplify shows.

### 4. CORS

`just deploy` and `just deploy-api` pass `AMPLIFY_WEB_ORIGIN` from the justfile (`amplify_origin`) so API Gateway CORS matches the SPA. Confirm stack output **`AmplifyWebOriginsCors`** matches your Amplify URL (no trailing slash).

### 5. Rebuild Amplify only if needed

Trigger a second Amplify build if `VITE_API_URL` was missing or wrong on the first build. CORS-only CDK changes do **not** require an SPA rebuild.

### 6. PR system of record (when ready)

On the evaluation PR, list:

- Web URL (Amplify)
- API URL (execute-api)
- “No login”
- Demo video of **this** Amplify URL
- Default geography actually served (`lee` fallback until Chester is catalog-published)

Keep GitHub Pages up until that swap. Do not demo `localhost` / ngrok.

## Verify

- Amplify build: `pnpm install` + turbo web build succeed; artifact contains `index.html` + JS.
- Browser: SPA loads on `*.amplifyapp.com` (not localhost).
- Footer “API endpoint” shows the execute-api URL when `VITE_API_URL` was set at build time.
- From the Amplify origin, `health.ping` succeeds once CORS is configured (`just deploy` / `just deploy-api`).
- MapLibre tiles load (OSM).
- `search.inRadius` returns live Lee parcels (not `DEMO —` streets) once MCP cold start completes.
- Drop a pin in Lee, ask “open roofing permits older than five years”, confirm citations open the parcel drawer and `indexed: true` in the agent panel freshness line.

## Out of this checklist

- Alakazam RAG / custom domains / merge to `main`.
- Taking GitHub Pages down before Amplify is listed on the PR.
