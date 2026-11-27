import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { ROOFING_VIEWS_VERSION } from "oracle-broward/contract";
import { loadEnv } from "./env.ts";

/** Local development server. Hosted, the same router runs on Lambda (Task 4, Task 11). */
export function createApiServer(opts: { manifestCid: string }): Server {
  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ ok: true, manifestCid: opts.manifestCid, viewsVersion: ROOFING_VIEWS_VERSION }),
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const env = loadEnv();
  createApiServer({ manifestCid: env.ORACLE_MANIFEST_CID }).listen(env.PORT, () =>
    console.log(`crm api on http://localhost:${env.PORT} (Oracle ${env.ORACLE_API_URL})`),
  );
}
