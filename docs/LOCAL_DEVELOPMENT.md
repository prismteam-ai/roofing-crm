# Local development

Requirements: Node24, pnpm11.25.0, Git, Linux x64 for the pinned native workflow validator, system `zip` and `tar`, Docker for native alert emulation, and the pinned Playwright Chromium build. The package manager and dependencies are frozen in the source manifest/lockfile.

```sh
pnpm install --frozen-lockfile
pnpm run tooling:install
pnpm exec playwright install chromium
docker pull public.ecr.aws/lambda/nodejs@sha256:92b7cccd985332238af80ac8da42d6965d418552e88955e315da4e3c0c76ca79
pnpm run ci:verify
```

`tooling:install` verifies exact official archive and binary hashes before using actionlint. It installs only the pinned validator in the ignored local tool cache. No cloud credentials are required by CI-equivalent validation.

Standalone synthetic browser CI uses an explicitly labeled prepared Oracle HTTP contract fixture. It proves CRM behavior against the contract, not a real source/Oracle integration. Set `PRISM_BROWSER_ORACLE_MODE=integration` for the paired real Oracle checkout; real-data mode always requires that integration. Browser installation uses Playwright's pinned Chromium; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` is an explicit local override only.

First start the matching Oracle checkout with `pnpm run api` (loopback4310), then use `pnpm run api` and `pnpm run dev` in separate CRM terminals for the local synthetic workspace. `pnpm run test:browser` and `pnpm run test:map-browser` run the relevant synthetic browser campaigns. `pnpm run lambda:package` produces a deterministic deployable package with third-party notices; `pnpm run lambda:emulate` exercises the packaged entry points with synthetic dependencies.

Other documented commands: `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test`, `pnpm run contract:check`, `pnpm run build`, `pnpm run cdk:synth`, `pnpm run workflow:check`, `pnpm run security:scan`, `pnpm run docs:check`, `pnpm run scripts:check`, `pnpm run dependency:audit`, and `pnpm run benchmark`. CDK synthesis requires a packaged Lambda asset; canonical verification orders packaging before synthesis.

`pnpm run deploy --dry-run`, `pnpm run bootstrap --dry-run`, `pnpm run smoke --dry-run`, `pnpm run evidence --dry-run`, `pnpm run rotate-access --dry-run`, `pnpm run destroy --dry-run`, and `pnpm run campaign` are no-effect plans. Actual remote actions require their separate exact account/source/archive/cost/rights gates. The release return lists which commands were actually run and their outcomes.

The public/synthetic browser configuration clears every inherited `PRISM_` task variable before setting its small explicit public environment. This includes new provider, transfer-index, source-run, full-source and digest lanes, auth switches, and model/map toggles. Real-public capture accepts only its explicitly supplied snapshot directory; the Oracle API independently rejects protected/local snapshots. Protected evidence is exercised through the separate authenticated hosted evidence workflow, with an exact review origin and private review-code input. Public capture never opts itself into protected data or strips a protected source into a public claim.
