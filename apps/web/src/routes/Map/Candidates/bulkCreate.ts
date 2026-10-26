// Bulk "Create {n} leads" (E-54/E-75). `runBulkCreateMany` sends the selection to
// `leads.createMany` in batches of at most 25, one batch at a time; the server runs each batch
// through the same `LeadService.create` as `leads.create` with its own bounded concurrency (3), so
// the browser adds no parallelism. A duplicate comes back in `already`, never as a failure.
// `runBulkCreate` (one `leads.create` per property, at most 2 in flight) is kept as the
// per-item path. Pure: the caller injects the network call, so both are tested without one.

export const MAX_BULK_CONCURRENCY = 2;

export interface BulkItem<I> {
  /** Stable id of the row (the property CID). */
  readonly id: string;
  readonly input: I;
}

export interface BulkOutcome<R> {
  readonly created: readonly { readonly id: string; readonly result: R }[];
  readonly already: readonly string[];
  readonly failed: readonly string[];
}

export async function runBulkCreate<I, R>(
  items: readonly BulkItem<I>[],
  create: (input: I) => Promise<R>,
  isAlreadyExists: (error: unknown) => boolean,
  concurrency: number = MAX_BULK_CONCURRENCY,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkOutcome<R>> {
  const limit = Math.max(1, Math.min(MAX_BULK_CONCURRENCY, Math.floor(concurrency)));
  const created: { id: string; result: R }[] = [];
  const already: string[] = [];
  const failed: string[] = [];
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const item = items[next++];
      if (item === undefined) return;
      try {
        created.push({ id: item.id, result: await create(item.input) });
      } catch (error) {
        (isAlreadyExists(error) ? already : failed).push(item.id);
      }
      done += 1;
      onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  // Report in the caller's order, not completion order.
  const order = new Map(items.map((item, i) => [item.id, i]));
  const byOrder = (a: string, b: string): number => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  created.sort((a, b) => byOrder(a.id, b.id));
  already.sort(byOrder);
  failed.sort(byOrder);
  return { created, already, failed };
}

/** "2 leads created · 1 already a lead" (CrmCandidatesCreated390), plus failures when any. */
export function bulkSummary(created: number, already: number, failed: number): string {
  const parts = [`${String(created)} ${created === 1 ? "lead" : "leads"} created`];
  if (already > 0) parts.push(`${String(already)} already ${already === 1 ? "a lead" : "leads"}`);
  if (failed > 0) parts.push(`${String(failed)} not saved`);
  return parts.join(" · ");
}

/** `leads.createMany` accepts at most this many items per call (apps/api routers/leads.ts). */
export const CREATE_MANY_MAX_ITEMS = 25;

export interface CreateManyRequestItem {
  readonly fips: string;
  readonly requestIdentifier: string;
}

export interface CreateManyResponse {
  readonly created: readonly { readonly leadKey: string; readonly leadId: string }[];
  readonly already: readonly string[];
  readonly failed: readonly { readonly leadKey: string; readonly code: string }[];
}

const keyOf = (i: CreateManyRequestItem): string => `${i.fips}:tcad:${i.requestIdentifier}`;

/** Creates the items through `createMany` in batches of 25 and maps the answer back to the row ids.
 *  A batch whose call itself fails (offline, 5xx) marks only that batch's rows as failed. */
export async function runBulkCreateMany<I extends CreateManyRequestItem>(
  items: readonly BulkItem<I>[],
  createMany: (inputs: I[]) => Promise<CreateManyResponse>,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkOutcome<{ leadKey: string; leadId: string }>> {
  const created: { id: string; result: { leadKey: string; leadId: string } }[] = [];
  const already: string[] = [];
  const failed: string[] = [];
  const idByKey = new Map(items.map((item) => [keyOf(item.input), item.id]));
  let done = 0;
  for (let at = 0; at < items.length; at += CREATE_MANY_MAX_ITEMS) {
    const batch = items.slice(at, at + CREATE_MANY_MAX_ITEMS);
    try {
      const res = await createMany(batch.map((b) => b.input));
      for (const lead of res.created) {
        const id = idByKey.get(lead.leadKey);
        if (id !== undefined) created.push({ id, result: lead });
      }
      for (const key of res.already) {
        const id = idByKey.get(key);
        if (id !== undefined) already.push(id);
      }
      for (const f of res.failed) {
        const id = idByKey.get(f.leadKey);
        if (id !== undefined) failed.push(id);
      }
    } catch {
      for (const b of batch) failed.push(b.id);
    }
    done += batch.length;
    onProgress?.(done, items.length);
  }
  const order = new Map(items.map((item, i) => [item.id, i]));
  const byOrder = (a: string, b: string): number => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  created.sort((a, b) => byOrder(a.id, b.id));
  already.sort(byOrder);
  failed.sort(byOrder);
  return { created, already, failed };
}
