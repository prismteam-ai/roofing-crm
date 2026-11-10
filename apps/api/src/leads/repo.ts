import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  haversineMiles,
  leadSchema,
  type Lead,
  type LeadCreate,
  type LeadFilter,
  type LeadStatus,
} from '@roofing/shared';

type Row = {
  id: string;
  workspace_id: string;
  pin14: string;
  address: string;
  lat: number;
  lon: number;
  roof_age_years: number | null;
  permit_id: string | null;
  permit_status: string | null;
  permit_is_open: number;
  open_days: number | null;
  status: LeadStatus;
  notes: string;
  created_at: string;
  updated_at: string;
};

const toLead = (r: Row): Lead =>
  leadSchema.parse({
    id: r.id,
    workspaceId: r.workspace_id,
    pin14: r.pin14,
    address: r.address,
    lat: r.lat,
    lon: r.lon,
    roofAgeYears: r.roof_age_years,
    permitId: r.permit_id,
    permitStatus: r.permit_status,
    permitIsOpen: r.permit_is_open === 1,
    openDays: r.open_days,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

/** Leads in SQLite, scoped by workspaceId (per-browser id sent in a header). */
export class LeadsRepo {
  private readonly db: Database.Database;
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, pin14 TEXT NOT NULL, address TEXT NOT NULL,
      lat REAL NOT NULL, lon REAL NOT NULL, roof_age_years REAL, permit_id TEXT, permit_status TEXT,
      permit_is_open INTEGER NOT NULL DEFAULT 0, open_days INTEGER,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','lost')),
      notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, pin14, permit_id)
    ); CREATE INDEX IF NOT EXISTS leads_ws ON leads (workspace_id);`);
  }

  list(workspaceId: string, filter: LeadFilter = {}): Lead[] {
    const rows = this.db
      .prepare('SELECT * FROM leads WHERE workspace_id = ? ORDER BY created_at DESC')
      .all(workspaceId) as Row[];
    // ponytail: filter in JS; a workspace holds tens of leads, not millions.
    return rows.map(toLead).filter((l) => {
      if (filter.status && l.status !== filter.status) return false;
      if (filter.minRoofAge !== undefined && (l.roofAgeYears ?? -1) < filter.minRoofAge)
        return false;
      if (filter.openPermitsOnly && !l.permitIsOpen) return false;
      if (filter.minOpenYears !== undefined && (l.openDays ?? -1) < filter.minOpenYears * 365.25)
        return false;
      if (
        filter.center &&
        haversineMiles(filter.center.lat, filter.center.lon, l.lat, l.lon) >
          filter.center.radiusMiles
      )
        return false;
      return true;
    });
  }

  /** Idempotent on (workspace, pin14, permitId): re-adding returns the existing lead. */
  create(workspaceId: string, input: LeadCreate): Lead {
    const existing = this.db
      .prepare('SELECT * FROM leads WHERE workspace_id = ? AND pin14 = ? AND permit_id IS ?')
      .get(workspaceId, input.pin14, input.permitId) as Row | undefined;
    if (existing) return toLead(existing);
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO leads (id, workspace_id, pin14, address, lat, lon, roof_age_years, permit_id, permit_status, permit_is_open, open_days, status, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`,
      )
      .run(
        id,
        workspaceId,
        input.pin14,
        input.address,
        input.lat,
        input.lon,
        input.roofAgeYears,
        input.permitId,
        input.permitStatus,
        input.permitIsOpen ? 1 : 0,
        input.openDays,
        input.notes,
        now,
        now,
      );
    return this.get(workspaceId, id)!;
  }

  get(workspaceId: string, id: string): Lead | null {
    const row = this.db
      .prepare('SELECT * FROM leads WHERE workspace_id = ? AND id = ?')
      .get(workspaceId, id) as Row | undefined;
    return row ? toLead(row) : null;
  }

  update(
    workspaceId: string,
    id: string,
    patch: { status?: LeadStatus; notes?: string },
  ): Lead | null {
    const cur = this.get(workspaceId, id);
    if (!cur) return null;
    this.db
      .prepare(
        'UPDATE leads SET status = ?, notes = ?, updated_at = ? WHERE workspace_id = ? AND id = ?',
      )
      .run(
        patch.status ?? cur.status,
        patch.notes ?? cur.notes,
        new Date().toISOString(),
        workspaceId,
        id,
      );
    return this.get(workspaceId, id);
  }

  delete(workspaceId: string, id: string): boolean {
    return (
      this.db.prepare('DELETE FROM leads WHERE workspace_id = ? AND id = ?').run(workspaceId, id)
        .changes === 1
    );
  }

  count(workspaceId: string): number {
    return (
      this.db
        .prepare('SELECT COUNT(*) AS n FROM leads WHERE workspace_id = ?')
        .get(workspaceId) as { n: number }
    ).n;
  }

  close(): void {
    this.db.close();
  }
}
