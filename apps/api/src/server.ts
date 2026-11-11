import { serve } from '@hono/node-server';
import { bootstrap } from './bootstrap.js';
import { logger } from './logger.js';

const { app, env, dataset, agent } = bootstrap();
serve({ fetch: app.fetch, port: env.PORT }, (info) =>
  logger.info({ port: info.port, dataset: dataset.kind, agent: agent.mode }, 'api listening'),
);
