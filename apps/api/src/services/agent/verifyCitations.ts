// T031 (B-09, Phase 4/US1): the server-side citation verifier (ADR-06 §4/§5,
// docs/decisions/0000-agent-architecture.md). Every `claims[].citationIds` entry must resolve
// against (a) this turn's own tool-result set — the model cannot cite a citation id it was never
// handed — and (b) the live index for the current `manifestCid`, so a citation that is merely
// tool-result-shaped but no longer (or never) really in the promoted run is still caught. A claim
// failing either check is dropped before the answer leaves the server, never shown unverified
// (constitution XI, data honesty); when no claim survives, a deterministic template built from the
// server-computed `counts` (never from model text) stands in for the answer instead.
//
// B-09 review (CR-B-09):
//  - finding 6: permit citations are checked against the index too — the permit must be on its
//    property in the promoted run, under the same manifest. Run citations must name this turn's
//    manifest.
//  - finding 11: with `textFacts`, each surviving claim's text is checked by `claimText.ts`
//    (numbers and identifiers must come from its cited rows or the counts); a failing claim is
//    dropped and its citations count as unverified.
import type { AgentAnswer } from "@crm/shared";
import type { LeadIndex } from "../../adapters/duckDbParquet.js";
import { checkClaimText } from "./claimText.js";

type Claim = AgentAnswer["claims"][number];
type Citation = AgentAnswer["citations"][number];
type Counts = AgentAnswer["counts"];

/** What one citation's row carries, for the claim-text check. */
export interface CitationFacts {
  readonly numbers: readonly number[];
  readonly identifiers: readonly string[];
}

export interface ClaimTextFactsInput {
  /** Counts and the validated plan's numbers — allowed in any claim. */
  readonly allowedNumbers: readonly number[];
  /** Every identifier in this turn's evidence. */
  readonly turnIdentifiers: readonly string[];
  readonly forCitation: (citation: Citation) => CitationFacts | undefined;
}

export interface VerifyCitationsInput {
  readonly claims: readonly Claim[];
  readonly citations: readonly Citation[];
  /** Citation ids this turn's tool calls actually produced — not every id in `citations` need
   *  have come from a tool call; only these may ever be cited. */
  readonly toolResultCitationIds: ReadonlySet<number>;
  readonly leadIndex: LeadIndex;
  readonly manifestCid: string;
  /** Used only to build the fallback template when every claim is stripped; never copied from
   *  model text into the kept claims themselves. */
  readonly counts: Counts;
  /** Optional claim-text check (finding 11). Without it only citation ids are checked. */
  readonly textFacts?: ClaimTextFactsInput;
}

export interface VerifyCitationsResult {
  readonly claims: Claim[];
  /** How many of the input claims were dropped (metric `CitationDropped`, ADR §10 pattern #10). */
  readonly droppedCount: number;
  /** How many of those were dropped by the claim-text check (their citations did resolve). */
  readonly droppedForText: number;
  /** Citation ids that resolved in the index and back at least one kept claim. */
  readonly verifiedCitationIds: ReadonlySet<number>;
  /** True when the returned `claims` is the deterministic fallback template, not model text. */
  readonly usedTemplate: boolean;
}

/** One verified-citations-only sentence built from server-computed counts — no model call, no
 *  model text. Returns no claims (so the caller can fall through to `empty_in_scope`/similar
 *  instead) when there is nothing verified left to cite. */
function templateClaims(counts: Counts, verifiedCitationIds: readonly number[]): Claim[] {
  if (verifiedCitationIds.length === 0) return [];
  const text = `Found ${counts.matched} matching record${counts.matched === 1 ? "" : "s"}; showing ${counts.shown}.`;
  return [{ text, citationIds: [...verifiedCitationIds] }];
}

/** Batch-checks every distinct property and permit citation against the live index once (one
 *  `getProperty` per distinct property; a permit is checked through its property's permit list). */
async function indexVerifiedCitationIds(
  citations: readonly Citation[],
  leadIndex: LeadIndex,
  manifestCid: string,
): Promise<Set<number>> {
  const propertyCids = new Set<string>();
  for (const c of citations) {
    if ((c.kind === "property" || c.kind === "permit") && c.propertyCid !== undefined) {
      propertyCids.add(c.propertyCid);
    }
  }
  const liveProperties = new Set<string>();
  const livePermits = new Set<string>();
  await Promise.all(
    [...propertyCids].map(async (cid) => {
      const found = await leadIndex.getProperty(cid);
      if (found === null || found.sourceManifestCid !== manifestCid) return;
      liveProperties.add(cid);
      for (const p of found.permits ?? []) {
        if (p.sourceManifestCid === manifestCid) livePermits.add(`${cid}|${p.permitCid}`);
      }
    }),
  );

  const verified = new Set<number>();
  for (const c of citations) {
    const ok =
      c.kind === "property"
        ? c.propertyCid !== undefined && liveProperties.has(c.propertyCid)
        : c.kind === "permit"
          ? c.propertyCid !== undefined &&
            c.permitCid !== undefined &&
            livePermits.has(`${c.propertyCid}|${c.permitCid}`)
          : c.kind === "run"
            ? c.manifestCid === manifestCid
            : true; // place: the gazetteer is vendored and versioned; nothing live to check
    if (ok) verified.add(c.id);
  }
  return verified;
}

export async function verifyCitations(input: VerifyCitationsInput): Promise<VerifyCitationsResult> {
  const { claims, citations, toolResultCitationIds, leadIndex, manifestCid, counts, textFacts } =
    input;
  const byId = new Map(citations.map((c) => [c.id, c]));
  const live = await indexVerifiedCitationIds(
    citations.filter((c) => toolResultCitationIds.has(c.id)),
    leadIndex,
    manifestCid,
  );
  const citationResolves = (id: number): boolean => toolResultCitationIds.has(id) && live.has(id);

  const kept: Claim[] = [];
  let droppedCount = 0;
  let droppedForText = 0;
  for (const claim of claims) {
    if (claim.citationIds.length === 0 || !claim.citationIds.every(citationResolves)) {
      droppedCount++;
      continue;
    }
    if (textFacts !== undefined && !claimTextOk(claim, byId, textFacts)) {
      droppedCount++;
      droppedForText++;
      continue;
    }
    kept.push(claim);
  }

  if (kept.length > 0) {
    const verifiedCitationIds = new Set(kept.flatMap((c) => c.citationIds));
    return { claims: kept, droppedCount, droppedForText, verifiedCitationIds, usedTemplate: false };
  }

  // Nothing survived verification: fall back to a deterministic, counts-based template built
  // only from citations that themselves passed verification (never from the stripped claims'
  // text) — if even that is empty, the caller has no citable evidence at all and should choose a
  // non-"answered" outcome (empty_in_scope, etc.) rather than call this template "answered".
  const templateIds = citations.filter((c) => citationResolves(c.id)).map((c) => c.id);
  return {
    claims: templateClaims(counts, templateIds),
    droppedCount,
    droppedForText,
    verifiedCitationIds: new Set(templateIds),
    usedTemplate: true,
  };
}

function claimTextOk(
  claim: Claim,
  byId: ReadonlyMap<number, Citation>,
  textFacts: ClaimTextFactsInput,
): boolean {
  const numbers: number[] = [];
  const identifiers: string[] = [];
  const rows = new Set<string>();
  for (const id of claim.citationIds) {
    const citation = byId.get(id);
    if (citation === undefined) continue;
    rows.add(citation.permitCid ?? citation.propertyCid ?? citation.manifestCid);
    const facts = textFacts.forCitation(citation);
    if (facts === undefined) continue;
    numbers.push(...facts.numbers);
    identifiers.push(...facts.identifiers);
  }
  return checkClaimText(claim.text, {
    citedNumbers: numbers,
    citedIdentifiers: identifiers,
    turnIdentifiers: textFacts.turnIdentifiers,
    allowedNumbers: textFacts.allowedNumbers,
    citedRowCount: rows.size,
  }).ok;
}
