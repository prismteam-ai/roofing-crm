import { randomUUID } from 'node:crypto';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { EmbeddingService, TraceSink } from '@roofing/rag';
import {
  DEFAULTS,
  formatOpenDuration,
  type AgentAnswer,
  type AgentAsk,
  type Property,
} from '@roofing/shared';
import type { DatasetClient } from '../dataset/client.js';
import { logger } from '../logger.js';
import type { Geocoder } from './geocode.js';
import { applyDefaults, parseQuestion } from './parse.js';
import { retrieveEvidence, type Evidence } from './retrieval.js';

export interface AgentDeps {
  dataset: DatasetClient;
  embedder: EmbeddingService;
  traceSink: TraceSink;
  geocode: Geocoder;
  /** Explicit model (tests) or an OpenAI key; neither => offline templated mode. */
  model?: LanguageModel;
  openaiApiKey?: string;
  modelId?: string;
}

const SYSTEM = `You are a roofing lead assistant for Cook County, IL. Answer only from tool results.
Every permit listed under openPermits is OPEN today whatever its status label says (ISSUED, PERMIT ISSUED, IN REVIEW are open states); never describe them as closed.
Rules: cite every property as PIN <pin14> and every permit as permit <permit_id>, and include the source_url for each cited item.
Always end with two sections: "Assumptions:" (bulleted; defaults you applied such as radius ${DEFAULTS.radiusMiles} mi, roof age >= ${DEFAULTS.minRoofAge} y, open >= ${DEFAULTS.minOpenYears} y, or the map center used)
and "Missing data:" (bulleted; e.g. BBB rating not available, roof age unknown, place not geocoded). If nothing matches, say so plainly.
Workflow: geocode_place when the user names a place (otherwise use the provided map center), then find_properties, optionally summarize_area. Keep answers under 250 words.`;

const findInput = z.object({
  lat: z.number(),
  lon: z.number(),
  radiusMiles: z.number().min(0.1).max(50).default(DEFAULTS.radiusMiles),
  minRoofAge: z.number().optional().describe('only roofs at least this old (years)'),
  openPermitsOnly: z
    .boolean()
    .default(false)
    .describe('only properties with an open roofing permit'),
  minOpenYears: z
    .number()
    .optional()
    .describe('permit must have been open at least this many years'),
  limit: z.number().int().min(1).max(50).default(10),
});

function sections(evidence: Evidence[]): AgentAnswer['citations'] {
  const citations: AgentAnswer['citations'] = [];
  for (const e of evidence) {
    citations.push({ pin14: e.pin14, permitId: null, sourceUrl: e.sourceUrl });
    for (const x of e.openPermits)
      citations.push({ pin14: e.pin14, permitId: x.permitId, sourceUrl: x.sourceUrl });
  }
  return citations;
}

function parseBullets(text: string, heading: RegExp): string[] {
  const m = text.match(heading);
  if (!m || m.index === undefined) return [];
  const rest = text.slice(m.index + m[0].length);
  const end = rest.search(/\n\s*\n|\n[A-Z][a-z ]+:/);
  return (end === -1 ? rest : rest.slice(0, end))
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
}

export function createAgent(deps: AgentDeps) {
  const model =
    deps.model ??
    (deps.openaiApiKey
      ? createOpenAI({ apiKey: deps.openaiApiKey })(deps.modelId ?? 'gpt-4.1-mini')
      : undefined);

  async function fetchArea(input: z.infer<typeof findInput>, question: string) {
    const res = await deps.dataset.findProperties({
      lat: input.lat,
      lon: input.lon,
      radiusMiles: input.radiusMiles,
      minRoofAge: input.minRoofAge,
      openRoofingPermitsOnly: input.openPermitsOnly,
      minOpenDays:
        input.minOpenYears === undefined ? undefined : Math.round(input.minOpenYears * 365.25),
      limit: 300,
    });
    const retrieved = await retrieveEvidence(question, res.properties, deps.embedder, {
      k: input.limit,
      minRoofAge: input.minRoofAge,
      openOnly: input.openPermitsOnly,
      minOpenDays:
        input.minOpenYears === undefined ? undefined : Math.round(input.minOpenYears * 365.25),
    });
    return {
      ...retrieved,
      matched: res.properties.length,
      properties: res.properties,
      source: res.source,
    };
  }

  function areaStats(properties: Property[]) {
    const open = properties.filter((p) => p.permits.some((x) => x.is_roofing && x.status_is_open));
    const longOpen = properties.filter((p) =>
      p.permits.some(
        (x) =>
          x.is_roofing && x.status_is_open && (x.open_days ?? 0) >= DEFAULTS.minOpenYears * 365.25,
      ),
    );
    const ages = properties.map((p) => p.roof_age_years).filter((a): a is number => a !== null);
    const contractors = new Map<string, number>();
    for (const p of properties)
      for (const x of p.permits)
        if (x.is_roofing && x.contractor_name)
          contractors.set(x.contractor_name, (contractors.get(x.contractor_name) ?? 0) + 1);
    return {
      properties: properties.length,
      roofsOver15y: properties.filter((p) => (p.roof_age_years ?? 0) >= DEFAULTS.minRoofAge).length,
      openRoofingPermits: open.length,
      openOver5y: longOpen.length,
      roofAgeKnown: ages.length,
      avgRoofAge: ages.length ? +(ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : null,
      topContractors: [...contractors.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, permits]) => ({ name, permits })),
    };
  }

  async function askOffline(input: AgentAsk, traceId: string): Promise<AgentAnswer> {
    const parsed = parseQuestion(input.question);
    const d = applyDefaults(parsed);
    // no place in the question: the UI's current pin + radius are the default context
    if (!parsed.place && parsed.radiusMiles === null && input.context?.radiusMiles)
      d.radiusMiles = input.context.radiusMiles;
    const assumptions: string[] = [];
    const missing: string[] = [
      'Answer generated in offline mode (no OPENAI_API_KEY): templated from retrieval, not an LLM.',
    ];
    let center = input.context ? { lat: input.context.lat, lon: input.context.lon } : null;
    if (parsed.place) {
      const g = await deps.geocode(parsed.place);
      if (g) {
        center = { lat: g.lat, lon: g.lon };
        assumptions.push(
          `"${parsed.place}" resolved to ${g.displayName} (${g.lat.toFixed(4)}, ${g.lon.toFixed(4)}).`,
        );
      } else missing.push(`Could not geocode "${parsed.place}"; used the map center instead.`);
    }
    if (!center) {
      return {
        answer:
          'I need a location: name a place (e.g. "within 5 miles of Evanston") or drop a pin on the map first.',
        citations: [],
        assumptions,
        missingData: [...missing, 'No place in the question and no map center provided.'],
        traceId,
        mode: 'offline',
      };
    }
    if (parsed.radiusMiles === null)
      assumptions.push(
        `Radius not given; used ${d.radiusMiles} mi${!parsed.place && input.context?.radiusMiles ? ' (current map radius)' : ''}.`,
      );
    if (parsed.openPermits && parsed.minOpenYears === null)
      assumptions.push(`Open duration not given; used >= ${d.minOpenYears} years.`);
    if (!parsed.openPermits && parsed.minRoofAge === null)
      assumptions.push(`Roof age threshold not given; used >= ${d.minRoofAge} years.`);
    if (!parsed.place)
      assumptions.push(
        `Used the current map center (${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}).`,
      );

    const area = await fetchArea(
      {
        ...center,
        radiusMiles: d.radiusMiles,
        minRoofAge: d.minRoofAge,
        openPermitsOnly: parsed.openPermits,
        minOpenYears: d.minOpenYears,
        limit: 8,
      },
      input.question,
    );
    await deps.traceSink.write({
      traceId,
      at: new Date().toISOString(),
      stage: 'retrieval',
      data: {
        center,
        filters: d,
        matched: area.matched,
        indexed: area.indexed,
        hits: area.hits.length,
      },
    });
    const stats = areaStats(area.properties);
    const citations = sections(area.evidence);
    if (area.evidence.some((e) => e.roofAgeYears === null))
      missing.push('Roof age unknown for some cited properties (no year built / permit anchor).');
    if (area.evidence.some((e) => e.openPermits.some((x) => x.bbbRating === null)))
      missing.push('BBB rating not available for some contractors.');

    const lines = area.evidence.map((e, i) => {
      const permits = e.openPermits
        .map(
          (x) =>
            `permit ${x.permitId} (${x.status ?? 'status unknown'}, open ${formatOpenDuration(x.openDays)}, contractor ${x.contractor ?? 'unknown'}, BBB ${x.bbbRating ?? 'not available'}) ${x.sourceUrl ?? ''}`,
        )
        .join('; ');
      return `${i + 1}. PIN ${e.pin14} — ${e.address}; roof age ${e.roofAgeYears ?? 'unknown'}${e.roofAgeBasis ? ` (${e.roofAgeBasis})` : ''}${permits ? `; ${permits}` : ''}. Source: ${e.sourceUrl ?? 'n/a'}`;
    });
    const head = `${area.matched} propert${area.matched === 1 ? 'y' : 'ies'} match within ${d.radiusMiles} mi (${parsed.openPermits ? `open roofing permits >= ${d.minOpenYears} y` : `roofs >= ${d.minRoofAge} y old or open roofing permits`}). Area: ${stats.openRoofingPermits} with open roofing permits, ${stats.openOver5y} open >= 5 y, ${stats.roofsOver15y} roofs >= 15 y. Dataset run ${area.source.runId}.`;
    const answer = [
      head,
      '',
      lines.length
        ? `Top candidates:\n${lines.join('\n')}`
        : 'No matching properties in this area with these filters.',
      '',
      `Assumptions:\n${assumptions.map((a) => `- ${a}`).join('\n') || '- none'}`,
      '',
      `Missing data:\n${missing.map((m) => `- ${m}`).join('\n')}`,
    ].join('\n');
    return { answer, citations, assumptions, missingData: missing, traceId, mode: 'offline' };
  }

  async function askLlm(
    input: AgentAsk,
    traceId: string,
    llm: LanguageModel,
  ): Promise<AgentAnswer> {
    const collected: Evidence[] = [];
    const tools = {
      geocode_place: tool({
        description: 'Geocode a place name (city, neighbourhood, address) in the US to lat/lon.',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          const r = await deps.geocode(query);
          await deps.traceSink.write({
            traceId,
            at: new Date().toISOString(),
            stage: 'tool',
            data: { tool: 'geocode_place', query, found: !!r },
          });
          return r ?? { error: `No result for "${query}"` };
        },
      }),
      find_properties: tool({
        description:
          'Find roofing lead candidates around a point: old roofs and/or open roofing permits. Returns cited evidence rows.',
        inputSchema: findInput,
        execute: async (args) => {
          const area = await fetchArea(args, input.question);
          collected.push(...area.evidence);
          await deps.traceSink.write({
            traceId,
            at: new Date().toISOString(),
            stage: 'tool',
            data: {
              tool: 'find_properties',
              args,
              matched: area.matched,
              returned: area.evidence.length,
            },
          });
          return {
            matched: area.matched,
            source: area.source,
            evidence: area.evidence.map(({ score: _s, ...e }) => e),
          };
        },
      }),
      summarize_area: tool({
        description:
          'Aggregate statistics for an area: counts of old roofs, open permits, long-open permits, average roof age, top contractors.',
        inputSchema: z.object({
          lat: z.number(),
          lon: z.number(),
          radiusMiles: z.number().min(0.1).max(50).default(DEFAULTS.radiusMiles),
        }),
        execute: async (args) => {
          const res = await deps.dataset.findProperties({ ...args, limit: 500 });
          const stats = areaStats(res.properties);
          await deps.traceSink.write({
            traceId,
            at: new Date().toISOString(),
            stage: 'tool',
            data: { tool: 'summarize_area', args, stats },
          });
          return { ...stats, source: res.source };
        },
      }),
    };
    const ctx = input.context
      ? `Current map center: lat ${input.context.lat}, lon ${input.context.lon}${input.context.radiusMiles ? `, radius ${input.context.radiusMiles} mi` : ''}. If the question names no place, use this center and radius as the default context.`
      : 'No map center provided.';
    const result = await generateText({
      model: llm,
      system: SYSTEM,
      prompt: `${ctx}\n\nQuestion: ${input.question}`,
      tools,
      stopWhen: stepCountIs(6),
    });
    const text = result.text.trim();
    const citations = sections(
      collected.filter(
        (e) => text.includes(e.pin14) || e.openPermits.some((x) => text.includes(x.permitId)),
      ),
    );
    return {
      answer: text,
      citations,
      assumptions: parseBullets(text, /assumptions:/i),
      missingData: parseBullets(text, /missing data:/i),
      traceId,
      mode: 'llm',
    };
  }

  return {
    mode: model ? ('llm' as const) : ('offline' as const),
    async ask(input: AgentAsk): Promise<AgentAnswer> {
      const traceId = randomUUID();
      await deps.traceSink.write({
        traceId,
        at: new Date().toISOString(),
        stage: 'question',
        data: {
          question: input.question,
          context: input.context ?? null,
          mode: model ? 'llm' : 'offline',
        },
      });
      try {
        const out = model ? await askLlm(input, traceId, model) : await askOffline(input, traceId);
        await deps.traceSink.write({
          traceId,
          at: new Date().toISOString(),
          stage: 'answer',
          data: { citations: out.citations.length, mode: out.mode },
        });
        return out;
      } catch (err) {
        logger.error({ traceId, err: String(err) }, 'agent failed');
        await deps.traceSink.write({
          traceId,
          at: new Date().toISOString(),
          stage: 'error',
          data: { message: String(err) },
        });
        throw err;
      }
    },
  };
}
export type Agent = ReturnType<typeof createAgent>;
