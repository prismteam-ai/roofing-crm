/**
 * Minimal Gemini proxy for the Roofing CRM agent.
 *
 * The CRM is a static site on GitHub Pages, so it has no server of its own to
 * hold an API key. Inlining the key into a public bundle would expose it to
 * scraping and near-certain automated revocation, so this Worker holds it
 * instead and the browser never sees it.
 *
 * Deliberately NOT a general-purpose proxy: the upstream URL is constructed
 * here from an allow-listed model, so a caller cannot use this to reach
 * arbitrary endpoints.
 */

interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGINS: string;
}

/** Only models this app actually uses. Anything else is rejected. */
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-embedding-001',
]);

const ALLOWED_ACTIONS = new Set(['generateContent', 'streamGenerateContent', 'embedContent']);

const MAX_BODY_BYTES = 128 * 1024;
const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta/models';

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  // Echo the origin only when it is allow-listed; never reflect blindly.
  const allow = origin && allowed.includes(origin) ? origin : allowed[0] ?? '';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, cors);

    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    if (origin && !allowed.includes(origin)) {
      return json({ error: 'origin not allowed' }, 403, cors);
    }
    if (!env.GEMINI_API_KEY) {
      // The CRM treats this as "LLM mode unavailable" and falls back to its
      // deterministic query planner rather than showing an error.
      return json({ error: 'proxy not configured' }, 503, cors);
    }

    const url = new URL(request.url);
    const model = url.searchParams.get('model') ?? '';
    const action = url.searchParams.get('action') ?? 'generateContent';
    if (!ALLOWED_MODELS.has(model)) return json({ error: `model not allowed: ${model}` }, 400, cors);
    if (!ALLOWED_ACTIONS.has(action)) return json({ error: `action not allowed: ${action}` }, 400, cors);

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return json({ error: 'request too large' }, 413, cors);

    const upstream = await fetch(`${UPSTREAM}/${model}:${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body,
    });

    // Pass the response through, but never the upstream's own headers - they can
    // carry quota and project details that should not reach a public page.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  },
};
