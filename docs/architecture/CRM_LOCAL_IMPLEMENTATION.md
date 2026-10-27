# CRM P1 local implementation

The React/MapLibre frontend consumes the Oracle-owned contract through a generated pinned copy. The CRM API binds to127.0.0.1:4311 and accesses only the local Oracle consumer API at4310. Source acquisition, BBB, owner contact and outreach are absent.

Run `pnpm api` and `pnpm dev` after the Oracle API starts. Open http://127.0.0.1:4174. The default search is five miles around the Oakland fixture center. The map style and schematic context are bundled offline; no public tiles, fonts or geocoder are contacted. Map and list use identical returned rows; truncation is explicit. GPS denial leaves the pin workflow available, and an accessible east-pin control supports keyboard testing. Filter state round-trips through URL parameters. All visible records and locations are synthetic P1 fixture data, not an authoritative basemap or a real county dataset.

Leads persist in ignored `data/leads.sqlite` through Node SQLite. Session-scoped idempotency and natural property/snapshot uniqueness prevent duplicate records. Conditional versioned updates retain event history. Demo session namespaces are isolation for local assessment, not production authentication. No public runtime or production security claim is made. Contacted status is a record value only; no message is sent.

The deterministic offline provider interprets supported radius/roof-age/permit-age questions into the same validated query contract. The `ai` package's tool abstraction shares the Zod schema. No LLM provider or inference occurs. Forbidden SQL, external browsing, secrets and outreach requests fail before retrieval. Answers preserve query hash/snapshot, returned source citations and unknown/confidence caveats.

`pnpm cdk:synth` emits an account-independent infrastructure candidate without lookups or credentials. It defines HTTP/Lambda, on-demand lead state and private assets. The Lambda deliberately returns503 until later approved runtime/auth/Dynamo adapter work: this is not deploy-ready staging and must not be deployed in P1. No AWS API call occurs during synth.

Validation: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Parent integration owns fixture/no-network browser checks and final source-pinned bundle reconstruction.

The local Oracle client permits HTTP(S) loopback destinations only, rejects URL user information and disallows redirects. Each fetch has a10-second abort deadline; a redirect cannot forward typed search inputs outside the approved local consumer boundary. Negative tests use mocked external redirect metadata and a real307 between two local test servers, with no external request.

The offline interpreter recognizes explicit open and closed permits. Closed status overrides an inherited open filter and clears minimum-open duration. Mixed/negated statuses and closed-permit-age questions are rejected explicitly rather than silently reinterpreted.
