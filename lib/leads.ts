import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

/**
 * Lead records: the one thing the CRM owns.
 *
 * A lead is a property (and optionally one permit) that a salesperson decided
 * to pursue, with a status, a priority and notes. It keeps the facts that
 * justified it and the snapshot they came from, so a lead can always be traced
 * back to the published record.
 *
 * Storage is one DynamoDB table: partition key `workspace`, sort key `leadId`.
 * A workspace is an unguessable ID created in the visitor's browser, so people
 * trying the public demo do not see each other's leads. It is not a login.
 */

export const STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;
export const PRIORITIES = ["high", "normal", "low"] as const;
export const REASONS = ["aging_roof", "open_permit"] as const;

export const workspaceSchema = z.string().regex(/^[a-z0-9-]{16,64}$/, "Invalid workspace");

export const newLeadSchema = z.object({
  folio: z.string().regex(/^[0-9]{13}$/),
  address: z.string().max(200).nullable(),
  city: z.string().max(80).nullable(),
  zip: z.string().max(10).nullable(),
  owner: z.string().max(200).nullable(),
  reason: z.enum(REASONS),
  roofYear: z.number().int().nullable(),
  roofBasis: z.string().max(20).nullable(),
  permitNumber: z.string().max(40).nullable(),
  permitIssued: z.string().max(10).nullable(),
  permitStatus: z.string().max(40).nullable(),
  contractor: z.string().max(200).nullable(),
  contractorLicence: z.string().max(40).nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  snapshotId: z.string().max(40),
  sourceUrl: z.string().url().max(600).nullable(),
});
export type NewLead = z.infer<typeof newLeadSchema>;

export const leadPatchSchema = z
  .object({
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    notes: z.string().max(2000),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Nothing to change");

export interface Lead extends NewLead {
  workspace: string;
  leadId: string;
  status: (typeof STATUSES)[number];
  priority: (typeof PRIORITIES)[number];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** One lead per property and reason (and permit): adding the same one twice updates nothing. */
export function leadIdFor(lead: Pick<NewLead, "folio" | "reason" | "permitNumber">): string {
  return lead.reason === "open_permit" ? `${lead.folio}-permit-${lead.permitNumber}` : `${lead.folio}-roof`;
}

const TABLE = process.env.LEADS_TABLE;
const db = TABLE ? DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } }) : null;

/** Local development only: without LEADS_TABLE, leads live in memory and vanish on restart. */
const memory = new Map<string, Lead>();
const memoryKey = (workspace: string, leadId: string) => `${workspace}|${leadId}`;

export async function listLeads(workspace: string): Promise<Lead[]> {
  if (!db) return [...memory.values()].filter((lead) => lead.workspace === workspace).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const leads: Lead[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({ TableName: TABLE, KeyConditionExpression: "workspace = :w", ExpressionAttributeValues: { ":w": workspace }, ExclusiveStartKey: start }),
    );
    leads.push(...((page.Items ?? []) as Lead[]));
    start = page.LastEvaluatedKey;
  } while (start);
  return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createLead(workspace: string, input: NewLead): Promise<{ lead: Lead; created: boolean }> {
  const now = new Date().toISOString();
  const lead: Lead = { ...input, workspace, leadId: leadIdFor(input), status: "new", priority: "normal", notes: "", createdAt: now, updatedAt: now };
  if (!db) {
    const key = memoryKey(workspace, lead.leadId);
    const existing = memory.get(key);
    if (existing) return { lead: existing, created: false };
    memory.set(key, lead);
    return { lead, created: true };
  }
  try {
    // The condition makes "add" safe to repeat: an existing lead keeps its status and notes.
    await db.send(new PutCommand({ TableName: TABLE, Item: lead, ConditionExpression: "attribute_not_exists(leadId)" }));
    return { lead, created: true };
  } catch (error) {
    if ((error as { name?: string }).name !== "ConditionalCheckFailedException") throw error;
    const existing = (await listLeads(workspace)).find((item) => item.leadId === lead.leadId);
    return { lead: existing ?? lead, created: false };
  }
}

export async function updateLead(workspace: string, leadId: string, patch: z.infer<typeof leadPatchSchema>): Promise<Lead | null> {
  const updatedAt = new Date().toISOString();
  if (!db) {
    const existing = memory.get(memoryKey(workspace, leadId));
    if (!existing) return null;
    const next = { ...existing, ...patch, updatedAt };
    memory.set(memoryKey(workspace, leadId), next);
    return next;
  }
  const fields = { ...patch, updatedAt } as Record<string, unknown>;
  const names = Object.keys(fields);
  try {
    const result = await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { workspace, leadId },
        UpdateExpression: `SET ${names.map((name) => `#${name} = :${name}`).join(", ")}`,
        ExpressionAttributeNames: Object.fromEntries(names.map((name) => [`#${name}`, name])),
        ExpressionAttributeValues: Object.fromEntries(names.map((name) => [`:${name}`, fields[name]])),
        ConditionExpression: "attribute_exists(leadId)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return (result.Attributes as Lead) ?? null;
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") return null;
    throw error;
  }
}

export async function deleteLead(workspace: string, leadId: string): Promise<void> {
  if (!db) {
    memory.delete(memoryKey(workspace, leadId));
    return;
  }
  await db.send(new DeleteCommand({ TableName: TABLE, Key: { workspace, leadId } }));
}
