import type { Permit } from './schemas.js';

/** A false open flag alone is not evidence that a permit closed. */
export function permitState(
  p: Pick<Permit, 'status' | 'status_is_open'> & Partial<Pick<Permit, 'closed_at'>>,
): 'open' | 'closed' | 'status unknown' {
  if (p.status_is_open) return 'open';
  if (
    p.closed_at ||
    /^(CLOSED|COMPLETE|CANCELLED|CANCELED|EXPIRED|REVOKED|FINALED)$/.test(
      p.status?.trim().toUpperCase() ?? '',
    )
  )
    return 'closed';
  return 'status unknown';
}
