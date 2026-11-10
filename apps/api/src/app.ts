import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { serveStatic } from '@hono/node-server/serve-static';
import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { logger } from './logger.js';
import { appRouter } from './routers/index.js';
import type { Deps } from './trpc.js';

export function createApp(deps: Deps, opts: { webDist?: string } = {}) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? randomUUID();
    c.header('x-request-id', requestId);
    const start = Date.now();
    await next();
    logger.info(
      {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - start,
      },
      'request',
    );
  });

  app.get('/health', (c) =>
    c.json({
      ok: true,
      dataset: deps.dataset.kind,
      agent: deps.agent.mode,
      time: new Date().toISOString(),
    }),
  );
  app.get('/build.json', (c) => c.json(deps.build));

  app.use(
    '/trpc/*',
    trpcServer({
      router: appRouter,
      createContext: (_opts, c) => ({
        ...deps,
        workspaceId: c.req.header('x-workspace-id')?.slice(0, 64) ?? null,
        requestId: c.res.headers.get('x-request-id') ?? randomUUID(),
      }),
    }),
  );

  if (opts.webDist && existsSync(opts.webDist)) {
    app.use('/*', serveStatic({ root: opts.webDist }));
    app.get('*', serveStatic({ root: opts.webDist, path: 'index.html' }));
  }
  return app;
}
