import { initTRPC, TRPCError } from '@trpc/server';
import type { Agent } from './agent/agent.js';
import type { Geocoder } from './agent/geocode.js';
import type { DatasetClient } from './dataset/client.js';
import type { LeadsRepo } from './leads/repo.js';

export interface Deps {
  dataset: DatasetClient;
  leads: LeadsRepo;
  agent: Agent;
  geocode: Geocoder;
  build: { commit: string; builtAt: string };
}

export interface Context extends Deps {
  workspaceId: string | null;
  requestId: string;
}

const t = initTRPC.context<Context>().create();
export const router = t.router;
export const publicProcedure = t.procedure;
export const workspaceProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.workspaceId)
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'x-workspace-id header required' });
  return next({ ctx: { ...ctx, workspaceId: ctx.workspaceId } });
});
