/**
 * The agent's orchestration layer: resolves places from real data, runs the
 * same deterministic queries the map uses, and optionally asks Gemini (via
 * the Cloudflare Worker) to either parse a question the deterministic parser
 * couldn't, or phrase a real result set more conversationally.
 *
 * Gemini never sees or invents property data on its own -- it either (a)
 * extracts structured parameters from a question, which are then run through
 * the exact same DuckDB queries as everything else, or (b) rephrases a
 * result set it was actually given, checked afterward for citing at least
 * one real permit/parcel id from that set before it's trusted. Either way,
 * a failure (no key, quota, network, a response that doesn't check out)
 * falls back to the deterministic text, never to a blocked answer.
 */
import { tableUrls, type DataSource, type LatestManifest } from '@roofing-crm/consumer';
import { parseIntent, type LatLon, type QueryIntent } from '@roofing-crm/shared';
import { AGENT_PROXY_URL, BREVARD, DEFAULT_RADIUS_MILES, DEFAULT_ROOF_AGE_THRESHOLD } from '../config.js';
import { getConnection, getDuckDB, registerTableFiles, runQuery } from './duckdb.js';
import { queryLeadCandidates, type LeadCandidate } from './leads.js';
import { isOpenPermitCandidate, queryOpenRoofingPermitLeads } from './permits.js';

export interface PlaceInfo extends LatLon {
  name: string;
  propertyCount: number;
}

let placesPromise: Promise<PlaceInfo[]> | null = null;

/**
 * Real place centroids, derived live from the properties table -- never a
 * hardcoded list. A city with too few parcels is dropped as noise (typos,
 * rare aliases), not because it isn't real.
 */
export async function resolvePlaces(source: DataSource, manifest: LatestManifest): Promise<PlaceInfo[]> {
  placesPromise ??= (async () => {
    const db = await getDuckDB();
    const conn = await getConnection();
    const urls = tableUrls(source, manifest, 'properties');
    const files = await registerTableFiles(db, 'properties', urls);
    const filesLiteral = Array.isArray(files) ? files : [files];
    const { rows } = await runQuery(conn, { sql: buildPlacesSql(filesLiteral), params: [] });
    return rows.map((r) => ({
      name: String(r['name']),
      propertyCount: Number(r['n']),
      lat: Number(r['lat']),
      lon: Number(r['lon']),
    }));
  })();
  return placesPromise;
}

function buildPlacesSql(files: string[]): string {
  const list = files.map((f) => `'${f.replace(/'/g, "''")}'`).join(', ');
  return `
    SELECT situs_city AS name, COUNT(*) AS n, AVG(lat) AS lat, AVG(lon) AS lon
    FROM read_parquet([${list}])
    WHERE situs_city IS NOT NULL
    GROUP BY situs_city
    HAVING COUNT(*) >= 100
    ORDER BY n DESC`;
}

export interface Citation {
  parcelId: string;
  permitNumber: string | null;
  label: string;
}

export interface AgentAnswer {
  text: string;
  citations: Citation[];
  /** Whether Gemini's phrasing was used, or the guaranteed-correct deterministic text. */
  usedLlm: boolean;
  centerUsed: LatLon;
}

function buildDeterministicText(intent: QueryIntent, center: LatLon, radiusMiles: number, results: LeadCandidate[]): string {
  const placeLabel = intent.place ? ` of ${intent.place}` : ` of ${center.lat.toFixed(3)}, ${center.lon.toFixed(3)}`;
  if (results.length === 0) {
    return `No matching properties or open roofing permits found within ${radiusMiles} miles${placeLabel}.`;
  }
  const kind = intent.wantsOpenPermits ? 'open roofing permits' : 'matching properties';
  const lines = [`Found ${results.length} ${kind} within ${radiusMiles} miles${placeLabel}.`];
  for (const c of results.slice(0, 5)) {
    if (isOpenPermitCandidate(c)) {
      lines.push(
        `• ${c.address ?? c.parcelId} — permit ${c.permitNumber}, open ${(c.permitOpenDays / 365).toFixed(1)} yrs`
        + (c.issuedDate ? ` (since ${c.issuedDate})` : ''),
      );
    } else {
      lines.push(
        `• ${c.address ?? c.parcelId} — roof ${c.roofAgeYears ?? 'unknown'} yrs`
        + (c.roofAgeBasis === 'ACT_YR_BLT' || c.roofAgeBasis === 'EFF_YR_BLT' ? ' (building-age proxy)' : ''),
      );
    }
  }
  if (results.length > 5) lines.push(`…and ${results.length - 5} more.`);
  return lines.join('\n');
}

async function callGemini(prompt: string): Promise<string | null> {
  if (!AGENT_PROXY_URL) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(`${AGENT_PROXY_URL}?model=gemini-3.6-flash&action=generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

/** Structured extraction for a question the deterministic parser found nothing in. */
async function extractIntentWithGemini(question: string, places: readonly string[]): Promise<QueryIntent | null> {
  const prompt = `Extract search parameters from this roofing-lead question as JSON only, no prose.
Question: "${question}"
Known places: ${places.join(', ')}
Return exactly: {"place": string|null (must be one of the known places or null), "radiusMiles": number|null, "roofAgeThresholdYears": number|null, "wantsOpenPermits": boolean, "minOpenYears": number|null}`;
  const text = await callGemini(prompt);
  if (!text) return null;
  try {
    const jsonMatch = /\{[\s\S]*\}/.exec(text);
    if (!jsonMatch) return null;
    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    const place = typeof p['place'] === 'string' && places.includes(p['place']) ? p['place'] : null;
    const clamp = (v: unknown, min: number, max: number): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
    return {
      place,
      radiusMiles: clamp(p['radiusMiles'], 0.5, 25),
      roofAgeThresholdYears: clamp(p['roofAgeThresholdYears'], 0, 100),
      wantsOpenPermits: p['wantsOpenPermits'] === true,
      minOpenYears: clamp(p['minOpenYears'], 0, 100),
    };
  } catch {
    return null;
  }
}

const HELP_TEXT = 'Try something like: "open roofing permits older than five years within five miles of '
  + 'Merritt Island" or "roofs older than 20 years within 10 miles of Cocoa".';

export async function answerQuestion(
  question: string,
  source: DataSource,
  manifest: LatestManifest,
): Promise<AgentAnswer> {
  const places = await resolvePlaces(source, manifest);
  const placeNames = places.map((p) => p.name);
  let intent = parseIntent(question, placeNames);

  if (intent.place === null && intent.radiusMiles === null && intent.roofAgeThresholdYears === null
    && !intent.wantsOpenPermits) {
    const llmIntent = await extractIntentWithGemini(question, placeNames);
    if (llmIntent && (llmIntent.place || llmIntent.wantsOpenPermits || llmIntent.roofAgeThresholdYears !== null)) {
      intent = llmIntent;
    } else {
      return { text: `I couldn't work out what to search for. ${HELP_TEXT}`, citations: [], usedLlm: false, centerUsed: BREVARD.center };
    }
  }

  const center: LatLon = intent.place
    ? (places.find((p) => p.name === intent.place) ?? { ...BREVARD.center })
    : { ...BREVARD.center };
  const radiusMiles = intent.radiusMiles ?? DEFAULT_RADIUS_MILES;

  const results: LeadCandidate[] = intent.wantsOpenPermits
    ? (await queryOpenRoofingPermitLeads(source, manifest, { center, radiusMiles, limit: 50 }))
        .filter((c) => intent.minOpenYears === null || c.permitOpenDays / 365 >= intent.minOpenYears)
    : await queryLeadCandidates(source, manifest, {
        center, radiusMiles, roofAgeThreshold: intent.roofAgeThresholdYears ?? DEFAULT_ROOF_AGE_THRESHOLD,
      });

  const citations: Citation[] = results.slice(0, 10).map((c) => ({
    parcelId: c.parcelId,
    permitNumber: isOpenPermitCandidate(c) ? c.permitNumber : null,
    label: c.address ?? c.parcelId,
  }));

  const deterministicText = buildDeterministicText(intent, center, radiusMiles, results);

  if (results.length === 0) return { text: deterministicText, citations, usedLlm: false, centerUsed: center };

  const summary = results.slice(0, 8).map((c) => (isOpenPermitCandidate(c)
    ? `${c.address ?? c.parcelId} | permit ${c.permitNumber} | open ${(c.permitOpenDays / 365).toFixed(1)} yrs | parcel ${c.parcelId}`
    : `${c.address ?? c.parcelId} | roof ${c.roofAgeYears ?? 'unknown'} yrs (${c.roofAgeBasis}) | parcel ${c.parcelId}`
  )).join('\n');
  const phrasePrompt = `You are a roofing lead assistant. Write a short (2-4 sentence), friendly summary of these `
    + `real search results for the question "${question}". Cite exact permit numbers and/or parcel ids VERBATIM `
    + `from the data below -- never invent an address, permit number, or parcel id that is not listed.\n\n${summary}`;
  const llmText = await callGemini(phrasePrompt);

  const citedIds = new Set([...citations.map((c) => c.parcelId), ...citations.map((c) => c.permitNumber).filter((x): x is string => x !== null)]);
  const isGrounded = llmText !== null && [...citedIds].some((id) => llmText.includes(id));

  return {
    text: isGrounded && llmText ? llmText : deterministicText,
    citations,
    usedLlm: isGrounded,
    centerUsed: center,
  };
}
