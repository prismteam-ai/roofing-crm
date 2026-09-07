import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { geocodePlace, OSCEOLA } from "@/lib/config/county";
import type { McpDataSource } from "@/lib/mcp/types";
import {
  longOpenDays,
  searchParamsSchema,
  buildCandidateQuery,
  buildCandidateCountQuery,
} from "@/lib/queries/properties";
import { buildOpenRoofPermitsQuery, openPermitSearchSchema } from "@/lib/queries/permits";
import { assertReadOnlySelect } from "@/lib/queries/sql";
import { mapPermitRow, mapPropertyRow, toNum } from "@/lib/queries/types";

/**
 * Assistant tool set. Everything the agent knows about parcels comes from the injected
 * `McpDataSource`; explanations are grounded by `knowledge`; `createLead` writes to the CRM.
 * Dependencies are injected so the tools can be unit-tested with fakes.
 *
 * @module agent/tools
 */

/** Dependencies for {@link createAgentTools}. */
export interface AgentToolDeps {
  mcp: McpDataSource;
  knowledge: (
    query: string,
    limit?: number,
  ) => Promise<Array<{ id: string; title: string; section: string; body: string; source: string }>>;
  createLeads: (
    parcelIds: string[],
    thresholds?: { roofAgeYears: number; longOpenDays: number },
  ) => Promise<{
    created: Array<{ id: number; parcelId: string; address: string }>;
    existing: Array<{ id: number; parcelId: string; address: string }>;
    unknown: string[];
  }>;
}

/** Max rows returned to the model from a raw SQL tool (keeps context small). */
export const AGENT_ROW_CAP = 50;

const bboxSchema = z.object({
  minLat: z.number().min(-90).max(90),
  maxLat: z.number().min(-90).max(90),
  minLng: z.number().min(-180).max(180),
  maxLng: z.number().min(-180).max(180),
});

/** Build the tool set for a chat session. */
export function createAgentTools(deps: AgentToolDeps): ToolSet {
  return {
    geocodePlace: tool({
      description:
        "Resolve a place or city name inside Osceola County, FL (Kissimmee, St. Cloud, Celebration, Poinciana, Harmony) to latitude/longitude for radius queries. Returns null when the place is unknown; then ask the user for coordinates.",
      inputSchema: z.object({
        name: z.string().min(1).max(80).describe("Place or city name, e.g. 'Kissimmee'"),
      }),
      execute: async ({ name }) => {
        const place = geocodePlace(name);
        return place
          ? { found: true as const, name: place.name, lat: place.lat, lng: place.lng }
          : { found: false as const, known: OSCEOLA.places.map((p) => p.name) };
      },
    }),
    getSchema: tool({
      description:
        "Return the column list (name, type, description) of the MCP 'properties' or 'permits' view. Call this before writing SQL.",
      inputSchema: z.object({ table: z.enum(["properties", "permits"]) }),
      execute: async ({ table }) => {
        const schema =
          table === "properties"
            ? await deps.mcp.getPropertySchema()
            : await deps.mcp.getPermitSchema();
        return {
          view: schema.view,
          columns: schema.columns.map((c) => `${c.name} ${c.type} - ${c.description}`),
        };
      },
    }),
    queryProperties: tool({
      description:
        "Run ONE read-only SELECT over the 'properties' view via the Elephant MCP server. Include request_identifier, address_street, address_city and source_urls in row queries. Rows are capped; aggregate with count() when you need totals.",
      inputSchema: z.object({
        sql: z.string().min(6).max(4000).describe("A single SELECT or WITH ... SELECT statement"),
        limit: z.number().int().min(1).max(AGENT_ROW_CAP).default(25),
      }),
      execute: async ({ sql, limit }) => {
        const safe = assertReadOnlySelect(sql);
        const res = await deps.mcp.queryProperties(safe, limit);
        return {
          sql: safe,
          rowCount: res.rowCount,
          limit: res.limit,
          rows: res.rows.slice(0, limit),
        };
      },
    }),
    queryPermits: tool({
      description:
        "Run ONE read-only SELECT over the 'permits' view via the Elephant MCP server. Include permit_number, parcel_identifier, days_open, contractor_name, bbb_rating and source_url in row queries.",
      inputSchema: z.object({
        sql: z.string().min(6).max(4000).describe("A single SELECT or WITH ... SELECT statement"),
        limit: z.number().int().min(1).max(AGENT_ROW_CAP).default(25),
      }),
      execute: async ({ sql, limit }) => {
        const safe = assertReadOnlySelect(sql);
        const res = await deps.mcp.queryPermits(safe, limit);
        return {
          sql: safe,
          rowCount: res.rowCount,
          limit: res.limit,
          rows: res.rows.slice(0, limit),
        };
      },
    }),
    findPropertiesInArea: tool({
      description:
        "List parcel ids and coordinates inside a WGS84 bounding box (MCP findPropertiesInArea). Prefer searchRoofingLeads for lead questions.",
      inputSchema: z.object({ bbox: bboxSchema }),
      execute: async ({ bbox }) => {
        const res = await deps.mcp.findPropertiesInArea(bbox);
        return { count: res.count, sample: res.parcels.slice(0, AGENT_ROW_CAP) };
      },
    }),
    searchRoofingLeads: tool({
      description:
        "Structured radius search for roofing lead candidates (aged roofs and/or open roofing permits) around a point, using the CRM's tested query builder. Returns totals plus the top rows ordered by lead priority. Use after geocodePlace.",
      inputSchema: searchParamsSchema.extend({
        limit: z.number().int().min(1).max(AGENT_ROW_CAP).default(20),
      }),
      execute: async (input) => {
        const { sql, params } = buildCandidateQuery(input);
        const { sql: countSql } = buildCandidateCountQuery(input);
        const [rowsRes, countRes] = await Promise.all([
          deps.mcp.queryProperties(sql, params.limit),
          deps.mcp.queryProperties(countSql, 1),
        ]);
        const thresholds = { roofAgeYears: params.roofAgeMin, longOpenDays: longOpenDays(params) };
        const c = countRes.rows[0] ?? {};
        return {
          sql,
          filters: params,
          totals: {
            total: toNum(c.total) ?? 0,
            openPermits: toNum(c.open_permits) ?? 0,
            longOpenPermits: toNum(c.long_open_permits) ?? 0,
            agedRoofs: toNum(c.aged_roofs) ?? 0,
          },
          rows: rowsRes.rows.map((r) => {
            const p = mapPropertyRow(r, thresholds);
            return {
              parcelId: p.parcelId,
              address: p.address,
              roofAgeYears: p.roofAgeYears,
              roofAgeBasis: p.roofAgeBasis,
              openRoofPermitCount: p.openRoofPermitCount,
              oldestOpenRoofPermitDays: p.oldestOpenRoofPermitDays,
              ownerName: p.ownerName,
              ownerOutOfState: p.ownerOutOfState,
              hasBbbContractor: p.hasBbbContractor,
              marketValue: p.marketValue,
              distanceMiles:
                p.distanceMiles === null ? null : Math.round(p.distanceMiles * 100) / 100,
              signal: p.signal,
              sourceUrls: p.sourceUrls,
            };
          }),
        };
      },
    }),
    searchOpenRoofPermits: tool({
      description:
        "Open roofing permits within a radius that have been open at least N years, oldest first, with contractor and BBB fields and source_url. Use for 'open roofing permits older than X years within Y miles of Z'.",
      inputSchema: openPermitSearchSchema.extend({
        limit: z.number().int().min(1).max(AGENT_ROW_CAP).default(20),
      }),
      execute: async (input) => {
        const { sql, params } = buildOpenRoofPermitsQuery(input);
        const res = await deps.mcp.queryPermits(sql, params.limit);
        return {
          sql,
          filters: params,
          rowCount: res.rowCount,
          rows: res.rows.map((r) => {
            const p = mapPermitRow(r);
            return {
              permitNumber: p.permitNumber,
              parcelId: p.parcelNumber,
              address: [r.address_street, r.address_city].filter(Boolean).join(", "),
              status: p.status,
              daysOpen: p.daysOpen,
              yearsOpen: p.daysOpen === null ? null : Math.round((p.daysOpen / 365) * 10) / 10,
              issueDate: p.issueDate,
              contractorName: p.contractorName ?? "not recorded",
              contractorQualifier: p.contractorQualifier,
              contractorPhone: p.contractorPhone,
              contractorLicense: p.contractorLicense,
              bbbRating: p.bbbRating ?? "not available",
              bbbAccredited: p.bbbAccredited,
              bbbProfileUrl: p.bbbProfileUrl,
              issuingAgency: p.issuingAgency,
              distanceMiles: toNum(r.distance_miles),
              sourceUrl: p.sourceUrl,
            };
          }),
        };
      },
    }),
    searchKnowledge: tool({
      description:
        "Lexical search over the dataset documentation (column meanings, how roof age is derived, BBB matching method, coverage caveats, NULL columns). Use to ground explanations and caveats; never for parcel facts.",
      inputSchema: z.object({
        query: z.string().min(2).max(200),
        limit: z.number().int().min(1).max(6).default(3),
      }),
      execute: async ({ query, limit }) => {
        const hits = await deps.knowledge(query, limit);
        return {
          hits: hits.map((h) => ({
            id: h.id,
            title: `${h.title} - ${h.section}`,
            source: h.source,
            body: h.body,
          })),
        };
      },
    }),
    createLead: tool({
      description:
        "Create CRM lead records for one or more parcel ids (request_identifier) returned by a previous search. Only call when the user explicitly asks to create/save leads. Returns created and pre-existing leads.",
      inputSchema: z.object({
        parcelIds: z.array(z.string().min(1).max(64)).min(1).max(25),
        roofAgeMin: z
          .number()
          .int()
          .min(0)
          .max(150)
          .optional()
          .describe("Roof-age threshold used in the search"),
        longOpenYears: z
          .number()
          .min(0)
          .max(50)
          .optional()
          .describe("Long-open threshold (years) used in the search"),
      }),
      execute: async ({ parcelIds, roofAgeMin, longOpenYears }) =>
        deps.createLeads(
          parcelIds,
          roofAgeMin !== undefined || longOpenYears !== undefined
            ? {
                roofAgeYears: roofAgeMin ?? OSCEOLA.thresholds.roofAgeYears,
                longOpenDays: Math.round(
                  (longOpenYears ?? OSCEOLA.thresholds.longOpenPermitYears) * 365,
                ),
              }
            : undefined,
        ),
    }),
  };
}
