# Prism Roofing CRM

An Oakland County evidence workspace for map searches, source-backed roof and permit observations, a grounded natural-language agent, and durable lead management. The CRM consumes Oracle projections; it does not independently ingest county or provider data.

## Evaluate

Open the [CRM review workspace](https://d1rvqgm0k272e6.cloudfront.net) with the low-privilege evaluator capability in the approved PR access section. No AWS account, installation or local server is needed. Choose a map center and radius, inspect evidence, save a lead and ask the agent. Start with the [evaluator guide](docs/EVALUATOR_GUIDE.md) for the real example, access limits and recovery steps.

The completed free-source campaign did not establish a positive current-active or long-open roofing-permit cohort. No paid source is required, purchased or needed to reproduce this runtime. [Known limitations](docs/KNOWN_LIMITATIONS.md) explains this finite source outcome and the narrower claims supported by the available evidence.

## Implementation and verification

React/MapLibre → API Gateway/Node 24 Lambda → a pinned Oracle read API plus DynamoDB sessions, lead history and quota ledgers. A Vercel AI SDK/Zod tool requests an immutable server-approved retrieval. Deterministic server code supplies facts and citations. Each accepted nonempty turn has at most two bounded read-only Oracle queries and one model attempt; empty and refused queries skip the model.

The review environment uses the existing stacks in `us-east-2`, standard CDK deployment, private S3 with CloudFront OAC, Powertools, active X-Ray, 90-day logs and bounded alarm notification. Previous runtime resources remain retained for rollback. Availability, session expiry and map expiry are separate finite limits described in the evaluator guide.

`pnpm run ci:verify` is the canonical local/CI command. The pinned GitHub Actions workflow uses the same command after tool setup. Local parity is not proof that GitHub-hosted Actions ran. The [release status](docs/RELEASE_STATUS.json) records the dated accepted baseline; a source-independent release receipt binds any subsequent final source, deployed packages, frontend, contract and snapshots. Health alone does not establish full acceptance.

## Local workspace

Use Node 24 and pnpm 11.25.0. First start the matching Oracle checkout in synthetic/local mode, then run:

```sh
pnpm install --frozen-lockfile
PRISM_ACCESS_MODE=local pnpm run api
```

In another terminal:

```sh
pnpm run dev
```

See [local development](docs/LOCAL_DEVELOPMENT.md) for Oracle startup, tools and verification. Local fixtures are labeled synthetic and do not prove real source coverage.

[Documentation index](docs/README.md) · [Delivered scope](IMPLEMENTATION.md) · [Architecture](docs/ARCHITECTURE.md) · [Coverage and rights](docs/DATA_COVERAGE.md) · [Field authority](docs/DATA_FIELD_AUTHORITY_MATRIX.md)

The preserved [original assignment](docs/history/ASSIGNMENT_README.md) controls the employer requirements. This implementation README does not replace it. Local media and PR preparation are separate from video upload, GitHub writes, Ready transition and official submission; those external gates are not claimed here.
