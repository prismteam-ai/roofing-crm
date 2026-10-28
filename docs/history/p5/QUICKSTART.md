# Roofing CRM quickstart

The original [assignment README](README.md) is unchanged. Current evaluator
orientation is [IMPLEMENTATION.md](IMPLEMENTATION.md); the authoritative
[documentation index](docs/README.md) supersedes P1–P4 operating notes.

Use Node 24 and pnpm 11.25.0 with the frozen lockfile. With a populated package
store, the local recorded install and checks are:

```sh
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm contract:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm lambda:package
pnpm lambda:emulate
pnpm cdk:synth
pnpm benchmark
pnpm exec playwright test --config playwright.p5.config.ts
```

Read [local development](docs/LOCAL_DEVELOPMENT.md) for actual runtime receipts,
sibling Oracle services, ports, fixture modes and installed browser selection.
Default local execution is explicitly synthetic; the focused UI suite intercepts
synthetic API responses and blocks external requests. Package/emulator/synth
success is local proof, not a hosted/model/source claim.

The assistant now shows a typed constraint ledger and uses the official Oakland
place index for named radius centers. It preserves explicit radius/limit, owner,
permit, sale, business-evidence and order requirements or refuses the request.
Read [NL semantics](docs/P5_NL_INTENT_AND_LIMITATIONS.md) and
[current source coverage](docs/DATA_COVERAGE.md) before interpreting a result.
Open-permit outcomes are source-blocked by zero canonical OPEN observations;
building year and reported sales remain distinct limited proxies.

Use the final return's hosted report for live URLs, access expiry, source/runtime
pins and observed outcomes. Follow [deployment](docs/DEPLOYMENT.md) and
[release gates](docs/RELEASE_CHECKLIST.md); this quickstart grants no remote action.
