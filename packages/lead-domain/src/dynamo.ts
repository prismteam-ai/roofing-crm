import {
  storedLead,
  type AuditedLead as Lead,
  type LeadMutationContext,
} from "./audit";
import { boundedLead } from "./limits";
import { createHash } from "node:crypto";
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import {
  DomainError,
  LeadCreateSchema,
  LeadUpdateSchema,
} from "../../contracts/src/index";
/** This narrow transport is also implemented by the deterministic transactional test double. */
export interface DocumentTransport {
  send(
    command: GetCommand | QueryCommand | TransactWriteCommand | PutCommand,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
}
export type DispatchGuard = () => void;
export interface LeadRepository {
  list(
    sessionId: string,
    signal?: AbortSignal,
    guard?: DispatchGuard,
  ): Lead[] | Promise<Lead[]>;
  create(
    input: unknown,
    signal?: AbortSignal,
    guard?: DispatchGuard,
    context?: LeadMutationContext,
  ): Lead | Promise<Lead>;
  update(
    id: string,
    input: unknown,
    signal?: AbortSignal,
    guard?: DispatchGuard,
    context?: LeadMutationContext,
  ): Lead | Promise<Lead>;
}
export function documentTransport(
  client: DynamoDBDocumentClient,
): DocumentTransport {
  return {
    send: async (command, signal) =>
      (await client.send(command as GetCommand, {
        abortSignal: signal,
      })) as Record<string, unknown>,
  };
}
const hash = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 32);
const conditional = (e: unknown) =>
  e instanceof Error &&
  ["ConditionalCheckFailedException", "TransactionCanceledException"].includes(
    e.name,
  );
export class DynamoLeadStore implements LeadRepository {
  constructor(
    private readonly db: DocumentTransport,
    private readonly table: string,
    private readonly clock = () => new Date().toISOString(),
    private readonly ttlDays = 14,
  ) {}
  private send(
    command: Parameters<DocumentTransport["send"]>[0],
    signal?: AbortSignal,
    guard?: DispatchGuard,
  ) {
    guard?.();
    if (signal?.aborted)
      throw new DomainError(
        "QUERY_TIMEOUT",
        "Lead operation deadline exceeded before dispatch",
      );
    return this.db.send(command, signal);
  }
  private key(session: string, sk: string) {
    return { pk: `WORKSPACE#${session}`, sk };
  }
  private async get(
    session: string,
    sk: string,
    signal?: AbortSignal,
    guard?: DispatchGuard,
  ) {
    const result = await this.send(
      new GetCommand({
        TableName: this.table,
        Key: this.key(session, sk),
        ConsistentRead: true,
      }),
      signal,
      guard,
    );
    const item = result.Item as Record<string, unknown> | undefined;
    if (
      item &&
      (!Number.isInteger(item.expiresAt) ||
        Number(item.expiresAt) <= Date.parse(this.clock()) / 1000)
    )
      return undefined;
    return item;
  }
  async list(
    sessionId: string,
    signal?: AbortSignal,
    guard?: DispatchGuard,
  ): Promise<Lead[]> {
    if (!sessionId || sessionId.length > 100)
      throw new DomainError("INVALID_INPUT", "Session required");
    const rows: Lead[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const result = await this.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :lead)",
          ExpressionAttributeValues: {
            ":pk": `WORKSPACE#${sessionId}`,
            ":lead": "LEAD#",
          },
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
        }),
        signal,
        guard,
      );
      for (const item of (result.Items ?? []) as Record<string, unknown>[])
        if (Number(item.expiresAt) > Date.parse(this.clock()) / 1000)
          rows.push(storedLead(item.lead));
      cursor = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (cursor);
    return rows.sort((a, b) => b.events[0].at.localeCompare(a.events[0].at));
  }
  async create(
    input: unknown,
    signal?: AbortSignal,
    guard?: DispatchGuard,
    context?: LeadMutationContext,
  ): Promise<Lead> {
    const x = LeadCreateSchema.parse(input);
    const id = `lead-${hash([x.sessionId, x.propertyId, x.snapshotId]).slice(0, 20)}`;
    const leadKey = `LEAD#${id}`,
      requestKey = `REQUEST#${hash(x.idempotencyKey)}`;
    const resolve = async (): Promise<
      { lead: Lead; expiresAt: number } | undefined
    > => {
      const key = await this.get(x.sessionId, requestKey, signal, guard);
      if (
        key &&
        (key.propertyId !== x.propertyId || key.snapshotId !== x.snapshotId)
      )
        throw new DomainError(
          "CONFLICT",
          "Idempotency key already belongs to another selection",
        );
      const old = await this.get(x.sessionId, leadKey, signal, guard);
      return old
        ? { lead: storedLead(old.lead), expiresAt: Number(old.expiresAt) }
        : undefined;
    };
    const bindAlias = async (old: {
      lead: Lead;
      expiresAt: number;
    }): Promise<Lead> => {
      try {
        await this.send(
          new PutCommand({
            TableName: this.table,
            Item: {
              ...this.key(x.sessionId, requestKey),
              propertyId: x.propertyId,
              snapshotId: x.snapshotId,
              expiresAt: old.expiresAt,
            },
            ConditionExpression:
              "attribute_not_exists(pk) OR expiresAt <= :now OR (propertyId = :property AND snapshotId = :snapshot)",
            ExpressionAttributeValues: {
              ":now": Math.floor(Date.parse(this.clock()) / 1000),
              ":property": x.propertyId,
              ":snapshot": x.snapshotId,
            },
          }),
          signal,
          guard,
        );
      } catch (error) {
        if (conditional(error))
          throw new DomainError(
            "CONFLICT",
            "Idempotency key already belongs to another selection",
          );
        throw error;
      }
      return old.lead;
    };
    const old = await resolve();
    if (old) return bindAlias(old);
    const at = this.clock();
    const expiresAt = Math.floor(Date.parse(at) / 1000) + this.ttlDays * 86400;
    const lead: Lead = {
      id,
      sessionId: x.sessionId,
      propertyId: x.propertyId,
      snapshotId: x.snapshotId,
      status: "new",
      version: 1,
      events: [
        {
          kind: "created",
          at,
          ...(context?.actorSessionId
            ? { actorSessionId: context.actorSessionId }
            : {}),
        },
      ],
    };
    try {
      await this.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: {
                  ...this.key(x.sessionId, leadKey),
                  lead,
                  version: 1,
                  expiresAt,
                },
                ConditionExpression:
                  "attribute_not_exists(pk) OR expiresAt <= :now",
                ExpressionAttributeValues: {
                  ":now": Math.floor(Date.parse(at) / 1000),
                },
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: {
                  ...this.key(x.sessionId, requestKey),
                  propertyId: x.propertyId,
                  snapshotId: x.snapshotId,
                  expiresAt,
                },
                ConditionExpression:
                  "attribute_not_exists(pk) OR expiresAt <= :now",
                ExpressionAttributeValues: {
                  ":now": Math.floor(Date.parse(at) / 1000),
                },
              },
            },
          ],
        }),
        signal,
        guard,
      );
      return lead;
    } catch (e) {
      if (!conditional(e)) throw e;
      const raced = await resolve();
      if (raced) return bindAlias(raced);
      throw new DomainError(
        "CONFLICT",
        "Concurrent lead creation conflicted; retry the same request",
      );
    }
  }
  async update(
    id: string,
    input: unknown,
    signal?: AbortSignal,
    guard?: DispatchGuard,
    context?: LeadMutationContext,
  ): Promise<Lead> {
    const x = LeadUpdateSchema.parse({
      ...(input as Record<string, unknown>),
      id,
    });
    const item = await this.get(x.sessionId, `LEAD#${id}`, signal, guard);
    if (!item)
      throw new DomainError(
        "NOT_AUTHORIZED",
        "Lead is not available in this workspace",
      );
    const old = storedLead(item.lead);
    if (old.version !== x.expectedVersion)
      throw new DomainError("CONFLICT", "Lead changed. Reload before saving.");
    if (x.status === undefined && !x.note?.trim())
      throw new DomainError("INVALID_INPUT", "No lead change supplied");
    const lead: Lead = {
      ...old,
      status: x.status ?? old.status,
      version: old.version + 1,
      events: [
        ...old.events,
        {
          kind: x.status ? `status:${x.status}` : "note",
          at: this.clock(),
          ...(context?.actorSessionId
            ? { actorSessionId: context.actorSessionId }
            : {}),
          ...(x.note?.trim() ? { note: x.note.trim() } : {}),
        },
      ],
    };
    boundedLead(lead);
    try {
      await this.send(
        new PutCommand({
          TableName: this.table,
          Item: { ...item, lead, version: lead.version },
          ConditionExpression: "#v = :expected",
          ExpressionAttributeNames: { "#v": "version" },
          ExpressionAttributeValues: { ":expected": x.expectedVersion },
        }),
        signal,
        guard,
      );
    } catch (e) {
      if (conditional(e))
        throw new DomainError("CONFLICT", "Lead changed while saving");
      throw e;
    }
    return lead;
  }
}
