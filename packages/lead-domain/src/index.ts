import {
  storedLead,
  type AuditedLead as Lead,
  type LeadMutationContext,
} from "./audit";
import { boundedLead } from "./limits";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  DomainError,
  LeadCreateSchema,
  LeadUpdateSchema,
} from "../../contracts/src/index";
type Row = {
  id: string;
  session_id: string;
  property_id: string;
  snapshot_id: string;
  idempotency_key: string;
  status: string;
  version: number;
  events: string;
};
function decode(row: Row): Lead {
  return storedLead({
    id: row.id,
    sessionId: row.session_id,
    propertyId: row.property_id,
    snapshotId: row.snapshot_id,
    status: row.status,
    version: row.version,
    events: JSON.parse(row.events) as unknown,
  });
}
/** Isolated local demo persistence. Session namespaces are not production authentication. */
export class LeadStore {
  private db: DatabaseSync;
  constructor(
    file = "data/leads.sqlite",
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(
      "PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, property_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, events TEXT NOT NULL, UNIQUE(session_id,idempotency_key), UNIQUE(session_id,property_id,snapshot_id)); CREATE TABLE IF NOT EXISTS lead_requests(session_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,lead_id TEXT NOT NULL,PRIMARY KEY(session_id,idempotency_key)); INSERT OR IGNORE INTO lead_requests SELECT session_id,idempotency_key,id FROM leads;",
    );
  }
  list(sessionId: string): Lead[] {
    if (!sessionId || sessionId.length > 100)
      throw new DomainError(
        "INVALID_INPUT",
        "A local demo session is required",
      );
    return (
      this.db
        .prepare("SELECT * FROM leads WHERE session_id=? ORDER BY rowid DESC")
        .all(sessionId) as Row[]
    ).map(decode);
  }
  private atomic<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  create(
    input: unknown,
    _signal?: AbortSignal,
    _guard?: () => void,
    context?: LeadMutationContext,
  ): Lead {
    const x = LeadCreateSchema.parse(input);
    return this.atomic(() => {
      const byKey = this.db
        .prepare(
          "SELECT l.* FROM lead_requests r JOIN leads l ON l.id=r.lead_id AND l.session_id=r.session_id WHERE r.session_id=? AND r.idempotency_key=?",
        )
        .get(x.sessionId, x.idempotencyKey) as Row | undefined;
      if (byKey) {
        if (
          byKey.property_id !== x.propertyId ||
          byKey.snapshot_id !== x.snapshotId
        )
          throw new DomainError(
            "CONFLICT",
            "Idempotency key already belongs to another selection",
          );
        return decode(byKey);
      }
      const old = this.db
        .prepare(
          "SELECT * FROM leads WHERE session_id=? AND property_id=? AND snapshot_id=?",
        )
        .get(x.sessionId, x.propertyId, x.snapshotId) as Row | undefined;
      if (old) {
        this.db
          .prepare("INSERT INTO lead_requests VALUES (?,?,?)")
          .run(x.sessionId, x.idempotencyKey, old.id);
        return decode(old);
      }
      const id =
        "lead-" +
        createHash("sha256")
          .update(JSON.stringify([x.sessionId, x.propertyId, x.snapshotId]))
          .digest("hex")
          .slice(0, 20);
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
            at: this.clock(),
            ...(context?.actorSessionId
              ? { actorSessionId: context.actorSessionId }
              : {}),
          },
        ],
      };
      this.db
        .prepare("INSERT INTO leads VALUES (?,?,?,?,?,?,?,?)")
        .run(
          id,
          x.sessionId,
          x.propertyId,
          x.snapshotId,
          x.idempotencyKey,
          lead.status,
          1,
          JSON.stringify(lead.events),
        );
      this.db
        .prepare("INSERT INTO lead_requests VALUES (?,?,?)")
        .run(x.sessionId, x.idempotencyKey, id);
      return lead;
    });
  }
  update(
    id: string,
    input: unknown,
    _signal?: AbortSignal,
    _guard?: () => void,
    context?: LeadMutationContext,
  ): Lead {
    const x = LeadUpdateSchema.parse({
      ...(input as Record<string, unknown>),
      id,
    });
    const row = this.db
      .prepare("SELECT * FROM leads WHERE id=? AND session_id=?")
      .get(id, x.sessionId) as Row | undefined;
    if (!row)
      throw new DomainError(
        "NOT_AUTHORIZED",
        "Lead is not available in this demo session",
      );
    const old = decode(row);
    if (old.version !== x.expectedVersion)
      throw new DomainError("CONFLICT", "Lead changed. Reload before saving.");
    if (x.status === undefined && !x.note?.trim())
      throw new DomainError("INVALID_INPUT", "No lead change was supplied");
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
    const changed = this.db
      .prepare(
        "UPDATE leads SET status=?,version=?,events=? WHERE id=? AND session_id=? AND version=?",
      )
      .run(
        lead.status,
        lead.version,
        JSON.stringify(lead.events),
        id,
        x.sessionId,
        x.expectedVersion,
      );
    if (Number(changed.changes) !== 1)
      throw new DomainError("CONFLICT", "Lead changed while saving");
    return lead;
  }
  close(): void {
    this.db.close();
  }
}
