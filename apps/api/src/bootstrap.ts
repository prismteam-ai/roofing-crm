import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FakeEmbeddingService, JsonlTraceSink, OpenAIEmbeddingService } from '@roofing/rag';
import { createAgent } from './agent/agent.js';
import { createNominatimGeocoder } from './agent/geocode.js';
import { createApp } from './app.js';
import { createDatasetClient } from './dataset/index.js';
import { loadEnv } from './env.js';
import { LeadsRepo } from './leads/repo.js';

/** Wire the dependencies from the environment and return the Hono app (shared by the Node server and the Lambda handler). */
export function bootstrap() {
  const env = loadEnv();
  const dataset = createDatasetClient(env);
  const leads = new LeadsRepo(env.LEADS_DB_PATH);
  const llmKey = env.AGENT_MODE === 'offline' ? undefined : env.OPENAI_API_KEY;
  const agent = createAgent({
    dataset,
    embedder: llmKey ? new OpenAIEmbeddingService(llmKey) : new FakeEmbeddingService(),
    traceSink: new JsonlTraceSink(env.TRACE_DIR),
    geocode: createNominatimGeocoder(),
    openaiApiKey: llmKey,
  });

  function readBuild(): { commit: string; builtAt: string } {
    try {
      return JSON.parse(readFileSync(resolve('build.json'), 'utf8')) as {
        commit: string;
        builtAt: string;
      };
    } catch {
      return { commit: process.env.GIT_COMMIT ?? 'dev', builtAt: new Date().toISOString() };
    }
  }
  const app = createApp({ dataset, leads, agent, build: readBuild() }, { webDist: env.WEB_DIST });
  return { app, env, dataset, agent };
}
