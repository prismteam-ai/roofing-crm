import type Anthropic from "@anthropic-ai/sdk";
import { agentUrl } from "../config";
import { agingRoofs, openPermits, permitCounts, permitsForProperty, propertyByKey } from "./queries";
import type { PermitFilter, PermitLead, Pin, Property } from "./types";

/** What the agent loop leaves on the map after it finishes (the rows behind its answer). */
export interface AgentResults {
  roofs?: { rows: Property[]; total: number; pin: Pin; radius: number; minAge: number };
  permits?: { rows: PermitLead[]; pin: Pin; radius: number; filter: PermitFilter };
}
export interface MapContext { pin: Pin; radiusMiles: number; roofAgeYears: number }
export interface ToolTrace { name: string; summary: string }
export interface AgentTurn { text: string; trace: ToolTrace[]; results: AgentResults }

const SHOWN_ROWS = 15; // Claude summarizes; it doesn't need all 1500 rows
const MAX_STEPS = 8;

const pinOf = (v: any): Pin => {
  const lat = Number(v?.lat), lon = Number(v?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("pin must have numeric lat/lon");
  return { lat, lon };
};
const radiusOf = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error("radiusMiles must be a positive number");
  return Math.min(n, 25);
};
const keyOf = (v: any) => {
  if (typeof v?.propertyKey !== "string" || !v.propertyKey) throw new Error("propertyKey must be a string");
  return v.propertyKey;
};
const r2 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100);

const compactProperty = (p: Property) => ({
  property_key: p.property_key, address: p.situs_address, town: p.town_or_city, roof_age_years: p.roof_age_years,
  roof_age_confidence: p.roof_age_confidence, roof_age_basis: p.roof_age_basis, owner: p.owner_name,
  owner_location: p.owner_location_class, bbb_score: p.bbb_score, miles: r2(p.miles),
});
const compactPermit = (p: PermitLead) => ({
  permit_no: p.permit_no, property_key: p.property_key, address: p.situs_address, status: p.status, years_open: r2(p.years_open),
  open_since: p.open_since, roofing_confidence: p.roofing_confidence, contractor: p.contractor_name, bbb_score: p.bbb_score,
  roof_age_years: p.roof_age_years, description: p.job_description?.slice(0, 100) ?? null, miles: r2(p.miles),
});

interface Executed { content: string; summary: string }

async function runTool(name: string, input: any, results: AgentResults): Promise<Executed> {
  switch (name) {
    case "agingRoofs": {
      const pin = pinOf(input.pin), radius = radiusOf(input.radiusMiles), minAge = Number(input.minAgeYears);
      if (!Number.isFinite(minAge)) throw new Error("minAgeYears must be a number");
      const r = await agingRoofs(pin, radius, minAge, input.withoutOpenPermit === true);
      results.roofs = { rows: r.rows, total: r.total, pin, radius, minAge };
      const shown = r.rows.slice(0, SHOWN_ROWS).map(compactProperty);
      return { content: JSON.stringify({ total: r.total, shown: shown.length, rows: shown }), summary: `${r.total} aged roofs` };
    }
    case "openPermits": {
      const pin = pinOf(input.pin), radius = radiusOf(input.radiusMiles);
      const filter = input.filter as PermitFilter;
      if (!["roofing", "roofing_low", "all_open"].includes(filter)) throw new Error("filter must be roofing, roofing_low or all_open");
      const r = await openPermits(pin, radius, filter);
      results.permits = { rows: r.rows, pin, radius, filter };
      const shown = r.rows.slice(0, SHOWN_ROWS).map(compactPermit);
      return { content: JSON.stringify({ total: r.total, shown: shown.length, rows: shown }), summary: `${r.total} open permits` };
    }
    case "permitCounts": {
      const counts = await permitCounts(pinOf(input.pin), radiusOf(input.radiusMiles));
      return { content: JSON.stringify(counts), summary: `${Object.values(counts).reduce((a, b) => a + b, 0)} open permits by confidence` };
    }
    case "permitsForProperty": {
      const rows = await permitsForProperty(keyOf(input));
      const shown = rows.slice(0, SHOWN_ROWS).map((p) => ({ ...p, job_description: p.job_description?.slice(0, 160) ?? null, trade_contacts: undefined }));
      return { content: JSON.stringify({ total: rows.length, rows: shown }), summary: `${rows.length} permits on property` };
    }
    case "propertyByKey": {
      const p = await propertyByKey(keyOf(input));
      return { content: JSON.stringify(p ? { ...p, miles: undefined } : null), summary: p ? "1 property" : "not found" };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

async function callWorker(messages: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
  const res = await fetch(agentUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `agent request failed (${res.status})`);
  return body as Anthropic.Message;
}

/**
 * One user question -> tool loop -> final text. `history` is the running Anthropic message list and is
 * appended to in place, so follow-up questions keep their context (assistant content is stored verbatim).
 */
export async function ask(history: Anthropic.MessageParam[], question: string, map: MapContext, onStep?: (t: ToolTrace) => void): Promise<AgentTurn> {
  const results: AgentResults = {};
  const trace: ToolTrace[] = [];
  // Map state rides in the user message (append-only history), not the system prompt: see worker/src/index.ts.
  history.push({ role: "user", content: `[Map state: pin lat ${map.pin.lat.toFixed(5)}, lon ${map.pin.lon.toFixed(5)}; radius ${map.radiusMiles} mi; roof-age threshold ${map.roofAgeYears} yrs]\n${question}` });

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await callWorker(history);
    history.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (res.stop_reason !== "tool_use" || calls.length === 0) {
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      const fallback = res.stop_reason === "refusal" ? "The model declined to answer that." : res.stop_reason === "max_tokens" ? "The answer was cut off; try a narrower question." : "No answer produced.";
      return { text: text || fallback, trace, results };
    }

    // Parallel tool calls: all results go back in ONE user message.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      try {
        const out = await runTool(call.name, call.input, results);
        toolResults.push({ type: "tool_result", tool_use_id: call.id, content: out.content });
        const t = { name: call.name, summary: out.summary };
        trace.push(t); onStep?.(t);
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        toolResults.push({ type: "tool_result", tool_use_id: call.id, content: `Error: ${msg}`, is_error: true });
        const t = { name: call.name, summary: `error: ${msg}` };
        trace.push(t); onStep?.(t);
      }
    }
    history.push({ role: "user", content: toolResults });
  }
  return { text: "I couldn't finish within the step limit; try a simpler question.", trace, results };
}
