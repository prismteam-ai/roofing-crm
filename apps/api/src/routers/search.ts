import {
  scoreLead,
  searchInputSchema,
  type Candidate,
  type SearchInput,
  type SearchResult,
} from '@roofing-crm/shared';
import type { OracleLeadRow } from '../ports.js';
import { publicProcedure, router } from '../trpc.js';

export function toCandidate(row: OracleLeadRow, roofAgeThreshold: number): Candidate {
  const { score, reasons } = scoreLead({
    roofAgeYears: row.roofAgeYears,
    roofBasisIsPermit: row.roofBasis === 'last_roofing_permit',
    openRoofPermits: row.openRoofPermits,
    longestOpenDays: row.longestOpenDays,
    ownerOccupied: row.ownerOccupied,
    roofAgeThreshold,
  });
  return { ...row, score, scoreReasons: reasons };
}

export function sortCandidates(candidates: Candidate[], sort: SearchInput['sort']): Candidate[] {
  const byNullableDesc = (a: number | null, b: number | null): number => (b ?? -1) - (a ?? -1);
  const sorted = [...candidates];
  switch (sort) {
    case 'distance':
      return sorted.sort((a, b) => a.distanceMiles - b.distanceMiles);
    case 'roof_age':
      return sorted.sort((a, b) => byNullableDesc(a.roofAgeYears, b.roofAgeYears));
    case 'open_days':
      return sorted.sort((a, b) => byNullableDesc(a.longestOpenDays, b.longestOpenDays));
    case 'score':
      return sorted.sort((a, b) => b.score - a.score || a.distanceMiles - b.distanceMiles);
  }
}

export const searchRouter = router({
  /** Lead candidates inside the radius: aged roofs, open roofing permits, or both. */
  radius: publicProcedure
    .input(searchInputSchema)
    .query(async ({ input, ctx }): Promise<SearchResult> => {
      const started = Date.now();
      const found = await ctx.oracle.searchLeads(input);
      const candidates = sortCandidates(
        found.rows.map((row) => toCandidate(row, input.minRoofAgeYears)),
        input.sort,
      );
      return {
        total: found.total,
        agedRoofCount: found.agedRoofCount,
        openPermitCount: found.openPermitCount,
        candidates,
        asOf: found.asOf,
        elapsedMs: Date.now() - started,
      };
    }),
});
