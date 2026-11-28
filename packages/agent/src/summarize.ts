import type { AgentAnswer, AgentContext } from "./schema.ts";

export type ToolRun = { tool: string; args: Record<string, unknown>; output: any; error?: string };

const RADIUS_TOOLS = new Set([
  "find_aged_roofs",
  "find_open_roof_permits",
  "find_long_held_properties",
  "find_out_of_area_owners",
  "find_by_occupancy",
  "search_records",
]);

/** An MCP tool result's payload: structuredContent, else the JSON text content. */
export function payloadOf(output: any): any {
  if (!output || typeof output !== "object") return output;
  if (output.structuredContent && typeof output.structuredContent === "object")
    return output.structuredContent;
  const text = Array.isArray(output.content)
    ? output.content.find((c: any) => c?.type === "text")?.text
    : undefined;
  if (typeof text === "string") {
    try {
      return JSON.parse(text);
    } catch {
      return output.isError ? { error: text } : { text };
    }
  }
  return output;
}

function rowsOf(o: any): any[] {
  if (!o || typeof o !== "object") return [];
  if (Array.isArray(o.rows)) return o.rows;
  if (Array.isArray(o.hits)) return o.hits;
  if (o.property && typeof o.property === "object" && !o.permit) return [o.property, ...(o.permits ?? [])];
  if (o.permit) {
    const p = o.property;
    return [
      {
        ...o.permit,
        ...(p ? { lat: p.lat, lon: p.lon, address: p.address, parcel_identifier: p.parcel_identifier } : {}),
      },
    ];
  }
  if (o.contractor && Array.isArray(o.permits)) return o.permits;
  return [];
}

const label = (r: any) =>
  String(
    r.address ?? r.contractor_name ?? r.name ?? r.permit_key ?? r.parcel_identifier ?? r.text ?? "",
  ).slice(0, 120);

const near = (a?: { lat: number; lon: number }, b?: { lat: number; lon: number }) =>
  !!a && !!b && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
const fmt = (c: { lat: number; lon: number }) => `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`;

/**
 * The structured parts of an answer, all from what the tools returned: retrieval steps, map
 * results, citations (only records a tool returned), assumptions and the area for follow-ups.
 */
export function summarizeRuns(
  runs: ToolRun[],
  ctx: {
    text: string;
    message: string;
    previous?: AgentContext;
    mapContext?: { center: { lat: number; lon: number }; radiusMiles: number };
  },
): Omit<AgentAnswer, "text" | "model" | "usage"> {
  const { text, message, previous, mapContext } = ctx;
  const payloads = runs.map((r) => ({ ...r, out: payloadOf(r.output) }));
  const steps = payloads.map((r) => {
    const rows = rowsOf(r.out);
    const err =
      r.error ?? (r.output?.isError ? String(r.out?.error ?? r.out?.text ?? "tool failed") : undefined);
    return {
      tool: r.tool,
      args: r.args,
      rowCount: rows.length || (r.out?.found === true ? 1 : 0),
      sample: rows
        .slice(0, 3)
        .map((x) => String(x.permit_key ?? x.parcel_identifier ?? label(x)))
        .filter(Boolean),
      ...(err ? { error: err.slice(0, 300) } : {}),
    };
  });

  const results = new Map<string, AgentAnswer["results"][number]>();
  const all = new Map<string, AgentAnswer["citations"][number]>();
  const mentioned = new Map<string, AgentAnswer["citations"][number]>();
  for (const r of payloads) {
    for (const row of rowsOf(r.out)) {
      const pid = typeof row.parcel_identifier === "string" ? row.parcel_identifier : undefined;
      if (
        pid &&
        typeof row.lat === "number" &&
        typeof row.lon === "number" &&
        !results.has(pid) &&
        results.size < 200
      )
        results.set(pid, { propertyId: pid, lat: row.lat, lon: row.lon, label: label(row) });
      const url = row.source_url ?? row.provenance?.[0]?.source_url;
      if (!url) continue;
      const key = String(row.permit_key ?? pid ?? url);
      const c = {
        ...(pid ? { propertyId: pid } : {}),
        ...(row.permit_key ? { permitId: String(row.permit_key) } : {}),
        sourceUrl: String(url),
      };
      if (!all.has(key)) all.set(key, c);
      if (
        (pid && text.includes(pid)) ||
        (row.permit_number && text.includes(String(row.permit_number))) ||
        (row.permit_key && text.includes(String(row.permit_key)))
      )
        mentioned.set(key, c);
    }
  }
  const citations = (mentioned.size ? [...mentioned.values()] : [...all.values()].slice(0, 10)).slice(0, 25);

  const assumptions: string[] = [];
  const missing = new Set<string>();
  let context: AgentContext = previous ?? {};
  let resolved: { name: string; lat: number; lon: number } | null = null;
  let unresolved: string | null = null;
  for (const r of payloads) {
    const o = r.out ?? {};
    if (r.tool === "resolve_place") {
      if (o.found && o.place) {
        resolved = o.place;
        assumptions.push(`"${r.args.name}" was resolved to ${o.place.name} (${fmt(o.place)}).`);
      } else {
        unresolved = String(r.args.name ?? "the place");
        assumptions.push(
          `"${unresolved}" is not a Broward County place; no coordinates were guessed for it.`,
        );
      }
    }
    for (const n of (Array.isArray(o.notes) ? o.notes : []) as string[]) missing.add(n);
    if (RADIUS_TOOLS.has(r.tool) && typeof r.args.lat === "number" && typeof r.args.lon === "number") {
      const center = { lat: r.args.lat as number, lon: r.args.lon as number };
      const radiusMiles = typeof r.args.radiusMiles === "number" ? (r.args.radiusMiles as number) : 5;
      let placeName: string | undefined;
      if (resolved && near(resolved, center)) placeName = resolved.name;
      else if (near(previous?.center, center)) {
        placeName = previous?.placeName;
        if (!resolved)
          assumptions.push(
            `Reused the previous search area: ${placeName ?? fmt(center)}, ${radiusMiles} miles.`,
          );
      } else if (mapContext && near(mapContext.center, center)) {
        placeName = "map center";
        assumptions.push(
          unresolved
            ? `Searched around the CRM map center (${fmt(center)}) instead of "${unresolved}".`
            : `Searched around the CRM map center (${fmt(center)}).`,
        );
      }
      context = { center, radiusMiles, ...(placeName ? { placeName } : {}) };
    }
  }
  const radiusTold = /\bmi(le)?s?\b|\bradius\b/i.test(message);
  const ageTold = /\d+\s*(\+\s*)?(years?|yrs?|y)\b/i.test(message);
  if (
    runs.some((r) => RADIUS_TOOLS.has(r.tool) && r.args.radiusMiles === 5) &&
    !radiusTold &&
    !assumptions.some((a) => a.startsWith("Reused"))
  )
    assumptions.push("Radius 5 miles (default; not stated in the question).");
  if (runs.some((r) => r.tool === "find_aged_roofs" && r.args.minRoofAgeYears === 15) && !ageTold)
    assumptions.push("Roof age threshold 15 years (default; not stated in the question).");
  if (!runs.length) missing.add("No tool was called, so this answer contains no property data.");

  return {
    steps,
    results: [...results.values()],
    citations,
    assumptions: [...new Set(assumptions)],
    missingData: [...missing],
    context,
  };
}
