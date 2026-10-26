# Contract: `health.ping`

The only tRPC procedure this story exposes. Public (no JWT authorizer), so the hosted preview can be probed without the seeded test credentials, and so the X-Ray trace check in AC-2/NFR-001 has nothing in front of it to confound timing.

- **Procedure**: `health.ping` (tRPC query)
- **Input**: none (Zod `z.void()`)
- **Output**: `{ ok: true, timestamp: string }` (Zod-validated)
- **Auth**: none — the one route in this story not behind the Cognito JWT authorizer (constitution P0-11 names `health.ping` as the sole exception)
- **Observability**: wrapped in Powertools Logger/Tracer/Metrics; the resulting X-Ray trace is what AC-2/NFR-001 checks arrives within 3 s of page load
- **Errors**: none expected; a Lambda cold start does not change the contract, only the latency (tracked as a named risk in `agent-design.md` §5)

All other routers (`me`, `index`, `search`, `leads`, `agent`) are out of scope for this story — they appear starting B-02/B-07/B-09 per `docs/architecture-constitution.md` §9.
