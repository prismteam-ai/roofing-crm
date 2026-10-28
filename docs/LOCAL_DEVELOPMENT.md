# Local development

Use Node 24 and pnpm 11.25.0 from the pinned lockfile. `.node-version` records the
project's patch pin; every receipt must record the actual runtime used. The local
P5 lane used Node 24.22.1. Reconstruct both repository bundles as siblings using
their original names. Do not copy working dependencies, caches, source datasets
or credentials into a returned bundle.

With a populated package store, the recorded install is:

```sh
pnpm install --offline --frozen-lockfile --ignore-scripts
```

An empty store requires a separately recorded dependency acquisition. Do not
silently remove frozen/offline boundaries or enable install hooks. Native Oracle
DuckDB packaging is validated by Oracle; the CRM Lambda itself has no native
DuckDB ABI dependency.

The following commands have local implementations and produce no deployment:

```sh
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
```

`contract:check` verifies source and shared-predicate digests against the local
manifest and also compares the producer when the sibling is present. Contract
changes originate with Oracle and require coordinated copies; never hand-edit a
consumer contract to make a test pass. Build/package identities require a clean
committed tree for release proof. Build outputs are ignored local artifacts.
Emulation uses the exact bundled handler with injected synthetic dependencies and
fake Converse; it is not hosted or live-model evidence. Benchmark is synthetic
lead persistence, not a county-query performance claim.

For local development, run the Oracle API/frontend, then the CRM API/frontend in
separate terminals using each repository's `pnpm api` and `pnpm dev` scripts.
Their loopback ports are Oracle 4310/4173 and CRM 4311/4174. Default local data is
explicitly synthetic. Real/protected execution requires the pinned private input
configuration and must never silently fall back to synthetic evidence.

The focused UI ledger test serves only the local CRM frontend and intercepts
API responses with labeled synthetic fixtures:

```sh
pnpm exec playwright test --config playwright.p5.config.ts
```

It blocks/asserts absent external requests, records no video or trace, and checks
desktop/mobile ledger/filter persistence. Use an existing installed Chromium via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if needed; the command does not install a
browser. The ordinary cross-application browser suite additionally requires the
sibling Oracle and separate source-mode configuration. Final clean-reconstruction,
real-source, hosted and accessibility evidence remains in the returned test matrix.
