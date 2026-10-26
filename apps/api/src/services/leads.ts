// B-07 Application layer (architecture-constitution.md §4/§9): orchestrates the injected
// `LeadRepo` and `LeadIndex` ports plus packages/domain's pure rules. `leadRepo` is a constructor
// argument, never imported or instantiated here. No business rule beyond orchestration lives in
// this file or in the router: the dedupe key comes from `leadKey()`, not-in-run (AC-5) from
// `isNotInCurrentRun()` plus an index presence check, and all duplicate/sequence enforcement is the repo's DynamoDB conditions.
import { randomBytes } from "node:crypto";
import { isNotInCurrentRun, leadKey, requestIdentifierOf } from "@crm/domain";
import type {
  LeadEvent,
  LeadFilters,
  LeadLastActivity,
  LeadSignals,
  LeadStatus,
} from "@crm/shared";
import { isLivePermit } from "@crm/shared";
import type { LeadIndex, SearchPropertiesQuery } from "../adapters/duckDbParquet.js";
import {
  noteExcerpt,
  type LeadPresenceRecord,
  type LeadRepo,
  type StoredLead,
  type UndoCreateResult,
} from "../adapters/leadRepo.js";
import { LeadAlreadyExistsError, LeadIndexUnavailableError } from "../leadErrors.js";

export interface CreateLeadInput {
  fips: string;
  requestIdentifier: string;
  address: string;
  lat: number;
  lon: number;
  signals: Omit<LeadSignals, "capturedAt">;
  sourceManifestCid: string;
  createdFrom: StoredLead["createdFrom"];
}

export interface ListLeadsInput {
  filters?: LeadFilters | undefined;
  assignee?: string | undefined;
  status?: LeadStatus | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/** A lead can be undone for this long after it was created (config constant, not a user input). */
export const UNDO_WINDOW_MS = 15 * 60 * 1000;
/** Items one `createMany` runs at once. The account's Lambda concurrency is 10 and this Lambda
 *  already shares it with the map, drawer and agent, so 3 is the ceiling. */
export const CREATE_MANY_CONCURRENCY = 3;
export const CREATE_MANY_MAX_ITEMS = 25;
export const PRESENCE_MAX_IDENTIFIERS = 100;
/** Travis County, the only county the CRM serves; `presence` builds lead keys with it unless the
 *  caller names another fips. */
export const DEFAULT_FIPS = "48453";

export interface CreateManyResult {
  created: { leadKey: string; leadId: string }[];
  already: string[];
  failed: { leadKey: string; code: string }[];
}

export type LeadView = StoredLead & { notInCurrentRun: boolean };
/** One `leads.list` item: the lead, the AC-5 flag, the stored SIGNALS snapshot (null when the
 *  lead has none) and its last activity (null when it cannot be known cheaply). */
export type ListedLead = Omit<LeadView, "lastActivity"> & {
  signals: LeadSignals | null;
  lastActivity: LeadLastActivity | null;
};
export type LeadDetailView = LeadView & {
  /** Manifest CID of the run now served: the provenance shown beside "not in the current run".
   *  Undefined when no run is promoted. */
  currentManifestCid: string | undefined;
  /** Run identifier of the run now served; resolved only when the lead is flagged. */
  currentRunId: string | undefined;
  signals: LeadSignals | undefined;
  notes: LeadEvent[];
  history: LeadEvent[];
};

export interface LeadService {
  create(input: CreateLeadInput, by: string): Promise<StoredLead>;
  updateStatus(
    key: string,
    status: LeadStatus,
    by: string,
    expectedSequence?: number,
  ): Promise<StoredLead>;
  addNote(key: string, text: string, by: string, expectedSequence?: number): Promise<StoredLead>;
  /** Gives the lead to `assignee` (the router passes the caller). */
  assign(key: string, assignee: string, by: string, expectedSequence?: number): Promise<StoredLead>;
  get(key: string): Promise<LeadDetailView | null>;
  /** Deletes a lead the caller just created, only while it is untouched and recent. */
  undoCreate(key: string, by: string, leadId?: string): Promise<UndoCreateResult>;
  /** Each item goes through `create`; a duplicate is `already`, any other error is `failed`. */
  createMany(inputs: readonly CreateLeadInput[], by: string): Promise<CreateManyResult>;
  presence(
    requestIdentifiers: readonly string[],
    fips?: string,
  ): Promise<(LeadPresenceRecord & { requestIdentifier: string })[]>;
  list(
    input: ListLeadsInput,
    by: string,
  ): Promise<{ leads: ListedLead[]; nextCursor?: string; totalCount: number }>;
}

export interface LeadServiceOptions {
  readonly leadIndex?: LeadIndex;
  readonly now?: () => Date;
  readonly newId?: () => string;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID (data-model.md `leadId`): 48-bit ms timestamp + 80 random bits, Crockford base32. */
export function newUlid(nowMs: number = Date.now()): string {
  let time = "";
  for (let t = nowMs, i = 0; i < 10; i++, t = Math.floor(t / 32))
    time = (CROCKFORD[t % 32] ?? "") + time;
  const rand = randomBytes(16);
  let suffix = "";
  for (let i = 0; i < 16; i++) suffix += CROCKFORD[(rand[i] ?? 0) % 32] ?? "";
  return time + suffix;
}

/** A stable, PII-free code for a failed item: the DynamoDB/SDK error name, else UNKNOWN. */
function failureCode(error: unknown): string {
  return error instanceof Error && error.name !== "" && error.name !== "Error"
    ? error.name
    : "UNKNOWN";
}

const DEFAULT_LIMIT = 50;
/** Most leads per page whose last activity is read from their event log (leads written before the
 *  denormalised attributes existed and that have had events). The rest show no last activity. */
export const LAST_ACTIVITY_FALLBACK_MAX = 25;

/** `note: "<json string>"` (leadRepo) -> the note text; anything else -> undefined. */
function noteTextOf(change: string): string | undefined {
  if (!change.startsWith("note: ")) return undefined;
  try {
    const parsed: unknown = JSON.parse(change.slice("note: ".length));
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function activityFromEvent(event: LeadEvent): LeadLastActivity {
  if (event.kind === "note") {
    const text = noteTextOf(event.change);
    const excerpt = text === undefined ? "" : noteExcerpt(text);
    return { at: event.at, kind: "note", ...(excerpt === "" ? {} : { excerpt }) };
  }
  if (event.kind === "assignee") return { at: event.at, kind: "assignee" };
  return { at: event.at, kind: event.kind === "create" ? "created" : "status" };
}
/** Fallback path only (an index without `matchingRequestIdentifiers`): the index search applies
 *  LIMIT 100 when no center+radius is given, so ask for effectively everything. */
const INDEX_SCAN_LIMIT = 1_000_000;

export function createLeadService(
  leadRepo: LeadRepo,
  options: LeadServiceOptions = {},
): LeadService {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => newUlid());
  const { leadIndex } = options;

  async function currentManifest(): Promise<string | undefined> {
    if (leadIndex === undefined) return undefined;
    try {
      return (await leadIndex.indexInfo()).manifestCid;
    } catch {
      return undefined; // no promoted run yet: staleness unknown, so never flagged
    }
  }
  const requestIdOf = (lead: StoredLead): string => requestIdentifierOf(lead.leadKey);

  /** AC-5: flagged only when the manifest differs AND the lead's property is absent from the
   *  current run. Only manifest-differing leads need the presence check, batched into one query;
   *  if it cannot run, nothing is flagged. Returns the flagged lead keys. */
  async function notInRunKeys(
    leads: readonly StoredLead[],
    current: string | undefined,
  ): Promise<Set<string>> {
    if (leadIndex === undefined || current === undefined) return new Set();
    const differing = leads.filter((l) => isNotInCurrentRun(l.sourceManifestCid, current));
    if (differing.length === 0) return new Set();
    try {
      const present = await leadIndex.presentRequestIdentifiers([
        ...new Set(differing.map(requestIdOf)),
      ]);
      return new Set(differing.filter((l) => !present.has(requestIdOf(l))).map((l) => l.leadKey));
    } catch {
      return new Set(); // presence unknown, so never flagged
    }
  }

  /** The caller's request identifiers whose property passes the roof-age/permit/radius filters.
   *  Resolved inside the index in SQL (same predicates as the map's search.properties, AC-4), so a
   *  county-wide radius never lists properties in JavaScript. */
  async function matchingRequestIdentifiers(
    filters: LeadFilters,
    candidateIds: readonly string[],
  ): Promise<Set<string>> {
    if (leadIndex === undefined) throw new LeadIndexUnavailableError();
    const hasCircle =
      filters.radiusMi !== undefined &&
      filters.centerLat !== undefined &&
      filters.centerLon !== undefined;
    if (leadIndex.matchingRequestIdentifiers !== undefined) {
      return leadIndex.matchingRequestIdentifiers({
        requestIdentifiers: candidateIds,
        ...(hasCircle
          ? {
              center: { lat: filters.centerLat as number, lng: filters.centerLon as number },
              radiusMi: filters.radiusMi as number,
            }
          : {}),
        ...(filters.roofAgeMinYears === undefined
          ? {}
          : { roofAgeMinYears: filters.roofAgeMinYears }),
        ...(filters.permitStatus === undefined ? {} : { permitStatus: filters.permitStatus }),
        ...(filters.permitOpenDaysMin === undefined
          ? {}
          : { permitOpenDaysMin: filters.permitOpenDaysMin }),
      });
    }
    // Index without the SQL method (test doubles only): the original two-call path.
    const query: SearchPropertiesQuery = { limit: INDEX_SCAN_LIMIT };
    if (hasCircle) {
      query.center = { lat: filters.centerLat as number, lng: filters.centerLon as number };
      query.radiusMi = filters.radiusMi as number;
    }
    if (filters.roofAgeMinYears !== undefined) query.roofAgeMinYears = filters.roofAgeMinYears;
    let properties = await leadIndex.searchProperties(query);
    if (filters.permitStatus !== undefined || filters.permitOpenDaysMin !== undefined) {
      const permits = await leadIndex.searchPermits({
        propertyCids: properties.map((p) => p.propertyCid),
        ...(filters.permitOpenDaysMin === undefined
          ? {}
          : { openDaysMinimum: filters.permitOpenDaysMin }),
      });
      const withMatch = new Set(
        permits
          .filter(
            (p) =>
              filters.permitStatus === undefined ||
              (filters.permitStatus === "open"
                ? isLivePermit(p)
                : p.statusClass === filters.permitStatus && isLivePermit(p)),
          )
          .map((p) => p.propertyCid),
      );
      properties = properties.filter((p) => withMatch.has(p.propertyCid));
    }
    return new Set(properties.map((p) => p.requestIdentifier));
  }

  const service: LeadService = {
    create(input, by) {
      const at = now().toISOString();
      return leadRepo.create({
        leadKey: leadKey(input.fips, input.requestIdentifier),
        leadId: newId(),
        address: input.address,
        lat: input.lat,
        lon: input.lon,
        assignee: by,
        createdFrom: input.createdFrom,
        sourceManifestCid: input.sourceManifestCid,
        createdAt: at,
        signals: input.signals,
      });
    },

    updateStatus(key, status, by, expectedSequence) {
      return leadRepo.updateStatus({
        leadKey: key,
        status,
        by,
        at: now().toISOString(),
        ...(expectedSequence === undefined ? {} : { expectedSequence }),
      });
    },

    addNote(key, text, by, expectedSequence) {
      return leadRepo.addNote({
        leadKey: key,
        text,
        by,
        at: now().toISOString(),
        ...(expectedSequence === undefined ? {} : { expectedSequence }),
      });
    },

    assign(key, assignee, by, expectedSequence) {
      return leadRepo.assign({
        leadKey: key,
        assignee,
        by,
        at: now().toISOString(),
        ...(expectedSequence === undefined ? {} : { expectedSequence }),
      });
    },

    undoCreate(key, by, leadId) {
      return leadRepo.undoCreate({
        leadKey: key,
        by,
        leadId,
        createdNotBefore: new Date(now().getTime() - UNDO_WINDOW_MS).toISOString(),
      });
    },

    async createMany(inputs, by) {
      const result: CreateManyResult = { created: [], already: [], failed: [] };
      const outcomes: Array<() => void> = new Array(inputs.length);
      let next = 0;
      async function worker(): Promise<void> {
        for (let i = next++; i < inputs.length; i = next++) {
          const input = inputs[i] as CreateLeadInput;
          let key = `${input.fips}:tcad:${input.requestIdentifier}`;
          try {
            const lead = await service.create(input, by);
            key = lead.leadKey;
            outcomes[i] = () => result.created.push({ leadKey: key, leadId: lead.leadId });
          } catch (error) {
            outcomes[i] =
              error instanceof LeadAlreadyExistsError
                ? () => result.already.push(key)
                : () => result.failed.push({ leadKey: key, code: failureCode(error) });
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(CREATE_MANY_CONCURRENCY, inputs.length) }, () => worker()),
      );
      for (const apply of outcomes) apply(); // input order, not completion order
      return result;
    },

    async presence(requestIdentifiers, fips = DEFAULT_FIPS) {
      const keys = [...new Set(requestIdentifiers)].map((id) => leadKey(fips, id));
      const found = await leadRepo.presence(keys);
      return found.map((p) => ({ ...p, requestIdentifier: requestIdentifierOf(p.leadKey) }));
    },

    async get(key) {
      const detail = await leadRepo.get(key);
      if (detail === null) return null;
      const current = await currentManifest();
      const notInCurrentRun = (await notInRunKeys([detail.lead], current)).size > 0;
      let currentRunId: string | undefined;
      if (notInCurrentRun && leadIndex !== undefined) {
        try {
          currentRunId = await leadIndex.currentRunId();
        } catch {
          currentRunId = undefined;
        }
      }
      return {
        ...detail.lead,
        notInCurrentRun,
        currentManifestCid: current,
        currentRunId,
        signals: detail.signals,
        notes: detail.events.filter((e) => e.kind === "note"),
        history: [...detail.events],
      };
    },

    /** Consistency: the assignee/status GSIs are eventually consistent, so a lead created a moment
     *  ago may be missing here for a short while. The web overlays a just-created lead on the
     *  first page itself; the server does not paper over it (a consistent read of a GSI does not
     *  exist). `cursor` is a plain numeric offset into the newest-first list and `totalCount` is
     *  the full filtered count (capped at MAX_LISTED_LEADS by the repo), so page n starts at
     *  (n - 1) * limit and "Showing 1-25 of N" needs no extra call. */
    async list(input, by) {
      const filters = input.filters ?? {};
      const geo =
        filters.roofAgeMinYears !== undefined ||
        filters.radiusMi !== undefined ||
        filters.permitStatus !== undefined ||
        filters.permitOpenDaysMin !== undefined;

      // The default scope is always the caller's own leads (GSI1); status filters in memory.
      let candidates = await leadRepo.listByAssignee(input.assignee ?? by);
      if (input.status !== undefined)
        candidates = candidates.filter((l) => l.status === input.status);

      if (geo) {
        const ids = await matchingRequestIdentifiers(filters, candidates.map(requestIdOf));
        candidates = candidates.filter((l) => ids.has(requestIdOf(l)));
      }

      const current = await currentManifest();
      const offset = input.cursor === undefined ? 0 : Number.parseInt(input.cursor, 10);
      const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
      const limit = input.limit ?? DEFAULT_LIMIT;
      const page = candidates.slice(start, start + limit);
      const end = start + page.length;
      const pageKeys = page.map((l) => l.leadKey);
      // Legacy leads (no denormalised attributes) that have had events: read the newest event,
      // for at most LAST_ACTIVITY_FALLBACK_MAX of the page. Untouched legacy leads need no read.
      const needEvent = page
        .filter((l) => l.lastActivity === undefined && l.eventSequence > 0)
        .slice(0, LAST_ACTIVITY_FALLBACK_MAX)
        .map((l) => l.leadKey);
      const [flagged, signals, events] = await Promise.all([
        notInRunKeys(page, current),
        page.length === 0 ? new Map<string, LeadSignals>() : leadRepo.signalsFor(pageKeys),
        needEvent.length === 0 ? new Map<string, LeadEvent>() : leadRepo.latestEvents(needEvent),
      ]);
      const lastActivityOf = (l: StoredLead): LeadLastActivity | null => {
        if (l.lastActivity !== undefined) return l.lastActivity;
        if (l.eventSequence === 0) return { at: l.createdAt, kind: "created" };
        const event = events.get(l.leadKey);
        return event === undefined ? null : activityFromEvent(event);
      };
      return {
        leads: page.map((l) => {
          const { lastActivity: _stored, ...rest } = l;
          return {
            ...rest,
            notInCurrentRun: flagged.has(l.leadKey),
            signals: signals.get(l.leadKey) ?? null,
            lastActivity: lastActivityOf(l),
          };
        }),
        ...(end < candidates.length ? { nextCursor: String(end) } : {}),
        totalCount: candidates.length,
      };
    },
  };
  return service;
}
