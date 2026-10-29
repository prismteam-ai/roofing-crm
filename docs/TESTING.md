# Testing and evidence scope

Use Node 24 and pnpm 11.25.0. Follow [local development](LOCAL_DEVELOPMENT.md) for a frozen installation, Chromium, the pinned runtime image and workflow validator. Run `pnpm run ci:verify` from the repository root. `scripts/ci-verify.ts` and package scripts define the command sequence.

The campaign covers formatting, lint, types, unit/integration behavior, contract drift, privacy/source patterns, workflow validation, production build, packaged Lambda behavior, CDK/resource policies, dependency checks and browser behavior. `pnpm run docs:check` validates active links and declared command targets. Local synthetic fixtures prove behavior, not real positive source outcomes. No paid source plan is needed for reproduction.

## Dated accepted evidence

The accepted 2026-10-29 release at CRM `f40b75a1d8be8e5c064c3b308312711060fddaf0` passed all 17 canonical clean-clone steps with Node 24.22.1/pnpm 11.25.0, including 45 browser journeys and two controlled-style map tests. Those local map tests are distinct from the separately verified actual AWS map. Its review package reproduced twice. Exact pins and the runtime receipt hash are in [release status](RELEASE_STATUS.json).

The accepted hosted campaign covered three fresh desktop contexts, one mobile context, 123 API/MCP calls with the signed-expiry case separately closed, lead/session cleanup, actual map rendering and final live-agent UI application of 648 matches / 50 rows. The backend corpus passed 70 cases: 36 distinct measured grounded turns, 16 evidence-empty responses and 18 refusals. Empty/refused answers skipped the model. Three additional measured UI responses included two failed harness attempts and one full passing workflow; they are not three passing journeys or additional distinct queries. Earlier failures remain dated evidence.

## Final promotion

A source-independent external receipt must bind final source head/tree, contract graph, lockfile, Lambda ZIP, frontend assets, public/protected snapshots and deployed stack before a later source is called accepted. The accepted baseline does not certify an untested documentation commit or substitute for final clean-clone and first-use checks. Do not embed an anticipated final Git/build hash in source to create a self-hash cycle.

Separate local correctness, native real-data fidelity, hosted acceptance, concurrent first use, source-positive outcomes, privacy review and independent review. Preserve failed attempts and earlier identities. Local CI parity is not an executed GitHub-hosted Actions run. No finite campaign guarantees future uptime or absence of bugs.

Safe plans validate syntax only. Deployment, rotation and destruction require separate scoped authority; a dry run is never a remote success. The [release checklist](RELEASE_CHECKLIST.md) lists final promotion, media and external submission gates.
