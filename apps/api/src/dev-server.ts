/**
 * LOCAL DEVELOPMENT ONLY. Serves the same tRPC router as the Lambda (`handler.ts`) over plain
 * HTTP on localhost so the web app can run on a laptop.
 *
 *   ORACLE_MCP_URL set   -> real services via `buildServices(process.env)`
 *   ORACLE_MCP_URL unset -> the synthetic `FixtureOracle` (dev/fixtureOracle.ts), in-memory
 *                           leads, and no language model (the agent answers "not configured")
 *
 * This file is not part of the production build (`esbuild src/handler.ts`), and nothing under
 * `src/dev/` is imported by `handler.ts` or `services.ts`.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { buildContext, type Services } from './context.js';
import { FixtureOracle, FIXTURE_LABEL } from './dev/fixtureOracle.js';
import { MemoryLeadStore, MemoryUsageStore } from './leads/leadStores.js';
import { appRouter } from './routers/index.js';
import { buildServices } from './services.js';

const PORT = Number(process.env['PORT'] ?? 8787);

async function devServices(): Promise<{ services: Services; mode: string }> {
  const oracleUrl = process.env['ORACLE_MCP_URL'];
  if (oracleUrl) {
    // `await` works whether buildServices is sync or async.
    return { services: await buildServices(process.env), mode: `Oracle MCP at ${oracleUrl}` };
  }
  return {
    services: {
      oracle: new FixtureOracle(),
      leads: new MemoryLeadStore(),
      usage: new MemoryUsageStore(),
      agentLimits: { perWorkspace: 1000, total: 10000 },
      model: null,
      modelName: 'none',
      now: () => new Date(),
      newId: () => randomUUID(),
    },
    mode: FIXTURE_LABEL,
  };
}

const { services, mode } = await devServices();

const trpc = createHTTPHandler({
  router: appRouter,
  createContext: ({ req }) => {
    const header = req.headers['x-workspace-id'];
    return buildContext(services, Array.isArray(header) ? header[0] : header);
  },
});

const server = createServer((req, res) => {
  // Wide-open CORS is acceptable here because this server only ever listens on localhost.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-workspace-id,trpc-accept');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  trpc(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(
    `\n[dev-server] tRPC on http://localhost:${String(PORT)}  data: ${mode}\n\n`,
  );
});
