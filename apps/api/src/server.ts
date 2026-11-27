import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { ROOFING_VIEWS_VERSION } from "oracle-broward/contract";
import { createContextFactory, type Deps } from "./context.ts";
import { createDeps } from "./deps.ts";
import { loadEnv } from "./env.ts";
import { appRouter } from "./router.ts";

/** Local development server: `/health` and the tRPC router under `/trpc`. Hosted: lambda.ts. */
export function createApiServer(opts: { manifestCid: string; deps?: Deps }): Server {
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
        JSON.stringify({ ok: true, manifestCid: opts.manifestCid, viewsVersion: ROOFING_VIEWS_VERSION }),
      );
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const env = loadEnv();
  createApiServer({ manifestCid: env.ORACLE_MANIFEST_CID, deps: createDeps(env) }).listen(env.PORT, () =>
    console.log(
      `crm api on http://localhost:${env.PORT} (Oracle ${env.ORACLE_API_URL}, run ${env.ORACLE_MANIFEST_CID})`,
    ),
  );
}
