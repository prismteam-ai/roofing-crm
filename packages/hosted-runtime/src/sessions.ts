import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { type ReviewSession, AccessError } from "./access.ts";
import { DomainError } from "../../contracts/src/index";
const active = (signal?: AbortSignal) => {
  if (signal?.aborted)
    throw new DomainError(
      "QUERY_TIMEOUT",
      "Session deadline exceeded before dispatch",
    );
};
export interface SessionStore {
  put(session: ReviewSession, signal?: AbortSignal): Promise<void>;
  get(id: string, signal?: AbortSignal): Promise<ReviewSession | null>;
  revoke(id: string, signal?: AbortSignal): Promise<void>;
}
export class MemorySessionStore implements SessionStore {
  private readonly values = new Map<string, ReviewSession>();
  async put(session: ReviewSession, signal?: AbortSignal) {
    active(signal);
    this.values.set(session.id, session);
  }
  async get(id: string, signal?: AbortSignal) {
    active(signal);
    return this.values.get(id) ?? null;
  }
  async revoke(id: string, signal?: AbortSignal) {
    active(signal);
    this.values.delete(id);
  }
}
export class DynamoSessionStore implements SessionStore {
  constructor(
    private readonly client: Pick<DynamoDBDocumentClient, "send">,
    private readonly tableName: string,
  ) {}
  async put(session: ReviewSession, signal?: AbortSignal) {
    active(signal);
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: `session#${session.id}`, sk: "session", ...session },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
      { abortSignal: signal },
    );
  }
  async get(id: string, signal?: AbortSignal) {
    active(signal);
    const out = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: `session#${id}`, sk: "session" },
        ConsistentRead: true,
      }),
      { abortSignal: signal },
    );
    if (!out.Item) return null;
    const s = out.Item as ReviewSession;
    if (
      s.id !== id ||
      s.workspaceId !== "review" ||
      !Number.isInteger(s.expiresAt)
    )
      throw new AccessError(401, "Session rejected");
    return { id: s.id, workspaceId: s.workspaceId, expiresAt: s.expiresAt };
  }
  async revoke(id: string, signal?: AbortSignal) {
    active(signal);
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk: `session#${id}`, sk: "session" },
      }),
      { abortSignal: signal },
    );
  }
}
