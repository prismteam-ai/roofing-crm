# Kit usage (draft)

How the Soofi XYZ Team Kit guidance was applied, and where this build deliberately deviates.
`.claude/settings.json` enables the `soofi-xyz-team-kit@soofi-xyz` plugin so the skills are
available in Claude Code sessions on this repo.

## metagross / build-frontend-backends

Applied:

- Turborepo monorepo: `apps/web`, `apps/api`, `packages/{shared,api-client,rag,tsconfig}`.
- TypeScript strict everywhere, no `any`, no `.js` sources, ESM only.
- Zod at every boundary: env (`apps/api/src/env.ts`), tRPC inputs (`packages/shared`), MCP tool
  I/O (`apps/api/src/dataset/client.ts`), fixture files on load, agent tool schemas.
- Hono HTTP + tRPC router mounted with `@hono/trpc-server`; `AppRouter` type shared through
  `packages/api-client`.
- `/health` and `/build.json`, pino JSON logs with request ids, p-limit + retry/backoff on
  external calls (MCP, Nominatim).
- Vitest unit/integration tests beside the code (78), Playwright e2e for the README demo walk at
  390/768/1440, GitHub Actions running lint → typecheck → test → build → e2e → docker build.

Deviation: **hosted on a VM in Docker** (single container, Caddy in front) rather than
Amplify/Lambda. Reason: the assessment provides a VM and a sibling pipeline service on the same
host; one image with SQLite in a volume is the smallest thing that demos end to end. The code
keeps the seams (Hono app factory, DatasetClient, LeadsRepo) that a Lambda/Amplify split would
reuse.

## alakazam / build-rag-systems

Applied, as a kit-style layered retrieval in `packages/rag`:

- Interfaces: `CorpusStore`, `EmbeddingService`, `RetrievalIndex`, `ReviewStore`, `TraceSink`.
- Hybrid retrieval: structured metadata filter first (roof age, open permit, open days, kind),
  candidate cap, then embedding cosine ranking.
- Committed replay set: `fixtures/rag/corpus/*.jsonl` + `fixtures/rag/queries/*.json`, replayed
  in `packages/rag/src/replay.test.ts` with a fake embedding service (no network).
- Traces as JSONL per day in `data/traces`, review store as JSONL (`ReviewStore` is wired but
  no UI yet — see "unfinished").
- Answers cite `pin14`, permit ids and `source_url`, and always carry "Assumptions" and
  "Missing data" sections.

Deviation: **OpenAI instead of Bedrock** — `gpt-4.1-mini` for generation and
`text-embedding-3-small` for embeddings, called only through the Vercel AI SDK
(`ai` + `@ai-sdk/openai`). The provider is injected (`AgentDeps.model`, `EmbeddingService`), so
swapping to a Bedrock provider is a one-line change in `apps/api/src/server.ts`.

## build-ai-agents

Applied: single-agent tool loop with `generateText` + `stopWhen: stepCountIs(6)`, three tools with
Zod schemas, system prompt that forbids uncited claims, deterministic offline fallback with the
same output contract so tests and demos work without a key, per-question trace id, mock model
(`MockLanguageModelV2`) tests for the tool loop.

Not done: multi-agent routing, streaming responses, human feedback loop in the UI.

## use-elephant-mcp

Applied: the API talks to the pipeline over MCP (streamable HTTP, bearer token) with a strict
four-tool contract validated on both sides; provenance (`runId`, `rootCid`, `syncedAt`,
`ingested_at`, `source_url`) flows from the dataset to the footer, drawer and agent citations.

Not done: the root CID is a placeholder until the pipeline publishes a run; the CRM does not read
from IPFS/Elephant directly, only through the pipeline MCP.

## Unfinished

- Review UI for traces (`ReviewStore` exists, no endpoint/panel).
- `queryDataset` is only meaningful against the real pipeline MCP.
- Offline agent parsing is heuristic; the LLM path has only been exercised with a mock model in CI.

## AWS CDK stack (synthesized, not deployed)

`infra/cdk` holds the kit-shaped deployment (`apply-engineering-guidelines`: CDK as the only IaC tool, `us-east-2`; `metagross`: tRPC router on Lambda behind an API Gateway HTTP API, web on Amplify): `lib/api-stack.ts` defines the Lambda (`apps/api/src/lambda.ts`, Hono wrapped with `hono/aws-lambda`), HTTP API, Amplify app, versioned S3 bucket and a dead-letter queue with a CloudWatch alarm. CI runs its assertion test and `cdk synth`. It was **not deployed**: the live runtime for this assessment is the Docker container on a VM behind Caddy, which costs nothing extra; `cdk deploy` would need an AWS account and a GitHub token in Secrets Manager.
