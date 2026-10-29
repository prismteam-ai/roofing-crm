# Prism Roofing CRM

An Oakland County evidence workspace for map searches, source-backed roof and permit observations, a bounded natural-language agent, and durable lead management. The CRM consumes Oracle projections; it does not independently ingest county or provider data.

## Evaluate

Open the retained [CRM review workspace](https://d1rvqgm0k272e6.cloudfront.net) with the separately delivered low-privilege review capability. The inherited accepted hosted source is `6500641`; [release status](docs/RELEASE_STATUS.json) routes current identity and acceptance to runtime health and the immutable release packet. A review code may later be deliberately delivered as a public review capability; privileged credentials are never supplied. Open the workspace, choose a map center and radius, inspect source evidence, save a lead, and use the agent. [Evaluator guide](docs/EVALUATOR_GUIDE.md) explains the bounded workflows and factual limits.

For a local synthetic workspace, first start the Oracle API from its matching checkout. Use Node24 and pnpm11.25.0:

```sh
pnpm install --frozen-lockfile
PRISM_ACCESS_MODE=local pnpm run api
```

In another terminal:

```sh
pnpm run dev
```

The API is local-only and the default fixture is synthetic. See [local development](docs/LOCAL_DEVELOPMENT.md) for the complete command and tool requirements.

## Architecture and current engineering path

React/MapLibre → API Gateway/Node24 Lambda → a pinned Oracle read API plus DynamoDB sessions, lead history and quota ledgers. One Vercel AI SDK/Zod tool can request an immutable server-approved retrieval. Facts and citations are rendered by the server. There are at most two bounded read-only Oracle queries and one model attempt per accepted turn; empty and refused queries skip the model.

The review environment uses `us-east-2`, standard CDK bootstrap/deploy, private S3 with CloudFront OAC, Powertools, active X-Ray, 90-day logs and bounded alarm notification. The previous runtime remains a separately retained rollback; no old stack is destroyed by this source update.

[Documentation index](docs/README.md) · [Delivered scope](IMPLEMENTATION.md) · [Architecture](docs/ARCHITECTURE.md) · [Coverage and rights](docs/DATA_COVERAGE.md) · [Known limitations](docs/KNOWN_LIMITATIONS.md)

## Verification and release status

`pnpm run ci:verify` is the canonical local/CI command. The pinned GitHub Actions workflow runs the same command after frozen installation, tool installation and browser setup. Local parity is not a claim that GitHub-hosted Actions have executed. Current hosted release acceptance and source-specific outcomes must be checked against the accompanying review return and runtime identities.

The original [assignment contract](docs/history/ASSIGNMENT_README.md) remains controlling. Original positive source outcomes are not satisfied merely by an empty-result implementation. No PR, official submission, media production, Atlas/global IPNS or new real-data publication is performed by this release-candidate work.
