import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { leadSchema, type Lead, type LeadUpdate } from '@roofing-crm/shared';
import type { LeadStore } from '../ports.js';

function applyPatch(lead: Lead, patch: LeadUpdate, now: string): Lead {
  return {
    ...lead,
    status: patch.status ?? lead.status,
    priority: patch.priority ?? lead.priority,
    assignee: patch.assignee === undefined ? lead.assignee : patch.assignee,
    notes: patch.notes ?? lead.notes,
    updatedAt: now,
  };
}

/** Used by tests and local development. Same contract as the DynamoDB store. */
export class MemoryLeadStore implements LeadStore {
  private readonly byWorkspace = new Map<string, Map<string, Lead>>();

  private bucket(workspaceId: string): Map<string, Lead> {
    let bucket = this.byWorkspace.get(workspaceId);
    if (!bucket) {
      bucket = new Map();
      this.byWorkspace.set(workspaceId, bucket);
    }
    return bucket;
  }

  async list(workspaceId: string): Promise<Lead[]> {
    return [...this.bucket(workspaceId).values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async get(workspaceId: string, leadId: string): Promise<Lead | null> {
    return this.bucket(workspaceId).get(leadId) ?? null;
  }

  async put(workspaceId: string, lead: Lead): Promise<void> {
    this.bucket(workspaceId).set(lead.leadId, lead);
  }

  async update(workspaceId: string, patch: LeadUpdate, now: string): Promise<Lead | null> {
    const current = this.bucket(workspaceId).get(patch.leadId);
    if (!current) return null;
    const next = applyPatch(current, patch, now);
    this.bucket(workspaceId).set(next.leadId, next);
    return next;
  }

  async remove(workspaceId: string, leadId: string): Promise<void> {
    this.bucket(workspaceId).delete(leadId);
  }
}

/**
 * Leads in DynamoDB, on-demand billing (no standing cost). Partition key = workspace, sort key
 * = lead id, so each demo browser gets its own lead book and a reviewer cannot wreck another's.
 */
export class DynamoLeadStore implements LeadStore {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    client: DynamoDBClient = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async list(workspaceId: string): Promise<Lead[]> {
    const leads: Lead[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'workspaceId = :w',
          ExpressionAttributeValues: { ':w': workspaceId },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of page.Items ?? []) leads.push(leadSchema.parse(item));
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(workspaceId: string, leadId: string): Promise<Lead | null> {
    const out = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { workspaceId, leadId } }),
    );
    return out.Item ? leadSchema.parse(out.Item) : null;
  }

  async put(workspaceId: string, lead: Lead): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.tableName, Item: { workspaceId, ...lead } }),
    );
  }

  async update(workspaceId: string, patch: LeadUpdate, now: string): Promise<Lead | null> {
    const current = await this.get(workspaceId, patch.leadId);
    if (!current) return null;
    const next = applyPatch(current, patch, now);
    await this.put(workspaceId, next);
    return next;
  }

  async remove(workspaceId: string, leadId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({ TableName: this.tableName, Key: { workspaceId, leadId } }),
    );
  }
}
