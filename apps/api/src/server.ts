import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import type { AgentHttpHandler } from "@crm/agent";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { ROOFING_VIEWS_VERSION } from "oracle-broward/contract";
import { createAgentEndpoint } from "./agent.ts";
import { createContextFactory, type Deps } from "./context.ts";
import { createDeps } from "./deps.ts";
import { loadEnv } from "./env.ts";
import { appRouter } from "./router.ts";

/** Local development server: `/health` and the tRPC router under `/trpc`. Hosted: lambda.ts. */
export function createApiServer(opts: {
  manifestCid: string;
  deps?: Deps;
  agent?: AgentHttpHandler & { configured?: boolean };
}): Server {
  const createContext = opts.deps ? createContextFactory(opts.deps, { secureCookies: false }) : null;
  const trpc = createContext
    ? createHTTPHandler({
        router: appRouter,
        basePath: "/trpc/",
        createContext: async ({ req, res }) => {
          const ctx = await createContext({ cookieHeader: req.headers.cookie });
          if (ctx.setCookies.length) res.setHeader("set-cookie", ctx.setCookies);
          return ctx;
        },
      })
    : null;
  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          manifestCid: opts.manifestCid,
          viewsVersion: ROOFING_VIEWS_VERSION,
          agentConfigured: Boolean(opts.agent?.configured),
        }),
      );
      return;
    }
    if (opts.agent && req.url === "/agent" && req.method === "POST") {
      void handleAgent(opts.agent, req, res);
      return;
    }
    if (trpc && req.url?.startsWith("/trpc/")) {
      trpc(req, res);
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
}

async function handleAgent(agent: AgentHttpHandler, req: IncomingMessage, res: ServerResponse) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 256 * 1024) {
      res.writeHead(413).end();
      return;
    }
    chunks.push(c as Buffer);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid JSON" }));
    return;
  }
  const r = await agent(body, req.socket.remoteAddress ?? "local");
  res.writeHead(r.status, { "content-type": "application/json" }).end(JSON.stringify(r.body));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const env = loadEnv();
  const agent = await createAgentEndpoint(env, {
    onError: (e) => console.error("agent:", (e as Error).message),
  });
  createApiServer({ manifestCid: env.ORACLE_MANIFEST_CID, deps: createDeps(env), agent }).listen(
    env.PORT,
    () =>
      console.log(
        `crm api on http://localhost:${env.PORT} (Oracle ${env.ORACLE_API_URL}, run ${env.ORACLE_MANIFEST_CID})`,
      ),
  );
}
