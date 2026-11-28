import { randomUUID } from "node:crypto";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { LatLon, LeadSignals } from "@crm/shared";
import {
  allowedTransitions,
  type Lead,
  type LeadEvent,
  type LeadFilter,
  type LeadInput,
  LeadInput as LeadInputSchema,
  type LeadNote,
  type LeadStatus,
  type LeadWithHistory,
  priorityOf,
  TERMINAL,
} from "./schema.ts";

const DAY_S = 86_400;
const WORKSPACE_TTL_DAYS = 7;

export class LeadCapExceeded extends Error {
  readonly name = "LeadCapExceeded";
  readonly code = "TOO_MANY_REQUESTS";
}
export class IllegalTransition extends Error {
  readonly name = "IllegalTransition";
}
export class LeadNotFound extends Error {
  readonly name = "LeadNotFound";
}
export class ActiveLeadExists extends Error {
  readonly name = "ActiveLeadExists";
}

export interface SnapshotSource {
  cid: string;
  hasProperty(id: string): Promise<boolean>;
  signalsFor(id: string): Promise<LeadSignals | null>;
}

export interface LeadsRepo {
  readonly workspace: string;
  createFromCandidate(i: LeadInput): Promise<{ lead: Lead; created: boolean }>;
  createMany(items: LeadInput[]): Promise<{ created: number; existing: number; leads: Lead[] }>;
  list(f?: LeadFilter): Promise<Lead[]>;
  get(id: string): Promise<LeadWithHistory | null>;
  updateStatus(id: string, to: LeadStatus): Promise<Lead>;
  addNote(id: string, body: string): Promise<LeadNote>;
  reconcileWithSnapshot(s: SnapshotSource): Promise<{ checked: number; markedStale: number }>;
}

export interface LeadsStore {
  (workspace: string): LeadsRepo;
  /** Creates the workspace and its seed leads once (idempotent); refreshes its expiry. */
  ensureWorkspace(workspace: string, seed: LeadInput[]): Promise<{ created: boolean }>;
}

function haversineMiles(a: LatLon, b: LatLon): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

const ws = (w: string) => `WS#${w}`;
const leadSk = (id: string) => `LEAD#${id}`;
const activeSk = (propertyId: string) => `ACTIVE#${propertyId}`;
const statusPk = (w: string, s: LeadStatus) => `WS#${w}#STATUS#${s}`;

function toLead(item: Record<string, any>): Lead {
  return {
    id: item.id,
    propertyId: item.propertyId,
    permitId: item.permitId ?? null,
    status: item.status,
    priority: item.priority,
    assignee: item.assignee ?? null,
    sourceManifestCid: item.sourceManifestCid,
    signals: item.signals,
    stale: Boolean(item.stale),
    staleReason: item.staleReason ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** Differences between the signals a lead was created with and the ones the new run reports. */
function signalChanges(before: LeadSignals, after: LeadSignals): string[] {
  const out: string[] = [];
  if (before.roofAgeYears !== after.roofAgeYears)
    out.push(`roof age ${before.roofAgeYears ?? "unknown"} → ${after.roofAgeYears ?? "unknown"}`);
  if (before.roofAgeBasis !== after.roofAgeBasis)
    out.push(`roof age basis ${before.roofAgeBasis} → ${after.roofAgeBasis}`);
  const openYears = (d: number | null) => (d === null ? null : Math.floor(d / 365.25));
  if (openYears(before.maxOpenDays) !== openYears(after.maxOpenDays)) {
    out.push(
      `longest open permit ${openYears(before.maxOpenDays) ?? "none"} → ${openYears(after.maxOpenDays) ?? "none"} years`,
    );
  }
  if (before.bbbGrade !== after.bbbGrade)
    out.push(`BBB grade ${before.bbbGrade ?? "none"} → ${after.bbbGrade ?? "none"}`);
  if (before.ownerLocationClass !== after.ownerLocationClass) {
    out.push(`owner location ${before.ownerLocationClass} → ${after.ownerLocationClass}`);
  }
  return out;
}

export function createLeadsRepo(opts: {
  doc: DynamoDBDocumentClient;
  tableName: string;
  leadCreatesPerDay?: number;
  now?: () => Date;
}): LeadsStore {
  const { doc } = opts;
  const TableName = opts.tableName;
  const cap = opts.leadCreatesPerDay ?? 200;
  const now = opts.now ?? (() => new Date());
  const iso = () => now().toISOString();
  const ttl = () => Math.floor(now().getTime() / 1000) + WORKSPACE_TTL_DAYS * DAY_S;

  function repo(workspace: string): LeadsRepo & { createUncapped(i: LeadInput): Promise<unknown> } {
    const pk = ws(workspace);

    async function getLeadItem(id: string) {
      const r = await doc.send(new GetCommand({ TableName, Key: { pk, sk: leadSk(id) } }));
      return r.Item ?? null;
    }

    async function activeLeadFor(propertyId: string): Promise<Lead | null> {
      const g = await doc.send(new GetCommand({ TableName, Key: { pk, sk: activeSk(propertyId) } }));
      if (!g.Item) return null;
      const item = await getLeadItem(g.Item.leadId);
      return item ? toLead(item) : null;
    }

    async function create(
      i: LeadInput,
      opts2: { capped: boolean },
    ): Promise<{ lead: Lead; created: boolean }> {
      const input = LeadInputSchema.parse(i);
      const existing = await activeLeadFor(input.propertyId);
      if (existing) return { lead: existing, created: false };
      const at = iso();
      const id = randomUUID();
      const lead: Lead = {
        id,
        propertyId: input.propertyId,
        permitId: input.permitId ?? null,
        status: "new",
        priority: priorityOf(input.signals),
        assignee: null,
        sourceManifestCid: input.manifestCid,
        signals: input.signals,
        stale: false,
        staleReason: null,
        createdAt: at,
        updatedAt: at,
      };
      const expiresAt = ttl();
      const day = at.slice(0, 10);
      try {
        await doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                // The uniqueness guard: one active lead per property in this workspace (Review Focus 3, 7).
                Put: {
                  TableName,
                  Item: { pk, sk: activeSk(input.propertyId), leadId: id, expiresAt },
                  ConditionExpression: "attribute_not_exists(pk)",
                },
              },
              {
                Put: {
                  TableName,
                  Item: {
                    pk,
                    sk: leadSk(id),
                    type: "lead",
                    ...lead,
                    gsi1pk: statusPk(workspace, "new"),
                    gsi1sk: `${at}#${id}`,
                    expiresAt,
                  },
                },
              },
              {
                Put: {
                  TableName,
                  Item: {
                    pk,
                    sk: `${leadSk(id)}#EVENT#${at}#created`,
                    type: "event",
                    event: { at, type: "created" },
                    expiresAt,
                  },
                },
              },
              ...(opts2.capped
                ? [
                    {
                      Update: {
                        TableName,
                        Key: { pk, sk: `CAP#${day}` },
                        UpdateExpression: "ADD n :one SET expiresAt = :exp",
                        ConditionExpression: "attribute_not_exists(n) OR n < :cap",
                        ExpressionAttributeValues: { ":one": 1, ":cap": cap, ":exp": expiresAt },
                      },
                    },
                  ]
                : []),
            ],
          }),
        );
      } catch (err) {
        if (!(err instanceof TransactionCanceledException)) throw err;
        const reasons = err.CancellationReasons ?? [];
        if (reasons[0]?.Code === "ConditionalCheckFailed") {
          // Another request created the active lead first: return that one.
          const winner = await activeLeadFor(input.propertyId);
          if (winner) return { lead: winner, created: false };
        }
        if (opts2.capped && reasons[3]?.Code === "ConditionalCheckFailed") {
          throw new LeadCapExceeded(`this workspace created ${cap} leads today; try again tomorrow`);
        }
        throw err;
      }
      return { lead, created: true };
    }

    return {
      workspace,

      createFromCandidate: (i) => create(i, { capped: true }),
      createUncapped: (i) => create(i, { capped: false }),

      async createMany(items) {
        let created = 0;
        let existing = 0;
        const leads: Lead[] = [];
        for (const i of items) {
          const r = await create(i, { capped: true });
          if (r.created) created++;
          else existing++;
          leads.push(r.lead);
        }
        return { created, existing, leads };
      },

      async list(f = {}) {
        const items: Record<string, any>[] = [];
        if (f.status?.length) {
          for (const s of f.status) {
            let key: Record<string, any> | undefined;
            do {
              const r = await doc.send(
                new QueryCommand({
                  TableName,
                  IndexName: "GSI1",
                  KeyConditionExpression: "gsi1pk = :p",
                  ExpressionAttributeValues: { ":p": statusPk(workspace, s) },
                  ExclusiveStartKey: key,
                }),
              );
              items.push(...(r.Items ?? []));
              key = r.LastEvaluatedKey;
            } while (key);
          }
        } else {
          let key: Record<string, any> | undefined;
          do {
            const r = await doc.send(
              new QueryCommand({
                TableName,
                KeyConditionExpression: "pk = :p AND begins_with(sk, :l)",
                FilterExpression: "#t = :lead",
                ExpressionAttributeNames: { "#t": "type" },
                ExpressionAttributeValues: { ":p": pk, ":l": "LEAD#", ":lead": "lead" },
                ExclusiveStartKey: key,
              }),
            );
            items.push(...(r.Items ?? []));
            key = r.LastEvaluatedKey;
          } while (key);
        }
        let leads = items.map(toLead);
        if (f.stale !== undefined) leads = leads.filter((l) => l.stale === f.stale);
        if (f.search) {
          const q = f.search.toLowerCase();
          leads = leads.filter((l) =>
            [l.propertyId, l.permitId, l.signals.address, l.signals.city].some((v) =>
              v?.toLowerCase().includes(q),
            ),
          );
        }
        if (f.minRoofAgeYears !== undefined) {
          leads = leads.filter((l) => (l.signals.roofAgeYears ?? -1) >= f.minRoofAgeYears!);
        }
        if (f.minOpenYears !== undefined) {
          leads = leads.filter((l) => (l.signals.maxOpenDays ?? -1) / 365.25 >= f.minOpenYears!);
        }
        if (f.permitStatus?.length) {
          leads = leads.filter((l) => l.signals.permitStatuses.some((s) => f.permitStatus!.includes(s)));
        }
        if (f.near) {
          leads = leads.filter((l) => haversineMiles(f.near!.center, l.signals) <= f.near!.radiusMiles);
        }
        return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
      },

      async get(id) {
        const r = await doc.send(
          new QueryCommand({
            TableName,
            KeyConditionExpression: "pk = :p AND begins_with(sk, :l)",
            ExpressionAttributeValues: { ":p": pk, ":l": leadSk(id) },
          }),
        );
        const items = r.Items ?? [];
        const lead = items.find((x) => x.sk === leadSk(id));
        if (!lead) return null;
        return {
          ...toLead(lead),
          notes: items.filter((x) => x.type === "note").map((x) => x.note as LeadNote),
          events: items.filter((x) => x.type === "event").map((x) => x.event as LeadEvent),
        };
      },

      async updateStatus(id, to) {
        const item = await getLeadItem(id);
        if (!item) throw new LeadNotFound(`no lead ${id}`);
        const from = item.status as LeadStatus;
        if (!allowedTransitions(from).includes(to)) {
          throw new IllegalTransition(
            `a ${from} lead cannot move to ${to} (allowed: ${allowedTransitions(from).join(", ") || "none"})`,
          );
        }
        const at = iso();
        const expiresAt = ttl();
        const guard = TERMINAL.includes(to)
          ? [
              {
                Delete: {
                  TableName,
                  Key: { pk, sk: activeSk(item.propertyId) },
                  ConditionExpression: "leadId = :id",
                  ExpressionAttributeValues: { ":id": id },
                },
              },
            ]
          : from === "lost" && to === "new"
            ? [
                {
                  Put: {
                    TableName,
                    Item: { pk, sk: activeSk(item.propertyId), leadId: id, expiresAt },
                    ConditionExpression: "attribute_not_exists(pk)",
                  },
                },
              ]
            : [];
        try {
          await doc.send(
            new TransactWriteCommand({
              TransactItems: [
                {
                  Update: {
                    TableName,
                    Key: { pk, sk: leadSk(id) },
                    UpdateExpression: "SET #s = :to, gsi1pk = :g, updatedAt = :at, expiresAt = :exp",
                    ConditionExpression: "#s = :from",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: {
                      ":to": to,
                      ":from": from,
                      ":g": statusPk(workspace, to),
                      ":at": at,
                      ":exp": expiresAt,
                    },
                  },
                },
                ...guard,
                {
                  Put: {
                    TableName,
                    Item: {
                      pk,
                      sk: `${leadSk(id)}#EVENT#${at}#status`,
                      type: "event",
                      event: { at, type: "status", from, to },
                      expiresAt,
                    },
                  },
                },
              ],
            }),
          );
        } catch (err) {
          if (err instanceof TransactionCanceledException && from === "lost" && to === "new") {
            throw new ActiveLeadExists(
              `property ${item.propertyId} already has an active lead in this workspace`,
            );
          }
          throw err;
        }
        return toLead({ ...item, status: to, updatedAt: at });
      },

      async addNote(id, body) {
        const text = body.trim();
        if (!text) throw new Error("a note needs text");
        if (!(await getLeadItem(id))) throw new LeadNotFound(`no lead ${id}`);
        const at = iso();
        const note = { at, body: text.slice(0, 4000) };
        const expiresAt = ttl();
        await doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName,
                  Item: { pk, sk: `${leadSk(id)}#NOTE#${at}#${randomUUID()}`, type: "note", note, expiresAt },
                },
              },
              {
                Update: {
                  TableName,
                  Key: { pk, sk: leadSk(id) },
                  UpdateExpression: "SET updatedAt = :at, expiresAt = :exp",
                  ExpressionAttributeValues: { ":at": at, ":exp": expiresAt },
                },
              },
            ],
          }),
        );
        return note;
      },

      async reconcileWithSnapshot(s) {
        const leads = await this.list();
        let markedStale = 0;
        for (const l of leads) {
          let reason: string | null = null;
          if (!(await s.hasProperty(l.propertyId))) {
            reason = `property ${l.propertyId} is not in run ${s.cid}`;
          } else {
            const after = await s.signalsFor(l.propertyId);
            const changes = after ? signalChanges(l.signals, after) : [];
            if (changes.length) reason = `changed in run ${s.cid}: ${changes.join("; ")}`;
          }
          if (!reason || (l.stale && l.staleReason === reason)) continue;
          const at = iso();
          // Flag, never delete (Review Focus 4).
          await doc.send(
            new TransactWriteCommand({
              TransactItems: [
                {
                  Update: {
                    TableName,
                    Key: { pk, sk: leadSk(l.id) },
                    UpdateExpression: "SET stale = :t, staleReason = :r, updatedAt = :at",
                    ExpressionAttributeValues: { ":t": true, ":r": reason, ":at": at },
                  },
                },
                {
                  Put: {
                    TableName,
                    Item: {
                      pk,
                      sk: `${leadSk(l.id)}#EVENT#${at}#stale`,
                      type: "event",
                      event: { at, type: "stale", detail: reason },
                      expiresAt: ttl(),
                    },
                  },
                },
              ],
            }),
          );
          markedStale++;
        }
        return { checked: leads.length, markedStale };
      },
    };
  }

  const store = ((w: string) => repo(w)) as unknown as LeadsStore;
  store.ensureWorkspace = async (workspace, seed) => {
    const pk = ws(workspace);
    try {
      await doc.send(
        new PutCommand({
          TableName,
          Item: { pk, sk: "META", type: "meta", createdAt: iso(), seeded: seed.length, expiresAt: ttl() },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
    } catch (err) {
      if ((err as Error).name !== "ConditionalCheckFailedException") throw err;
      await doc.send(
        new UpdateCommand({
          TableName,
          Key: { pk, sk: "META" },
          UpdateExpression: "SET expiresAt = :exp",
          ExpressionAttributeValues: { ":exp": ttl() },
        }),
      );
      return { created: false };
    }
    const r = repo(workspace);
    for (const s of seed) await r.createUncapped(s);
    return { created: true };
  };
  return store;
}
