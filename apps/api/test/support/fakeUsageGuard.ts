// In-memory stand-in for `agent/usageGuard.ts`'s `UsageGuard` (rate limiter + spend cap + thread
// store + model price), injected with `setUsageGuardForTest`. The guard now fails closed when it
// isn't configured (CR finding 4), so every `agent.*` router test injects one of these instead of
// relying on an unset `CRM_AGENT_USAGE_TABLE_NAME` silently skipping enforcement.
import { vi } from "vitest";
import type { QueryPlan } from "@crm/shared";
import { OverBudgetError, RateLimitedError } from "../../src/agentErrors.js";
import { priceForModel } from "../../src/agent/modelPricing.js";
import type { SpendReservation } from "../../src/agent/spendCap.js";
import type { UsageGuard } from "../../src/agent/usageGuard.js";

export interface FakeUsageGuardOptions {
  readonly rateLimited?: { readonly retryAfterSec: number };
  readonly overBudget?: { readonly resetsAt: string };
  /** tcadIds already proposed per `${threadId}|${actorId}`. */
  readonly proposed?: Record<string, readonly string[]>;
}

export function fakeUsageGuard(options: FakeUsageGuardOptions = {}) {
  const proposed = new Map<string, Set<string>>(
    Object.entries(options.proposed ?? {}).map(([k, v]) => [k, new Set(v)]),
  );
  const plans = new Map<string, QueryPlan>();
  const check = vi.fn(async (userId: string, _scope?: "ask" | "confirm") => {
    if (options.rateLimited !== undefined) {
      throw new RateLimitedError(userId, options.rateLimited.retryAfterSec);
    }
  });
  const reserve = vi.fn(async (userId: string, cents: number): Promise<SpendReservation> => {
    if (options.overBudget !== undefined) {
      throw new OverBudgetError(userId, options.overBudget.resetsAt);
    }
    return { key: `USER#${userId}#DAY#test`, reservedCents: cents };
  });
  const reconcile = vi.fn(async (_r: SpendReservation, _actual: number) => {});
  const recordTurn = vi.fn(
    async (
      threadId: string,
      actorId: string,
      turn: { plan: QueryPlan; proposedTcadIds: readonly string[] },
    ) => {
      const key = `${threadId}|${actorId}`;
      plans.set(key, turn.plan);
      const set = proposed.get(key) ?? new Set<string>();
      for (const id of turn.proposedTcadIds) set.add(id);
      proposed.set(key, set);
    },
  );
  const wasProposed = vi.fn(
    async (threadId: string, actorId: string, tcadId: string) =>
      proposed.get(`${threadId}|${actorId}`)?.has(tcadId) ?? false,
  );
  const lastPlan = vi.fn(async (threadId: string, actorId: string) =>
    plans.get(`${threadId}|${actorId}`),
  );
  const proposedAmong = vi.fn(
    async (threadId: string, actorId: string, tcadIds: readonly string[]) => {
      const set = proposed.get(`${threadId}|${actorId}`);
      return new Set(tcadIds.filter((id) => set?.has(id) ?? false));
    },
  );
  const guard: UsageGuard = {
    rateLimiter: { check },
    spendCap: { reserve, reconcile },
    threadStore: { recordTurn, wasProposed, proposedAmong, lastPlan },
    price: priceForModel("eu.anthropic.claude-sonnet-4-6"),
  };
  return { guard, check, reserve, reconcile, recordTurn, wasProposed, proposedAmong, lastPlan };
}
