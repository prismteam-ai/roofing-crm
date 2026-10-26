# Agent Worker

A stateless Cloudflare Worker that relays chat turns to the Anthropic Messages API (`claude-haiku-5-5`).
It exists only because an API key can't live in browser code. It does **not** run tools: the property/permit
data lives in the browser (DuckDB-WASM), so the tool loop runs in the frontend (`src/lib/agent.ts`).

- `POST /api/agent` with `{ messages }` (the running Anthropic message list, including `tool_result` blocks) returns Claude's response verbatim.
- The Worker owns the model, system prompt and tool schemas (`../shared/tools.json`), so a caller can't repurpose it as a general Claude proxy. It also enforces an origin allow-list (`ALLOWED_ORIGINS`), message-count and body-size caps.
- The system prompt is deliberately static: thinking blocks are bound to it, so per-turn map state is sent inside the user message instead.

## Local dev (two terminals)

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > worker/.dev.vars   # git-ignored
npm run dev:worker   # wrangler dev on http://127.0.0.1:8787
npm run dev          # Vite on :5173, proxies /api -> :8787
```

## Deploy

```bash
npx wrangler secret put ANTHROPIC_API_KEY --config worker/wrangler.toml
npx wrangler deploy --config worker/wrangler.toml   # then set ALLOWED_ORIGINS to the Pages origin
```
Build the site with `VITE_AGENT_URL=https://<worker>.workers.dev/api/agent`.
