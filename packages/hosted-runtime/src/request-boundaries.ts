import type { OracleReader } from "../../oracle-client/src/index";
import type { LeadRepository } from "../../lead-domain/src/dynamo";
import type { QuotaStore } from "./quota";
import type { TurnDeadline } from "./turn-deadline";
/** Every async continuation must cross the same request-local deadline before a new dispatch. */
export function requestBoundaries(
  budget: TurnDeadline,
  oracle: OracleReader,
  leads: LeadRepository,
  quota: QuotaStore,
) {
  const options = (input?: { signal?: AbortSignal; timeoutMs?: number }) => ({
    signal: input?.signal
      ? AbortSignal.any([budget.signal, input.signal])
      : budget.signal,
    timeoutMs: Math.max(
      1,
      Math.min(26000, input?.timeoutMs ?? 26000, budget.remaining()),
    ),
  });
  const boundedOracle: OracleReader = {
    search: (query, input) =>
      budget.run(() => oracle.search(query, options(input))),
    detail: (id, snapshot, input) =>
      budget.run(() => oracle.detail(id, snapshot, options(input))),
    ...(oracle.health
      ? { health: (input) => budget.run(() => oracle.health!(options(input))) }
      : {}),
    ...(oracle.sourceContext
      ? {
          sourceContext: (source: string, snapshot: string, page?: number) =>
            budget.run(() =>
              oracle.sourceContext!(source, snapshot, page, options()),
            ),
        }
      : {}),
  };
  const boundedLeads: LeadRepository = {
    list: (session) =>
      budget.run(async () =>
        leads.list(session, budget.signal, () => budget.assertActive()),
      ),
    create: (input) =>
      budget.run(async () =>
        leads.create(input, budget.signal, () => budget.assertActive()),
      ),
    update: (id, input) =>
      budget.run(async () =>
        leads.update(id, input, budget.signal, () => budget.assertActive()),
      ),
  };
  const boundedQuota: QuotaStore = {
    consume: (input) => budget.run(() => quota.consume(input, budget.signal)),
  };
  return { oracle: boundedOracle, leads: boundedLeads, quota: boundedQuota };
}
