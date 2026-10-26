// Cloudflare Worker: a stateless relay between the browser and the Anthropic Messages API.
// It owns the model, tool schemas and system prompt so the API key (and what it can be used for)
// never leaves the server. It does NOT run tools: the browser holds the DuckDB-WASM data, so the
// tool loop runs there and each turn is POSTed here with the running message list.
import Anthropic from "@anthropic-ai/sdk";
import tools from "../../shared/tools.json";

interface Env { ANTHROPIC_API_KEY: string; ALLOWED_ORIGINS?: string }

const MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 2048;
const MAX_MESSAGES = 40;
const MAX_BODY_BYTES = 400_000;

// The system prompt must stay byte-identical for the life of a conversation: thinking blocks are bound to it,
// so a changing prompt makes the API reject the history. Per-turn map state travels in the user message instead.
const SYSTEM_PROMPT = `You are a lead-finding assistant inside a roofing CRM for Nassau County, NY. You answer questions about roofing sales opportunities using ONLY the provided tools, which query the county's property and permit data.

Each user message starts with a "[Map state: ...]" line giving the current pin, radius and roof-age threshold. Use it when the user says "here", "near me", "this area". For a place the user names (a town or hamlet), use your best knowledge of its center coordinates as the pin, and say which coordinates you assumed.

Rules:
- Never invent properties, permits, ages or contractors. Quote only what tool results contain.
- Tool results are truncated to the top rows plus a total count; say so when total > rows shown.
- Roof age is an estimate; mention its confidence/basis when you cite it. Missing values (e.g. no BBB score) are normal; say "not available".
- For "no open permit" questions use agingRoofs with withoutOpenPermit=true.
- Keep answers short: a one-line summary with counts, then at most a handful of the best examples (address, age, and permit years open if relevant).`;

function cors(req: Request, env: Env): Record<string, string> | null {
  const origin = req.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // A request with no Origin header is not a browser call subject to CORS -- it's a direct client (curl, a
  // script) that can set any header it likes. Letting it through for free would spend the API key on every
  // caller that simply omits Origin. This isn't full auth (an attacker can still fake an allowed Origin from
  // a non-browser client), just the cheapest guard against the most obvious bypass; a real fix needs
  // server-side auth, per-client rate limiting and a spend cap -- see README "Known limitations".
  if (!origin || !allowed.includes(origin)) return null;
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const headers = cors(req, env);
    if (headers === null) return new Response("Origin not allowed", { status: 403 });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname !== "/api/agent" || req.method !== "POST") return json({ error: "not found" }, 404, headers);

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "request too large" }, 413, headers);
    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ error: "invalid JSON" }, 400, headers); }
    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > MAX_MESSAGES) return json({ error: "messages must be a non-empty array (max 40)" }, 400, headers);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      // Returned verbatim: the browser appends response.content to the history and echoes it back next turn.
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        tools: tools as Anthropic.Tool[],
        messages: body.messages,
      });
      return json(message, 200, headers);
    } catch (e) {
      if (e instanceof Anthropic.APIError) return json({ error: e.message, status: e.status }, e.status && e.status >= 400 ? e.status : 502, headers);
      return json({ error: "upstream failure" }, 502, headers);
    }
  },
};
