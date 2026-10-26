// AppRouter (architecture-constitution.md §9): `health` and `auth.reportFailedAttempt` only in
// this story (the latter found deploying — see routers/auth.ts). `me`, `index`, `search`,
// `leads`, `agent` are out of scope for B-01 (contracts/health.md) and are added by later stories
// (B-02+/B-07/B-09).
import { router } from "../trpc.js";
import { agentRouter } from "./agent.js";
import { authRouter } from "./auth.js";
import { healthRouter } from "./health.js";
import { leadsRouter } from "./leads.js";
import { propertyRouter } from "./property.js";
import { searchRouter } from "./search.js";
import { shellRouter } from "./shell.js";

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  // B-03 (plan.md "Patterns the code must show"): search.properties/search.permits + property.get,
  // wired additively onto the existing B-01/B-02 routes.
  search: searchRouter,
  property: propertyRouter,
  // B-07: lead capture, status, notes, list (contracts/leads.md).
  leads: leadsRouter,
  // B-09 (contracts/agent-api.md): ask + confirmLead. `packages/api-client`'s types update
  // automatically through `inferRouterInputs/Outputs<AppRouter>` — no separate client change.
  agent: agentRouter,
  // Shell top bar: the data chip's promoted run and the Apps menu's links (routers/shell.ts).
  shell: shellRouter,
});

export type AppRouter = typeof appRouter;
