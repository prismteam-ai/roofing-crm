/**
 * Local HTTP tRPC server for Vite (`pnpm --filter api dev`).
 *
 * In-memory LeadRecords survive SPA refresh while this process stays up.
 * Search uses Lee stand-in parcels unless an ElephantMcpToolClient is injected
 * (ROOFING_CRM_ELEPHANT_MCP=1 is reserved for that swap).
 */
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { createServer } from "node:http";
import { createLocalAppRouter } from "./create-local-app-router.js";
import type { ApiContext } from "./trpc.js";

const DEFAULT_LOCAL_API_PORT = 2022;

const LOCAL_SPA_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5174",
  "http://localhost:5174",
  "http://127.0.0.1:5175",
  "http://localhost:5175",
]);

function createLocalApiContext(): ApiContext {
  const serviceName = "roofing-crm-api-local";
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ serviceName, namespace: "RoofingCrmApiLocal" }),
  };
}

function isLocalSpaOrigin(origin: string): boolean {
  return LOCAL_SPA_ORIGINS.has(origin);
}

const localAppRouter = createLocalAppRouter();
const trpcHandler = createHTTPHandler({
  router: localAppRouter,
  createContext: () => createLocalApiContext(),
});

const port = Number.parseInt(
  process.env.ROOFING_CRM_LOCAL_API_PORT ?? String(DEFAULT_LOCAL_API_PORT),
  10,
);

const server = createServer((request, response) => {
  const origin = request.headers.origin;
  if (typeof origin === "string" && isLocalSpaOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type,trpc-accept,x-trpc-source",
  );

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  trpcHandler(request, response);
});

server.listen(port, "127.0.0.1", () => {
  const elephantMcpEnabled = process.env.ROOFING_CRM_ELEPHANT_MCP === "1";
  console.log(
    `Roofing CRM local tRPC on http://127.0.0.1:${String(port)} (leads in process memory${
      elephantMcpEnabled
        ? "; Elephant MCP flag set but stdio client is not wired yet — using Lee stand-in search"
        : "; Lee stand-in search — set ROOFING_CRM_ELEPHANT_MCP=1 when live MCP is ready"
    })`,
  );
});
