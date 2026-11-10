import type { Contractor } from './schemas.js';

/** One BBB wording for the drawer, the agent answer and the RAG corpus. */
export const bbbLabel = (
  c: Pick<Contractor, 'bbb_rating' | 'bbb_state' | 'ingested_at'> | null | undefined,
): string => {
  if (!c) return 'BBB: not available (no contractor match)';
  if (c.bbb_state === 'stale')
    return `BBB: ${c.bbb_rating ?? 'unknown'} (archived copy, ${c.ingested_at.slice(0, 10)})`;
  if (c.bbb_rating) return `BBB: ${c.bbb_rating}`;
  if (c.bbb_state === 'confirmed_empty') return 'BBB: no rating on file';
  if (c.bbb_state === 'unknown') return 'BBB: unknown (not checked)';
  return 'BBB: not available (no public source)';
};
