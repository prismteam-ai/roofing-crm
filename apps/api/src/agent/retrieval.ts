import {
  InMemoryRetrievalIndex,
  propertyToDocs,
  type EmbeddingService,
  type RetrievalHit,
} from '@roofing/rag';
import type { Property } from '@roofing/shared';

/** Compact, citable row handed to the model / the templated answer. */
export interface Evidence {
  pin14: string;
  address: string;
  roofAgeYears: number | null;
  roofAgeBasis: string | null;
  openPermits: {
    permitId: string;
    status: string | null;
    openDays: number | null;
    contractor: string | null;
    bbbRating: string | null;
    sourceUrl: string | null;
  }[];
  sourceUrl: string | null;
  score: number;
}

/** Hybrid retrieval over the properties fetched for an area: filter via metadata, embed, rank, then fold back to properties. */
export async function retrieveEvidence(
  question: string,
  properties: Property[],
  embedder: EmbeddingService,
  opts: { k?: number; minRoofAge?: number; openOnly?: boolean; minOpenDays?: number } = {},
): Promise<{ evidence: Evidence[]; hits: RetrievalHit[]; indexed: number }> {
  const index = new InMemoryRetrievalIndex(embedder);
  const byPin = new Map(properties.map((p) => [p.pin14, p]));
  await index.index(properties.flatMap(propertyToDocs));
  const hits = await index.search(question, {
    k: (opts.k ?? 10) * 2,
    filter: {
      minRoofAge: opts.minRoofAge,
      openRoofingOnly: opts.openOnly,
      minOpenDays: opts.minOpenDays,
    },
    maxCandidates: 300,
  });
  const seen = new Map<string, Evidence>();
  for (const h of hits) {
    const pin = h.doc.metadata.pin14;
    if (!pin || seen.has(pin)) continue;
    const p = byPin.get(pin);
    if (!p) continue;
    seen.set(pin, {
      pin14: p.pin14,
      address: `${p.address}, ${p.city ?? ''} ${p.zip ?? ''}`.trim(),
      roofAgeYears: p.roof_age_years,
      roofAgeBasis: p.roof_age_basis,
      openPermits: p.permits
        .filter((x) => x.is_roofing && x.status_is_open)
        .map((x) => ({
          permitId: x.permit_id,
          status: x.status,
          openDays: x.open_days,
          contractor: x.contractor_name,
          bbbRating: x.contractor?.bbb_rating ?? null,
          sourceUrl: x.source_url,
        })),
      sourceUrl: p.source_url,
      score: h.score,
    });
    if (seen.size >= (opts.k ?? 10)) break;
  }
  return { evidence: [...seen.values()], hits, indexed: index.size() };
}
